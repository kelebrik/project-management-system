import { useI18n } from "../i18n/I18nProvider";
import type { Translator } from "../i18n/types";
import { useMemo } from "react";
import type { ProjectListItem } from "../app/domainTypes";

import { getActiveProjects } from "../app/portfolioModels";
import type { ProjectSectionView } from "../app/routes";
import { ListToolbar } from "../components/ListToolbar";
import { usePersistedViewState } from "../app/usePersistedViewState";
import { ProjectProgressBoard } from "../components/portfolio/ProjectProgressBoard";

type SortKey = "code" | "name" | "status" | "target";

function sortOptions(t: Translator): { key: SortKey; label: string }[] { return [
  { key: "code", label: t("fields.code") },
  { key: "name", label: t("fields.title") },
  { key: "status", label: t("fields.status") },
  { key: "target", label: t("registry.target") },
]; }


type ProjectsOverviewProps = {
  projects: ProjectListItem[];
  selectProject: (projectId: string, nextView?: ProjectSectionView) => void;
};

export function ProjectsOverview({
  projects,
  selectProject,
}: ProjectsOverviewProps) {
  const { t } = useI18n();
  const [sortKey, setSortKey] = usePersistedViewState<SortKey>("pms:projects-overview:sort-key", "code");
  const [sortDir, setSortDir] = usePersistedViewState<"asc" | "desc">("pms:projects-overview:sort-dir", "asc");
  const [query, setQuery] = usePersistedViewState("pms:projects-overview:query", "");

  const sortedItems = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const items = getActiveProjects(projects).filter((project) => !normalizedQuery || [project.code, project.name, project.projectManager, project.sponsor, project.productOwner, project.hwTpm, project.swTpm].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));
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
      {/* The same picture as the portfolio's progress; every project opens its passport, as the cards did. */}
      <ProjectProgressBoard
        projects={sortedItems}
        onOpenProject={(projectId) => selectProject(projectId, "project-passport")}
        onOpenPassport={(projectId) => selectProject(projectId, "project-passport")}
      />
    </>
  );
}
