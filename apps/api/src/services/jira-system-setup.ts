import type { PrismaClient } from '@prisma/client';
import { logEvent } from '../server/logger.js';
import { ensureJiraSystemSemanticAggregates } from './jira-semantic-aggregates.js';

/**
 * Gives a project the current system Jira aggregates and standard widgets of
 * the code: missing ones are created and published ones receive new fields.
 * A failure is logged; the project keeps working with what it has.
 */
export async function reconcileJiraSystemSetup(client: PrismaClient, project: { id: string; code: string }) {
  try {
    await ensureJiraSystemSemanticAggregates(client, project.id);
    return true;
  } catch (error) {
    logEvent('error', 'jira.system_setup.reconcile_failed', {
      projectId: project.id,
      projectCode: project.code,
      message: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

/** On start every open project catches up with the code, including those nobody has opened. */
export async function reconcileJiraSystemSetupOnStartup(client: PrismaClient) {
  const projects = await client.project.findMany({
    where: { status: { not: 'CLOSED' } },
    select: { id: true, code: true },
    orderBy: [{ updatedAt: 'desc' }],
  });
  let failed = 0;
  for (const project of projects) {
    if (!await reconcileJiraSystemSetup(client, project)) failed += 1;
  }
  logEvent('info', 'jira.system_setup.reconciled', { projectCount: projects.length, failed });
}
