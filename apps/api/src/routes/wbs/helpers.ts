import { prisma } from '../../db.js';
import { jiraUrlMatchesConfiguredBase } from '../../jira-url-policy.js';
import { levelFromWbsCode } from '../../services/wbs.js';

export function closedAtForWbsStatus(
  nextStatus: string | undefined,
  current?: { status: string; closedAt: Date | null },
) {
  if (nextStatus === undefined) return undefined;
  if (nextStatus === 'DONE') {
    return current?.closedAt ?? new Date();
  }
  if (current?.status === 'DONE') return null;
  return undefined;
}

export async function validateWbsProjectAndParent(
  projectId: string,
  parentId: string | null | undefined,
  jiraTicketUrl: string | null | undefined,
) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { jiraIntegration: true },
  });

  if (!project) {
    return { error: 'Проект не найден' as const };
  }

  if (parentId) {
    const parent = await prisma.wbsItem.findUnique({
      where: { id: parentId },
    });
    if (!parent || parent.projectId !== project.id) {
      return { error: 'Родительский элемент Структуры не найден в этом проекте' as const };
    }
  }

  if (jiraTicketUrl && !jiraTicketUrl.startsWith('https://')) {
    return { error: 'Ссылка Jira должна начинаться с https://' as const };
  }

  const jiraBaseUrl = project.jiraIntegration?.baseUrl;
  if (jiraBaseUrl && jiraTicketUrl && !jiraUrlMatchesConfiguredBase(jiraTicketUrl, jiraBaseUrl)) {
    return { error: `URL Jira должен начинаться с ${jiraBaseUrl}` as const };
  }

  return { project };
}

export async function wouldCreateWbsCycle(
  itemId: string,
  nextParentId: string | null | undefined,
) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === itemId) {
      return true;
    }
    const parent = await prisma.wbsItem.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}

export async function wouldCreateDependencyCycle(
  projectId: string,
  predecessorId: string,
  successorId: string,
  ignoredDependencyId?: string,
) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: {
      projectId,
      ...(ignoredDependencyId ? { id: { not: ignoredDependencyId } } : {}),
    },
    select: { predecessorId: true, successorId: true },
  });
  const graph = new Map<string, string[]>();
  for (const dependency of dependencies) {
    const next = graph.get(dependency.predecessorId) ?? [];
    next.push(dependency.successorId);
    graph.set(dependency.predecessorId, next);
  }
  graph.set(predecessorId, [...(graph.get(predecessorId) ?? []), successorId]);

  const seen = new Set<string>();
  const stack = [successorId];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || seen.has(current)) continue;
    if (current === predecessorId) return true;
    seen.add(current);
    stack.push(...(graph.get(current) ?? []));
  }
  return false;
}

export async function dependencyLimitExceeded(
  projectId: string,
  successorId: string,
  predecessorId: string,
  ignoredDependencyId?: string,
) {
  const dependencies = await prisma.wbsDependency.findMany({
    where: {
      projectId,
      successorId,
      ...(ignoredDependencyId ? { id: { not: ignoredDependencyId } } : {}),
    },
    select: { predecessorId: true },
  });
  const uniquePredecessors = new Set(dependencies.map((dependency) => dependency.predecessorId));
  uniquePredecessors.add(predecessorId);
  return uniquePredecessors.size > 6;
}

export async function collectDescendantLevelUpdates(existing: {
  id: string;
  projectId: string;
}) {
  const projectItems = await prisma.wbsItem.findMany({
    where: { projectId: existing.projectId },
    select: { id: true, parentId: true, code: true, wbsLevel: true },
  });
  const childrenByParent = new Map<string, typeof projectItems>();
  for (const item of projectItems) {
    if (!item.parentId) continue;
    childrenByParent.set(item.parentId, [...(childrenByParent.get(item.parentId) ?? []), item]);
  }

  const descendantUpdates: Array<{ id: string; wbsLevel: number }> = [];
  const collectDescendants = (parentId: string) => {
    for (const child of childrenByParent.get(parentId) ?? []) {
      const currentLevel = child.wbsLevel ?? levelFromWbsCode(child.code);
      descendantUpdates.push({ id: child.id, wbsLevel: Math.max(1, currentLevel - 1) });
      collectDescendants(child.id);
    }
  };
  collectDescendants(existing.id);
  return descendantUpdates;
}
