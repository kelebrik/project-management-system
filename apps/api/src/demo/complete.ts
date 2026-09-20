import type { PrismaClient, Project } from '@prisma/client';
import { fillDocuments } from './documents.js';
import { demoId, fillProject } from './project.js';
import { isPublicDemoMode } from '../server/auth.js';
import { fillAnalytics } from './analytics.js';

export async function completeDemoData(client: PrismaClient) {
  if (!isPublicDemoMode()) throw new Error('Demo runtime is required for demo population');
  if (process.env.SEED_DEMO_DATA !== 'true') throw new Error('SEED_DEMO_DATA=true is required for demo population');
  // The explicit demo flag scopes this to the demo database. Existing DEMO-005
  // and other user-created demo projects must be included, not just seed codes.
  const projects = await client.project.findMany({ orderBy: { code: 'asc' } });
  for (const project of projects) await completeDemoProject(client, project);
}

// The caller must authorize demo-only writes (the seed flag or admin + cloud demo).
export async function completeDemoProject(client: PrismaClient, project: Project) {
  if (!isPublicDemoMode()) throw new Error('Demo runtime is required for demo population');
  const anchor = await client.wbsItem.findUnique({ where: { id: demoId(project.id, 'phase-0') }, select: { createdAt: true } });
  const projectBase = new Date(anchor?.createdAt ?? new Date()); projectBase.setUTCHours(0, 0, 0, 0);
  await client.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`demo:${project.id}`}))::text`;
    await fillProject(tx, project, projectBase);
    await fillDocuments(tx, project, projectBase);
  }, { timeout: 300_000 });
  await fillAnalytics(client, project, new Date());
  console.log(`Demo completed: ${project.code}`);
}
