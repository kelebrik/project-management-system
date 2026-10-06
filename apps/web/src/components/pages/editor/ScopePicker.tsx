import { useState } from "react";
import type { PageScope } from "@pms/shared";
import { scopeProjectCount, type ScopeOptions } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";

export function ScopePicker({ scope, options, onChange }: { scope: PageScope; options: ScopeOptions | null; onChange: (scope: PageScope) => void }) {
  const { t } = useI18n();
  const [search, setSearch] = useState("");
  const portfolios = options?.portfolios ?? [];
  const projects = options?.projects ?? [];
  const needle = search.trim().toLocaleLowerCase();
  const chosenPortfolios = scope.mode === "portfolio" ? scope.portfolios : [];
  const chosenProjects = scope.mode === "projects" ? scope.projectIds : [];
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);
  const setPortfolios = (next: string[]) => onChange(next.length ? { mode: "portfolio", portfolios: next } : { mode: "all" });
  const setProjects = (next: string[]) => onChange(next.length ? { mode: "projects", projectIds: next } : { mode: "all" });
  const count = scopeProjectCount(scope, options);
  return (
    <fieldset className="mp-scope">
      <legend>{t("ui.pages.scope.title")}</legend>
      <div className="mp-scope-modes" role="radiogroup" aria-label={t("ui.pages.scope.title")}>
        <label><input checked={scope.mode === "all"} name="mp-scope" onChange={() => onChange({ mode: "all" })} type="radio" />{t("ui.pages.scope.all")}</label>
        <label><input checked={scope.mode === "portfolio"} disabled={portfolios.length === 0} name="mp-scope" onChange={() => setPortfolios(portfolios.slice(0, 1))} type="radio" />{t("ui.pages.scope.portfolio")}</label>
        <label><input checked={scope.mode === "projects"} disabled={projects.length === 0} name="mp-scope" onChange={() => setProjects(projects.slice(0, 1).map((project) => project.id))} type="radio" />{t("ui.pages.scope.projects")}</label>
      </div>
      {scope.mode === "portfolio" && (
        <div className="mp-scope-list">
          {portfolios.map((portfolio) => (
            <label key={portfolio}><input checked={chosenPortfolios.includes(portfolio)} onChange={() => setPortfolios(toggle(chosenPortfolios, portfolio))} type="checkbox" />{portfolio}</label>
          ))}
        </div>
      )}
      {scope.mode === "projects" && (
        <>
          <input aria-label={t("ui.pages.scope.find")} onChange={(event) => setSearch(event.target.value)} placeholder={t("ui.pages.scope.find")} type="search" value={search} />
          <div className="mp-scope-list">
            {projects
              .filter((project) => !needle || `${project.code} ${project.name}`.toLocaleLowerCase().includes(needle) || chosenProjects.includes(project.id))
              .map((project) => (
                <label key={project.id}>
                  <input checked={chosenProjects.includes(project.id)} disabled={!chosenProjects.includes(project.id) && chosenProjects.length >= 200} onChange={() => setProjects(toggle(chosenProjects, project.id))} type="checkbox" />
                  <b>{project.code}</b> {project.name}
                </label>
              ))}
          </div>
        </>
      )}
      {count !== null && <p className={`mp-hint ${count === 0 ? "mp-warn" : ""}`}>{count === 0 ? t("ui.pages.scope.none") : t("ui.pages.scope.count", { count })}</p>}
    </fieldset>
  );
}
