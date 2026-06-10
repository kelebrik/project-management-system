import type { NextFunction, Request, Response } from 'express';
import {
  apiTokenHasPermission,
  currentApiToken,
  currentUser,
  type PermissionName,
  userHasPermission,
} from './auth.js';
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
    return 'admin.jira';
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

export async function writePermissionMiddleware(req: Request, res: Response, next: NextFunction) {
  if (isReadRequest(req)) {
    next();
    return;
  }
  const requiredPermission = writePermissionForPath(req.path, req.method);
  if (!requiredPermission) {
    next();
    return;
  }
  const user = currentUser(req);
  const apiToken = currentApiToken(req);
  if (!user && !apiToken) {
    res.status(401).json({ error: 'Требуется вход в систему' });
    return;
  }
  if (apiToken && apiTokenHasPermission(apiToken, requiredPermission)) {
    next();
    return;
  }
  if (!user || !(await userHasPermission(user, requiredPermission))) {
    res.status(403).json({ error: 'Недостаточно прав' });
    return;
  }
  next();
}
