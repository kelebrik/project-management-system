import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { readableProjectWhere } from '../server/business-units.js';

const searchQuerySchema = z.object({
  q: z.string().trim().min(2),
  projectId: z.string().trim().optional(),
  types: z.string().trim().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

type SearchResult = {
  type: string;
  id: string;
  projectId: string | null;
  projectCode: string | null;
  projectName: string | null;
  title: string;
  subtitle: string;
  url: string;
  updatedAt: Date;
};

function contains(q: string) {
  return { contains: q, mode: Prisma.QueryMode.insensitive };
}

function projectUrl(projectCode: string | null, suffix: string) {
  return projectCode ? `/${encodeURIComponent(projectCode)}/${suffix}` : `/${suffix}`;
}

function allowedTypes(value: string | undefined) {
  if (!value) return new Set(['project', 'wbs', 'issue', 'risk', 'artifact', 'overview', 'decision']);
  return new Set(
    value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  );
}

export function createSearchRouter() {
  const router = Router();

  router.get('/search', async (req, res) => {
    const parsed = searchQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.flatten() });
      return;
    }

    const { q, projectId, limit } = parsed.data;
    const types = allowedTypes(parsed.data.types);
    const results: SearchResult[] = [];
    const projectScope = await readableProjectWhere(req);
    if (projectId) {
      const readable = await prisma.project.findFirst({
        where: { AND: [{ id: projectId }, projectScope] },
        select: { id: true },
      });
      if (!readable) {
        res.json([]);
        return;
      }
    }

    if (types.has('project')) {
      const projects = await prisma.project.findMany({
        where: {
          AND: [projectScope, ...(projectId ? [{ id: projectId }] : [])],
          OR: [
            { code: contains(q) },
            { name: contains(q) },
            { portfolio: contains(q) },
            { sponsor: contains(q) },
            { projectManager: contains(q) },
            { summary: contains(q) },
          ],
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...projects.map((project) => ({
          type: 'project',
          id: project.id,
          projectId: project.id,
          projectCode: project.code,
          projectName: project.name,
          title: `${project.code} ${project.name}`,
          subtitle: `РП: ${project.projectManager} / статус: ${project.status}`,
          url: projectUrl(project.code, 'overview'),
          updatedAt: project.updatedAt,
        })),
      );
    }

    if (types.has('wbs')) {
      const items = await prisma.wbsItem.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          project: projectScope,
          OR: [
            { code: contains(q) },
            { title: contains(q) },
            { owner: contains(q) },
            { jiraTicketKey: contains(q) },
            { jiraTicketUrl: contains(q) },
            { description: contains(q) },
          ],
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...items.map((item) => ({
          type: 'wbs',
          id: item.id,
          projectId: item.projectId,
          projectCode: item.project.code,
          projectName: item.project.name,
          title: `${item.code} ${item.title}`,
          subtitle: `Структура / ${item.owner || 'исполнитель не задан'}`,
          url: projectUrl(item.project.code, 'wbs'),
          updatedAt: item.updatedAt,
        })),
      );
    }

    if (types.has('issue') || types.has('decision')) {
      const issues = await prisma.issue.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          project: projectScope,
          ...(types.has('decision') && !types.has('issue') ? { decisionRequired: true } : {}),
          OR: [
            { title: contains(q) },
            { owner: contains(q) },
            { impact: contains(q) },
            { jiraTicketKey: contains(q) },
            { jiraTicketUrl: contains(q) },
            { jiraLinks: { some: { OR: [{ jiraKey: contains(q) }, { jiraUrl: contains(q) }] } } },
          ],
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...issues.map((issue) => ({
          type: issue.decisionRequired ? 'decision' : 'issue',
          id: issue.id,
          projectId: issue.projectId,
          projectCode: issue.project.code,
          projectName: issue.project.name,
          title: issue.title,
          subtitle: `Открытый вопрос / ${issue.owner || 'ответственный не задан'}`,
          url: projectUrl(issue.project.code, 'issues'),
          updatedAt: issue.updatedAt,
        })),
      );
    }

    if (types.has('risk')) {
      const risks = await prisma.raidItem.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          project: projectScope,
          OR: [
            { title: contains(q) },
            { description: contains(q) },
            { owner: contains(q) },
            { mitigationPlan: contains(q) },
            { contingencyPlan: contains(q) },
            { jiraTicketKey: contains(q) },
            { jiraTicketUrl: contains(q) },
          ],
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...risks.map((risk) => ({
          type: 'risk',
          id: risk.id,
          projectId: risk.projectId,
          projectCode: risk.project.code,
          projectName: risk.project.name,
          title: risk.title,
          subtitle: `Риски и проблемы / оценка ${risk.riskScore}`,
          url: projectUrl(risk.project.code, 'risks'),
          updatedAt: risk.updatedAt,
        })),
      );
    }

    if (types.has('artifact')) {
      // Filter in PostgreSQL and return only bounded search snippets, never whole table JSON.
      const readable = await prisma.project.findMany({ where: { AND: [projectScope, ...(projectId ? [{ id: projectId }] : [])] }, select: { id: true } });
      if (readable.length) {
        const matches = await prisma.$queryRaw<Array<{ id: string; projectId: string; code: string; name: string; title: string; date: string; updatedAt: Date }>>`
          SELECT r.value->>'id' AS id, t."projectId", p.code, p.name,
            left(coalesce(nullif(c.text, ''), r.value->>'date', 'Artifact'), 200) AS title,
            r.value->>'date' AS date, t."updatedAt"
          FROM "ProjectArtifactTable" t JOIN "Project" p ON p.id = t."projectId"
          CROSS JOIN LATERAL jsonb_array_elements(t.rows) r(value)
          CROSS JOIN LATERAL (SELECT string_agg(value, ' ') AS text FROM jsonb_each_text(r.value->'cells')) c
          CROSS JOIN LATERAL (SELECT string_agg(f.value->>'name', ' ') AS text FROM jsonb_each(r.value->'files') e CROSS JOIN LATERAL jsonb_array_elements(e.value) f(value)) a
          WHERE t."projectId" IN (${Prisma.join(readable.map(project => project.id))})
            AND position(lower(${q}) IN lower(concat(r.value->>'date', ' ', c.text, ' ', a.text))) > 0
          ORDER BY t."updatedAt" DESC, r.value->>'id' LIMIT ${limit}
        `;
        results.push(...matches.map(match => ({ type: 'artifact', id: match.id, projectId: match.projectId,
          projectCode: match.code, projectName: match.name, title: match.title, subtitle: match.date,
          url: projectUrl(match.code, 'artifacts'), updatedAt: match.updatedAt })));
      }
      const artifacts = await prisma.projectArtifact.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          project: { ...projectScope, artifactTable: { is: null } },
          OR: [
            { title: contains(q) },
            { type: contains(q) },
            { owner: contains(q) },
            { status: contains(q) },
            { url: contains(q) },
            { description: contains(q) },
          ],
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...artifacts.map((artifact) => ({
          type: 'artifact',
          id: artifact.id,
          projectId: artifact.projectId,
          projectCode: artifact.project.code,
          projectName: artifact.project.name,
          title: artifact.title,
          subtitle: `Артефакт / ${artifact.type}`,
          url: projectUrl(artifact.project.code, 'artifacts'),
          updatedAt: artifact.updatedAt,
        })),
      );
    }

    if (types.has('overview')) {
      const overviews = await prisma.executiveOverview.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          project: projectScope,
          executiveSummary: contains(q),
        },
        include: { project: { select: { code: true, name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...overviews.map((overview) => ({
          type: 'overview',
          id: overview.id,
          projectId: overview.projectId,
          projectCode: overview.project.code,
          projectName: overview.project.name,
          title: `Обзор v${overview.version}`,
          subtitle: overview.status,
          url: projectUrl(overview.project.code, 'overview'),
          updatedAt: overview.updatedAt,
        })),
      );
    }

    results.sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
    res.json(results.slice(0, limit));
  });

  return router;
}
