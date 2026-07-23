import type { ProjectFormState } from "./formState";

export type ProjectStructureCopyOption = {
  id: string;
  code: string;
  name: string;
  businessUnit: { id: string; name: string };
  phases: Array<{ id: string; code: string; title: string }>;
};

export type ProjectStructureCopySelection =
  ProjectFormState["copyCurrentStructureFrom"][number];

export function toggleWholeProjectSelection(
  selections: ProjectStructureCopySelection[],
  projectId: string,
  selected: boolean,
) {
  const remaining = selections.filter((item) => item.projectId !== projectId);
  return selected ? [...remaining, { projectId, phaseIds: null }] : remaining;
}

export function togglePhaseSelection(
  selections: ProjectStructureCopySelection[],
  projectId: string,
  phaseId: string,
  selected: boolean,
) {
  const current = selections.find((item) => item.projectId === projectId);
  if (current?.phaseIds === null) return selections;
  const phaseIds = new Set(current?.phaseIds ?? []);
  if (selected) phaseIds.add(phaseId);
  else phaseIds.delete(phaseId);
  const remaining = selections.filter((item) => item.projectId !== projectId);
  return phaseIds.size > 0
    ? [...remaining, { projectId, phaseIds: [...phaseIds] }]
    : remaining;
}

export function filterProjectStructureCopyOptions(
  options: ProjectStructureCopyOption[],
  query: string,
) {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru");
  if (!normalizedQuery) return options;
  return options
    .map((project) => {
      const projectMatches = `${project.code} ${project.name}`
        .toLocaleLowerCase("ru")
        .includes(normalizedQuery);
      const phases = projectMatches
        ? project.phases
        : project.phases.filter((phase) =>
            `${phase.code} ${phase.title}`
              .toLocaleLowerCase("ru")
              .includes(normalizedQuery),
          );
      return projectMatches || phases.length > 0 ? { ...project, phases } : null;
    })
    .filter((project): project is ProjectStructureCopyOption => project !== null);
}
