import { useI18n } from "../i18n/I18nProvider";
import type { Translator } from "../i18n/types";
import type { createDomainLabels } from "../i18n/domainLabels";
import { useMemo } from "react";
import type { ProjectListItem } from "../app/domainTypes";

import { createProjectWorkProgress } from "../app/projectWorkProgress";
import { getActiveProjects } from "../app/portfolioModels";
import type { ProjectSectionView } from "../app/routes";
import { ListToolbar } from "../components/ListToolbar";
import { usePersistedViewState } from "../app/usePersistedViewState";

type SortKey = "code" | "name" | "status" | "target";

function sortOptions(t: Translator): { key: SortKey; label: string }[] { return [
  { key: "code", label: t("fields.code") },
  { key: "name", label: t("fields.title") },
  { key: "status", label: t("fields.status") },
  { key: "target", label: t("registry.target") },
]; }

const MAX_PASSPORT_FIELDS = 5;

function compactPassportRows(project: ProjectListItem, t: Translator, { projectHealthLabel, projectStatusLabel }: ReturnType<typeof createDomainLabels>) {
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

type ProjectsOverviewProps = {
  date: (value: string | Date | null) => string;
  projects: ProjectListItem[];
  selectProject: (projectId: string, nextView?: ProjectSectionView) => void;
};

export function ProjectsOverview({
  date,
  projects,
  selectProject,
}: ProjectsOverviewProps) {
  const { t, labels } = useI18n();
  const { projectStatusLabel } = labels;
  const [sortKey, setSortKey] = usePersistedViewState<SortKey>("pms:projects-overview:sort-key", "code");
  const [sortDir, setSortDir] = usePersistedViewState<"asc" | "desc">("pms:projects-overview:sort-dir", "asc");
  const [query, setQuery] = usePersistedViewState("pms:projects-overview:query", "");

  const sortedItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = getActiveProjects(projects).filter((project) => !normalizedQuery || [project.code, project.name, project.projectManager, project.sponsor].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));
    const direction = sortDir === "asc" ? 1 : -1;
    const valueOf = (project: ProjectListItem) => {
      switch (sortKey) {
        case "name":
          return (project.name ?? "").toLowerCase();
        case "status":
          return project.status ?? "";
        case "target":
          return project.targetDate ?? "";
        default:
          return (project.code ?? "").toLowerCase();
      }
    };
    return [...items].sort((a, b) => {
      const av = valueOf(a);
      const bv = valueOf(b);
      if (av < bv) return -1 * direction;
      if (av > bv) return 1 * direction;
      return 0;
    });
  }, [projects, query, sortKey, sortDir]);

  if (sortedItems.length === 0) return <><ListToolbar label={t("registry.search")} query={query} onQueryChange={setQuery} /><div className="empty-state compact"><strong>{query.trim() ? t("registry.notFound") : t("registry.empty")}</strong><span>{query.trim() ? t("registry.searchHelp") : t("registry.emptyHelp")}</span>{query.trim() && <button type="button" onClick={() => setQuery("")}>{t("fields.clearSearch")}</button>}</div></>;

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  return (
    <>
      <ListToolbar label={t("registry.search")} query={query} onQueryChange={setQuery}>
        <div className="projects-overview-toolbar" role="group" aria-label={t("registry.sort")}>
          <span>{t("registry.sortBy")}</span>
          {sortOptions(t).map((option) => <button type="button" key={option.key} className={sortKey === option.key ? "active" : ""} aria-pressed={sortKey === option.key} onClick={() => onSort(option.key)}>{option.label}{sortKey === option.key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}</button>)}
        </div>
      </ListToolbar>
      <div className="projects-overview-grid">
        {sortedItems.map((project) => {
        const passportRows = compactPassportRows(project, t, labels);
        const workProgress = createProjectWorkProgress(project.wbsItems ?? []);
        const progressLabel = workProgress.totalDays > 0
          ? t("registry.progress", { completed: workProgress.completedPercent, inProgress: workProgress.inProgressPercent, notStarted: workProgress.notStartedPercent })
          : t("registry.noProgress");
        return (
          <button
            type="button"
            className="projects-overview-card"
            key={project.id}
            onClick={() => selectProject(project.id, "project-passport")}
          >
            <span className={`projects-overview-rag ${project.rag.toLowerCase()}`} />
            <span className="projects-overview-main">
              <span className="projects-overview-code">{project.code}</span>
              <b>{project.name}</b>
            </span>
            <span className="projects-overview-meta">
              <span>{projectStatusLabel(project.status)}</span>
              <span>{project.projectManager}</span>
              <span>{t("registry.target")} {date(project.targetDate)}</span>
            </span>
            <span className="projects-overview-work-progress">
              <em>{t("fields.progress")}</em>
              {workProgress.totalDays > 0 ? (
                <>
                  <span
                    className="project-work-progress-bar"
                    role="img"
                    aria-label={progressLabel}
                    title={progressLabel}
                  >
                    <i
                      className="completed"
                      style={{ width: `${workProgress.completedPercent}%` }}
                    />
                    <i
                      className="in-progress"
                      style={{ width: `${workProgress.inProgressPercent}%` }}
                    />
                    <i
                      className="not-started"
                      style={{ width: `${workProgress.notStartedPercent}%` }}
                    />
                  </span>
                  <small className="project-work-progress-legend">
                    <span className="completed">{workProgress.completedPercent}%</span>
                    <span className="in-progress">{workProgress.inProgressPercent}%</span>
                    <span className="not-started">{workProgress.notStartedPercent}%</span>
                  </small>
                </>
              ) : (
                <small className="project-work-progress-empty">{t("registry.noData")}</small>
              )}
            </span>
            <span className="projects-overview-passport">
              {passportRows.map((row) => (
                <span key={row.id}>
                  <em>{row.field}</em>
                  <strong>{row.description}</strong>
                </span>
              ))}
              {passportRows.length === 0 && (
                <span>
                  <em>{t("registry.charter")}</em>
                  <strong>{t("registry.noCharter")}</strong>
                </span>
              )}
            </span>
          </button>
        );
        })}
      </div>
    </>
  );
}
