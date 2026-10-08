import type { ProjectListItem } from "./domainTypes";
import type { createDomainLabels } from "../i18n/domainLabels";
import type { Translator } from "../i18n/types";

/** At most this many passport fields are shown in a project's summary. */
const MAX_PASSPORT_FIELDS = 5;

/**
 * The passport fields of a project's summary (on the project cards and next
 * to the Portfolio's progress): the rows its passport was set up with, or the
 * sponsor, manager, status and RAG; empty fields are skipped.
 */
export function compactPassportRows(project: ProjectListItem, t: Translator, { projectHealthLabel, projectStatusLabel }: ReturnType<typeof createDomainLabels>) {
  const savedRows = Array.isArray(project.uiState?.passportRows)
    ? project.uiState.passportRows
    : [];
  const rows =
    savedRows.length > 0
      ? savedRows
      : [
          { id: "sponsor", field: t("fields.sponsor"), description: project.sponsor },
          { id: "projectManager", field: t("fields.pm"), description: project.projectManager },
          { id: "status", field: t("fields.status"), description: projectStatusLabel(project.status) },
          { id: "rag", field: t("fields.rag"), description: projectHealthLabel(project.rag) },
        ];

  return rows
    .filter((row) => row.id !== "targetDate" && row.id !== "portfolio")
    .map((row) => ({
      id: row.id,
      field: String(row.field ?? "").trim(),
      description: String(row.description ?? "").trim(),
    }))
    .filter((row) => row.field.length > 0 && row.description.length > 0)
    .slice(0, MAX_PASSPORT_FIELDS);
}
