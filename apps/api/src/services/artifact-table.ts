import type { Prisma } from '@prisma/client';

export type ArtifactRowData = { id: string; date: string; cells: Record<string, string>; files: Record<string, { id: string; name: string }[]> };
export function artifactRows(rows: Prisma.JsonValue): ArtifactRowData[] { return Array.isArray(rows) ? rows as unknown as ArtifactRowData[] : []; }
export function artifactRowText(row: ArtifactRowData) {
  return [row.date, ...Object.values(row.cells), ...Object.values(row.files).flat().map(file => file.name)].join('\n');
}
export function referencedArtifactFiles(rows: Prisma.JsonValue): string[] {
  return [...new Set(artifactRows(rows).flatMap(row => Object.values(row.files).flat().map(file => file.id)))];
}
export const lockArtifactProject = (tx: Prisma.TransactionClient, projectId: string) => tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`artifact-table:${projectId}`}))::text`;

export async function cleanStagedArtifactFiles(tx: Prisma.TransactionClient, projectId: string) {
  const table = await tx.projectArtifactTable.findUnique({ where: { projectId }, select: { rows: true } });
  await tx.projectArtifactFile.deleteMany({ where: { projectId, createdAt: { lt: new Date(Date.now() - 86400000) }, id: { notIn: table ? referencedArtifactFiles(table.rows) : [] } } });
}
