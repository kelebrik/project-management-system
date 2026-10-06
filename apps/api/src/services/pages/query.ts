import { createHash } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  combinePageValues,
  evaluatePageQuery,
  resolvePageWidgetQuery,
  type PageDatasetRow,
  type PageQueryResult,
  type PageScope,
  type PageSourceKey,
  type PageWidget,
} from '@pms/shared';
import { prisma } from '../../db.js';
import { PAGE_SOURCE_ADAPTERS } from './registry.js';
import { PAGE_SOURCE_ROW_LIMIT, PageSourceLimitError, pageDay, type PageProjectRef } from './sources.js';

/**
 * Answers all widgets of a page in one go. The scope is narrowed to the open
 * projects the person may read; each source is loaded once per scope however
 * many widgets ask it, and kept for a minute so a page that refreshes or a
 * person who flips the period does not load it again ("Refresh" skips it).
 * The rows depend only on the set of projects, which is already narrowed to
 * what the person may read, so the set is the whole key.
 */

export const PAGE_QUERY_LIMIT = 30;
/** A scope of more open projects than this is refused: it is the whole company, not a page. */
export const PAGE_SCOPE_PROJECT_LIMIT = 2_000;
const CACHE_MS = 60_000;
const CACHE_ENTRIES = 40;

export type PageQueryItem = { id: string; widget: Pick<PageWidget, 'type' | 'data' | 'formula'>; scope?: PageScope };
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

async function rowsOf(source: PageSourceKey, projects: PageProjectRef[], now: Date, fresh: boolean, rowLimit: number) {
  const adapter = PAGE_SOURCE_ADAPTERS[source];
  if (!adapter) throw new Error(`Источник «${source}» пока недоступен`);
  const today = pageDay(now)!;
  const key = `${cacheKey(source, projects, today)}|${rowLimit}`;
  const hit = cache.get(key);
  if (hit && !fresh && now.getTime() - hit.at < CACHE_MS) return hit.rows;
  const rows = adapter({ projects, now, today }).then((loaded) => {
    // More rows than a page reads: numbers and groups are refused, a table may show the first ones.
    if (loaded.length > rowLimit) throw new PageSourceLimitError(source, loaded.slice(0, rowLimit));
    return loaded;
  });
  cache.set(key, { at: now.getTime(), rows });
  // A failed load is not kept.
  rows.catch(() => cache.delete(key));
  while (cache.size > CACHE_ENTRIES) cache.delete(cache.keys().next().value!);
  return rows;
}

/** The open projects of a scope that the person may read, in the registry's order. */
export class PageScopeTooLargeError extends Error {
  readonly code = 'PAGE_SCOPE_TOO_LARGE';
  constructor() {
    super(`В охвате больше ${PAGE_SCOPE_PROJECT_LIMIT} открытых проектов — выберите портфели или проекты`);
  }
}

export async function pageScopeProjects(readable: Prisma.ProjectWhereInput, scope: PageScope): Promise<PageProjectRef[]> {
  const narrowed: Prisma.ProjectWhereInput =
    scope.mode === 'projects' ? { id: { in: scope.projectIds } } : scope.mode === 'portfolio' ? { portfolio: { in: scope.portfolios } } : {};
  const projects = await prisma.project.findMany({
    where: { AND: [readable, narrowed, { status: { not: 'CLOSED' } }] },
    select: { id: true, code: true, name: true, portfolio: true },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    take: PAGE_SCOPE_PROJECT_LIMIT + 1,
  });
  if (projects.length > PAGE_SCOPE_PROJECT_LIMIT) throw new PageScopeTooLargeError();
  return projects;
}

const scopeKey = (scope: PageScope) => JSON.stringify(scope);

/** `rowLimit` is the source row limit; tests lower it. */
export async function runPageQueries(readable: Prisma.ProjectWhereInput, request: PageQueryRequest, now = new Date(), rowLimit = PAGE_SOURCE_ROW_LIMIT) {
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
        results[item.id] = { kind: 'error', code: 'PAGE_METRIC_GONE', error: resolved.error, warnings: [] };
        return;
      }
      try {
        const projects = item.scope ? await projectsOf(item.scope) : pageProjects;
        const rows = await rowsOf(resolved.spec.source, projects, now, Boolean(request.fresh), rowLimit);
        const result = evaluatePageQuery(rows, resolved.spec, { today, periodDays: request.periodDays });
        // A number made of two metrics: the other one is answered the same way, then they are combined.
        const formula = item.widget.formula;
        if (formula && result.kind === 'value') {
          const other = resolvePageWidgetQuery({ type: 'kpi', data: formula.data });
          if (!other || 'error' in other) {
            results[item.id] = { kind: 'error', code: 'PAGE_METRIC_GONE', error: other && 'error' in other ? other.error : 'Нет второго показателя', warnings: [] };
            return;
          }
          const otherRows = await rowsOf(other.spec.source, projects, now, Boolean(request.fresh), rowLimit);
          const otherResult = evaluatePageQuery(otherRows, { ...other.spec, compare: false }, { today, periodDays: request.periodDays });
          if (otherResult.kind !== 'value') {
            results[item.id] = otherResult;
            return;
          }
          results[item.id] = { kind: 'value', value: combinePageValues(result.value, otherResult.value, formula.op), rowCount: result.rowCount, warnings: result.warnings };
          return;
        }
        results[item.id] = result;
      } catch (error) {
        if (error instanceof PageSourceLimitError && error.partial && resolved.spec.output === 'rows') {
          const partial = evaluatePageQuery(error.partial, resolved.spec, { today, periodDays: request.periodDays });
          results[item.id] = partial.kind === 'rows' ? { ...partial, truncated: true, warnings: [...partial.warnings, error.message] } : partial;
          return;
        }
        // A scope too large is the request's fault, whichever widget names it: the whole request is refused.
        if (error instanceof PageSourceLimitError) {
          results[item.id] = { kind: 'error', code: 'PAGE_SOURCE_TOO_LARGE', error: error.message, warnings: [] };
          return;
        }
        if (!(error instanceof Error && error.message.startsWith('Источник'))) throw error;
        results[item.id] = { kind: 'error', code: 'PAGE_SOURCE_MISSING', error: error.message, warnings: [] };
      }
    }),
  );
  // Every project any widget read: the page's scope and the widgets' own scopes.
  const used = new Set<string>();
  for (const scoped of await Promise.all(scopes.values())) for (const project of scoped) used.add(project.id);
  return {
    today,
    generatedAt: now.toISOString(),
    projects: pageProjects.map((project) => ({ id: project.id, code: project.code, name: project.name })),
    usedProjectIds: [...used],
    results,
  };
}
