import { prisma } from '../../db.js';

export function sanitizeProjectUiState(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  return value;
}

export async function wouldCreateProjectCycle(
  projectId: string,
  nextParentId: string | null | undefined,
) {
  let cursor = nextParentId;
  while (cursor) {
    if (cursor === projectId) {
      return true;
    }
    const parent = await prisma.project.findUnique({
      where: { id: cursor },
      select: { parentId: true },
    });
    cursor = parent?.parentId ?? null;
  }
  return false;
}
