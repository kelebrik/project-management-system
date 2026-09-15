export type ArtifactColumn = { id: string; title: string };
export type ArtifactFile = { id: string; name: string };
export type ArtifactRow = { id: string; date: string; cells: Record<string, string>; files: Record<string, ArtifactFile[]> };
export type ArtifactTable = { revision: number; columns: ArtifactColumn[]; rows: ArtifactRow[] };
export const artifactId = () => crypto.randomUUID();
export const emptyArtifactRow = (): ArtifactRow => ({ id: artifactId(), date: '', cells: {}, files: {} });
export function artifactLinks(text: string): string[] {
  return [...new Set((text.match(/https?:\/\/[^\s<>"']+/giu) ?? []).map(value => value.replace(/[.,;!?)]*$/u, '')).filter(value => {
    try { return ['http:', 'https:'].includes(new URL(value).protocol); } catch { return false; }
  }))];
}
