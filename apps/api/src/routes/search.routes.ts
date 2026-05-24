import { Prisma } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';

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

    if (types.has('project')) {
      const projects = await prisma.project.findMany({
        where: {
          ...(projectId ? { id: projectId } : {}),
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
          OR: [
            { code: contains(q) },
            { title: contains(q) },
            { owner: contains(q) },
            { jiraTicketKey: contains(q) },
            { jiraTicketUrl: contains(q) },
            { description: contains(q) },
          ],
        },
        include: { project: { select: { code: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...items.map((item) => ({
          type: 'wbs',
          id: item.id,
          projectId: item.projectId,
          projectCode: item.project.code,
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
        include: { project: { select: { code: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...issues.map((issue) => ({
          type: issue.decisionRequired ? 'decision' : 'issue',
          id: issue.id,
          projectId: issue.projectId,
          projectCode: issue.project.code,
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
        include: { project: { select: { code: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...risks.map((risk) => ({
          type: 'risk',
          id: risk.id,
          projectId: risk.projectId,
          projectCode: risk.project.code,
          title: risk.title,
          subtitle: `Риски и проблемы / оценка ${risk.riskScore}`,
          url: projectUrl(risk.project.code, 'risks'),
          updatedAt: risk.updatedAt,
        })),
      );
    }

    if (types.has('artifact')) {
      const artifacts = await prisma.projectArtifact.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          OR: [
            { title: contains(q) },
            { type: contains(q) },
            { owner: contains(q) },
            { status: contains(q) },
            { url: contains(q) },
            { description: contains(q) },
          ],
        },
        include: { project: { select: { code: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...artifacts.map((artifact) => ({
          type: 'artifact',
          id: artifact.id,
          projectId: artifact.projectId,
          projectCode: artifact.project.code,
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
          executiveSummary: contains(q),
        },
        include: { project: { select: { code: true } } },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });
      results.push(
        ...overviews.map((overview) => ({
          type: 'overview',
          id: overview.id,
          projectId: overview.projectId,
          projectCode: overview.project.code,
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
