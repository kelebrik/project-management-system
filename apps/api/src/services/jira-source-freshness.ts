import type { Prisma } from '@prisma/client';

const FRESH_FOR_MS = 86_400_000;

/**
 * Whether a change prepared from a synced Jira ticket still rests on the same
 * ticket version: the row still points at the ticket, the snapshot is the one
 * the proposal saw, it is current and was synced within a day. Read inside the
 * transaction that applies the change. Jira itself is not called.
 */
export async function jiraSourceIsFresh(
  tx: Prisma.TransactionClient,
  projectId: string,
  item: { jiraTicketKey: string | null },
  expected: { key: string; updatedAt: string },
  now = Date.now(),
) {
  if (item.jiraTicketKey?.trim().toUpperCase() !== expected.key) return false;
  const source = await tx.jiraIssueSnapshot.findUnique({ where: { projectId_issueKey: { projectId, issueKey: expected.key } } });
  return Boolean(
    source && !source.retiredAt && !source.projectionUnversionedSince && source.updatedAt.toISOString() === expected.updatedAt && now - source.syncedAt.getTime() <= FRESH_FOR_MS,
  );
}
