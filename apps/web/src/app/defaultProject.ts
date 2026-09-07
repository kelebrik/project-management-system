type ProjectCandidate = {
  status: string;
  _count?: { wbsItems?: number };
  wbsItems: readonly unknown[];
};

export function pickDefaultProject<T extends ProjectCandidate>(projects: readonly T[]): T | undefined {
  const openProjects = projects.filter((project) => project.status !== "CLOSED");
  const candidates = openProjects.length > 0 ? openProjects : projects;
  // Older API versions omit the total; their WBS list is the best available fallback.
  const size = (project: T) => project._count?.wbsItems ?? project.wbsItems.length;
  return candidates.reduce<T | undefined>(
    (largest, project) => !largest || size(project) > size(largest) ? project : largest,
    undefined,
  );
}
