import type { NextFunction, Request, Response } from 'express';
import {
  apiTokenHasPermission,
  currentApiToken,
  currentUser,
  type AuthRequest,
  type CurrentUser,
  type PermissionName,
  userHasPermission,
} from './auth.js';
import { projectIdForWritePath, userCanWriteProject } from './project-access.js';
import { isReadRequest } from './project-write-guards.js';

export function writePermissionForPath(pathname: string, method: string): PermissionName | null {
  if (
    pathname.startsWith('/admin/integrations') ||
    pathname.startsWith('/admin/api-tokens') ||
    pathname.startsWith('/admin/webhooks')
  ) {
    return 'admin.integrations';
  }
  if (pathname.startsWith('/admin/role-permissions')) {
    return 'admin.roles';
  }
  if (pathname.startsWith('/admin/dictionary-items')) {
    return 'admin.dictionaries';
  }
  if (pathname.startsWith('/admin/system-settings')) {
    return 'admin.config';
  }
  if (pathname.startsWith('/admin/project-modules')) {
    return 'admin.modules';
  }
  if (pathname.startsWith('/admin/project-access')) {
    return 'admin.project_access';
  }
  if (pathname.startsWith('/admin/config/import')) {
    return 'admin.config';
  }
  if (pathname.startsWith('/admin')) {
    return 'admin.config';
  }
  if (pathname.startsWith('/users')) {
    return 'admin.users';
  }
  if (pathname.startsWith('/wbs-items') || pathname.startsWith('/wbs-dependencies')) {
    if (pathname.startsWith('/wbs-dependencies')) {
      return 'wbs.dependency';
    }
    if (method === 'DELETE') {
      return 'wbs.delete';
    }
    return 'wbs.update';
  }
  if (pathname.startsWith('/open-issues') || pathname.startsWith('/tasks')) {
    if (method === 'DELETE') {
      return 'issue.delete';
    }
    return 'issue.update';
  }
  if (pathname.startsWith('/raid-items') || pathname.startsWith('/change-requests')) {
    if (method === 'DELETE') {
      return 'raid.delete';
    }
    return 'raid.update';
  }
  if (pathname.startsWith('/executive-overviews')) {
    return 'overview.publish';
  }
  if (!pathname.startsWith('/projects')) {
    return null;
  }
  if (
    pathname.includes('/wbs-items') ||
    pathname.includes('/wbs-dependencies') ||
    pathname.includes('/wbs-snapshot') ||
    pathname.includes('/wbs-baseline') ||
    pathname.includes('/calendar-overrides')
  ) {
    if (pathname.includes('/wbs-baseline')) {
      return 'wbs.baseline';
    }
    if (pathname.includes('/wbs-dependencies')) {
      return 'wbs.dependency';
    }
    if (method === 'POST') {
      return 'wbs.create';
    }
    if (method === 'DELETE') {
      return 'wbs.delete';
    }
    return 'wbs.update';
  }
  if (pathname.includes('/open-issues')) {
    if (method === 'POST') {
      return 'issue.create';
    }
    if (method === 'DELETE') {
      return 'issue.delete';
    }
    if (pathname.includes('/close')) {
      return 'issue.close';
    }
    return 'issue.update';
  }
  if (pathname.includes('/raid-items') || pathname.includes('/change-requests')) {
    if (method === 'POST') {
      return 'raid.create';
    }
    if (method === 'DELETE') {
      return 'raid.delete';
    }
    if (pathname.includes('/status-updates') || pathname.includes('/close')) {
      return 'raid.close';
    }
    return 'raid.update';
  }
  if (pathname.includes('/executive-overviews')) {
    return 'overview.publish';
  }
  if (pathname.endsWith('/close')) {
    return 'project.close';
  }
  if (pathname === '/projects' && method === 'POST') {
    return 'project.create';
  }
  if (method === 'DELETE') {
    return 'project.delete';
  }
  return 'project.update';
}

type WritePermissionDecision =
  | { ok: true }
  | { ok: false; status: 401 | 403; error: string };

type WritePermissionContext = {
  user: CurrentUser | null;
  apiToken: AuthRequest['apiToken'] | null;
  pathname: string;
  method: string;
};

type WritePermissionDependencies = {
  projectIdForWritePath: (pathname: string) => Promise<string | null>;
  userCanWriteProject: (userId: string, projectId: string) => Promise<boolean>;
  userHasPermission: (user: CurrentUser, permission: PermissionName) => Promise<boolean>;
  apiTokenHasPermission: (token: AuthRequest['apiToken'], permission: PermissionName) => boolean;
};

export async function canProceedWithWrite(
  context: WritePermissionContext,
  dependencies: WritePermissionDependencies = {
    projectIdForWritePath,
    userCanWriteProject,
    userHasPermission,
    apiTokenHasPermission,
  },
): Promise<WritePermissionDecision> {
  const requiredPermission = writePermissionForPath(context.pathname, context.method);
  if (!requiredPermission) {
    return { ok: true };
  }
  if (!context.user && !context.apiToken) {
    return { ok: false, status: 401, error: 'Требуется вход в систему' };
  }
  if (context.apiToken && dependencies.apiTokenHasPermission(context.apiToken, requiredPermission)) {
    return { ok: true };
  }
  if (context.user && context.user.role !== 'ADMIN') {
    const projectId = await dependencies.projectIdForWritePath(context.pathname);
    if (projectId) {
      if (await dependencies.userCanWriteProject(context.user.id, projectId)) {
        return { ok: true };
      }
      return { ok: false, status: 403, error: 'Нет доступа на изменение этого проекта' };
    }
  }
  if (!context.user || !(await dependencies.userHasPermission(context.user, requiredPermission))) {
    return { ok: false, status: 403, error: 'Недостаточно прав' };
  }
  return { ok: true };
}

export async function writePermissionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const decision = await canProceedWithWrite({
    user: currentUser(req),
    apiToken: currentApiToken(req),
    pathname: req.path,
    method: req.method,
  });
  if (!decision.ok) {
    res.status(decision.status).json({ error: decision.error });
    return;
  }
  next();
}
