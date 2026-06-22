import type { Express, Request, Response } from 'express';
import { prisma } from '../db.js';
import { ensureProjectWriteAccess } from './project-access.js';

export function isReadRequest(req: Request) {
  return ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
}

export async function ensureProjectWritable(projectId: string, res: Response) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
  });
  if (!project) {
    res.status(404).json({ error: 'Проект не найден' });
    return null;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({
      error: 'Проект закрыт и доступен только для чтения',
    });
    return null;
  }
  return project;
}

export async function ensureEntityProjectWritable(
  projectId: string,
  res: Response,
  notFoundMessage = 'Проект не найден',
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, status: true },
  });
  if (!project) {
    res.status(404).json({ error: notFoundMessage });
    return false;
  }
  if (project.status === 'CLOSED') {
    res.status(423).json({
      error: 'Проект закрыт и доступен только для чтения',
    });
    return false;
  }
  return true;
}

function registerEntityWriteGuard(
  app: Express,
  route: string,
  paramName: string,
  notFoundMessage: string,
  findProjectId: (entityId: string) => Promise<string | null>,
) {
  app.use(route, async (req, res, next) => {
    if (isReadRequest(req)) {
      next();
      return;
    }

    const rawEntityId = req.params[paramName];
    const entityId = Array.isArray(rawEntityId) ? rawEntityId[0] : rawEntityId;
    if (!entityId) {
      res.status(404).json({ error: notFoundMessage });
      return;
    }

    const projectId = await findProjectId(entityId);
    if (!projectId) {
      res.status(404).json({ error: notFoundMessage });
      return;
    }
    if (!(await ensureEntityProjectWritable(projectId, res))) return;
    if (!(await ensureProjectWriteAccess(projectId, req, res))) return;
    next();
  });
}

export function registerClosedProjectWriteGuards(app: Express) {
  app.use('/api/projects/:projectId', async (req, res, next) => {
    if (isReadRequest(req)) {
      next();
      return;
    }
    const project = await ensureProjectWritable(req.params.projectId, res);
    if (!project) return;
    if (!(await ensureProjectWriteAccess(project.id, req, res))) return;
    next();
  });

  registerEntityWriteGuard(app, '/api/project-artifacts/:artifactId', 'artifactId', 'Artifact not found', async (id) => {
    const artifact = await prisma.projectArtifact.findUnique({
      where: { id },
      select: { projectId: true },
    });
    return artifact?.projectId ?? null;
  });

  registerEntityWriteGuard(app, '/api/raid-items/:itemId', 'itemId', 'Запись о риске не найдена', async (id) => {
    const item = await prisma.raidItem.findUnique({
      where: { id },
      select: { projectId: true },
    });
    return item?.projectId ?? null;
  });

  registerEntityWriteGuard(
    app,
    '/api/change-requests/:requestId',
    'requestId',
    'Запрос на изменение не найден',
    async (id) => {
      const request = await prisma.changeRequest.findUnique({
        where: { id },
        select: { projectId: true },
      });
      return request?.projectId ?? null;
    },
  );

  registerEntityWriteGuard(app, '/api/milestones/:milestoneId', 'milestoneId', 'Milestone not found', async (id) => {
    const milestone = await prisma.milestone.findUnique({
      where: { id },
      select: { projectId: true },
    });
    return milestone?.projectId ?? null;
  });

  registerEntityWriteGuard(app, '/api/wbs-items/:itemId', 'itemId', 'Элемент Структуры не найден', async (id) => {
    const item = await prisma.wbsItem.findUnique({
      where: { id },
      select: { projectId: true },
    });
    return item?.projectId ?? null;
  });

  registerEntityWriteGuard(
    app,
    '/api/wbs-dependencies/:dependencyId',
    'dependencyId',
    'Связь Структуры не найдена',
    async (id) => {
      const dependency = await prisma.wbsDependency.findUnique({
        where: { id },
        select: { projectId: true },
      });
      return dependency?.projectId ?? null;
    },
  );

  registerEntityWriteGuard(app, '/api/open-issues/:issueId', 'issueId', 'Открытый вопрос не найден', async (id) => {
    const issue = await prisma.issue.findUnique({
      where: { id },
      select: { projectId: true },
    });
    return issue?.projectId ?? null;
  });

  registerEntityWriteGuard(app, '/api/tasks/:taskId', 'taskId', 'Задача не найдена', async (id) => {
    const task = await prisma.task.findUnique({
      where: { id },
      select: { projectId: true },
    });
    return task?.projectId ?? null;
  });

  registerEntityWriteGuard(
    app,
    '/api/executive-overviews/:overviewId',
    'overviewId',
    'Executive overview not found',
    async (id) => {
      const overview = await prisma.executiveOverview.findUnique({
        where: { id },
        select: { projectId: true },
      });
      return overview?.projectId ?? null;
    },
  );
}
