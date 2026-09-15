import { useI18n } from "../i18n/I18nProvider";
import {
  BriefcaseBusiness,
} from "lucide-react";

import { usePageContext } from "./PageContext";
import { ListToolbar } from "../components/ListToolbar";
import { usePersistedViewState } from "../app/usePersistedViewState";

export function ProjectChangesPage() {
  const { t } = useI18n();
  const { overviewDashboard, project } = usePageContext();
  const [query, setQuery] = usePersistedViewState(`pms:changes:${project.id}:query`, "");
  const normalizedQuery = query.trim().toLowerCase();
  const changes = overviewDashboard.scheduleDeltaItems.filter(({ item }) => !normalizedQuery || [item.code, item.title, item.owner].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));
  return (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>{t("changes.title")}</h2>
                      <p>
                        {t("changes.description")}
                      </p>
                    </div>
                  </div>
                  <div className="module-summary-grid">
                    <div className="metric-card">
                      <span>{t("changes.requests")}</span>
                      <b>{project.changeRequests.length}</b>
                      <small>{t("changes.workflow")}</small>
                    </div>
                    <div className="metric-card">
                      <span>{t("changes.decisions")}</span>
                      <b>
                        {
                          project.issues.filter(
                            (issue) =>
                              issue.decisionRequired && issue.status !== "Closed",
                          ).length
                        }
                      </b>
                      <small>{t("changes.decisionsHelp")}</small>
                    </div>
                    <div className="metric-card">
                      <span>{t("changes.baseline")}</span>
                      <b>{overviewDashboard.scheduleDeltaItems.length}</b>
                      <small>{t("changes.sources")}</small>
                    </div>
                  </div>
                  <ListToolbar label={t("changes.search")} query={query} onQueryChange={setQuery} />
                  <div className="module-table">
                    <div className="module-table-head">
                      <span>{t("changes.object")}</span>
                      <span>{t("changes.type")}</span>
                      <span>{t("changes.impact")}</span>
                      <span>{t("fields.owner")}</span>
                    </div>
                    {changes.map(({ item, delay }) => (
                      <div className="module-table-row" key={item.id}>
                        <b>
                          {item.code} {item.title}
                        </b>
                        <span>{t("changes.shift")}</span>
                        <span>{t("changes.days", { count: delay })}</span>
                        <span>{item.owner || t("fields.unassigned")}</span>
                      </div>
                    ))}
                    {changes.length === 0 && (
                      <div className="empty-state"><strong>{normalizedQuery ? t("changes.noResults") : t("changes.empty")}</strong><span>{normalizedQuery ? t("fields.searchHelp") : t("changes.emptyHelp")}</span>{normalizedQuery && <button type="button" onClick={() => setQuery("")}>{t("fields.clearSearch")}</button>}</div>
                    )}
                  </div>
                </article>
              );
}

export function ProjectBudgetPage() {
  const { t } = useI18n();
  return (
                <article className="panel project-card project-module-page">
                  <div className="panel-title">
                    <div>
                      <h2>{t("budget.title")}</h2>
                      <p>
                        {t("budget.description")}
                      </p>
                    </div>
                  </div>
                  <div className="budget-placeholder">
                    <BriefcaseBusiness size={34} />
                    <div>
                      <b>{t("budget.ready")}</b>
                      <span>
                        {t("budget.details")}
                      </span>
                    </div>
                  </div>
                </article>
              );
}
