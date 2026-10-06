import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  evaluatePageQuery,
  resolvePageWidgetQuery,
  type PageDatasetRow,
  type PageQueryResult,
  type PageScope,
  type PageSourceKey,
  type PageWidget,
} from '@pms/shared';
import { prisma } from '../../db.js';
import { PAGE_SOURCE_ADAPTERS, PageSourceLimitError, pageDay, type PageProjectRef } from './sources.js';

/**
 * Answers all widgets of a page in one go. The scope is narrowed to the open
 * projects the person may read; each source is loaded once per scope however
 * many widgets ask it, and kept for half a minute so a page that refreshes or
 * a person who flips the period does not load it again.
 */

export const PAGE_QUERY_LIMIT = 30;
const CACHE_MS = 30_000;
const CACHE_ENTRIES = 40;

export type PageQueryItem = { id: string; widget: Pick<PageWidget, 'type' | 'data'>; scope?: PageScope };
export type PageQueryRequest = { scope: PageScope; periodDays: number; queries: PageQueryItem[]; fresh?: boolean };

type CacheEntry = { at: number; rows: Promise<PageDatasetRow[]> };
const cache = new Map<string, CacheEntry>();

export function forgetPageQueryCache() {
  cache.clear();
}

function cacheKey(source: PageSourceKey, projects: PageProjectRef[], today: string) {
  const ids = projects.map((project) => project.id).sort().join(',');
  return `${source}|${today}|${createHash('sha256').update(ids).digest('base64url')}`;
}

async function rowsOf(source: PageSourceKey, projects: PageProjectRef[], now: Date, fresh: boolean) {
  const adapter = PAGE_SOURCE_ADAPTERS[source];
  if (!adapter) throw new Error(`Источник «${source}» пока недоступен`);
  const today = pageDay(now)!;
  const key = cacheKey(source, projects, today);
  const hit = cache.get(key);
  if (hit && !fresh && now.getTime() - hit.at < CACHE_MS) return hit.rows;
  const rows = adapter({ projects, now, today });
  cache.set(key, { at: now.getTime(), rows });
  // A failed load is not kept.
  rows.catch(() => cache.delete(key));
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return rows;
}

/** The open projects of a scope that the person may read, in the registry's order. */
export async function pageScopeProjects(readable: Prisma.ProjectWhereInput, scope: PageScope): Promise<PageProjectRef[]> {
  const narrowed: Prisma.ProjectWhereInput =
    scope.mode === 'projects' ? { id: { in: scope.projectIds } } : scope.mode === 'portfolio' ? { portfolio: { in: scope.portfolios } } : {};
  return prisma.project.findMany({
    where: { AND: [readable, narrowed, { status: { not: 'CLOSED' } }] },
    select: { id: true, code: true, name: true, portfolio: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
  });
}

const scopeKey = (scope: PageScope) => JSON.stringify(scope);

export async function runPageQueries(readable: Prisma.ProjectWhereInput, request: PageQueryRequest, now = new Date()) {
  const today = pageDay(now)!;
  const scopes = new Map<string, Promise<PageProjectRef[]>>();
  const projectsOf = (scope: PageScope) => {
    const key = scopeKey(scope);
    if (!scopes.has(key)) scopes.set(key, pageScopeProjects(readable, scope));
    return scopes.get(key)!;
  };
  const pageProjects = await projectsOf(request.scope);
  const results: Record<string, PageQueryResult> = {};
  await Promise.all(
    request.queries.map(async (item) => {
      const resolved = resolvePageWidgetQuery(item.widget);
      if (!resolved) return;
      if ('error' in resolved) {
        results[item.id] = { kind: 'error', error: resolved.error, warnings: [] };
        return;
      }
      try {
        const projects = item.scope ? await projectsOf(item.scope) : pageProjects;
        const rows = await rowsOf(resolved.spec.source, projects, now, Boolean(request.fresh));
        results[item.id] = evaluatePageQuery(rows, resolved.spec, { today, periodDays: request.periodDays });
      } catch (error) {
        if (!(error instanceof PageSourceLimitError) && !(error instanceof Error && error.message.startsWith('Источник'))) throw error;
        results[item.id] = { kind: 'error', error: error.message, warnings: [] };
      }
    }),
  );
  return {
    today,
    generatedAt: now.toISOString(),
    projects: pageProjects.map((project) => ({ id: project.id, code: project.code, name: project.name })),
    results,
  };
}
