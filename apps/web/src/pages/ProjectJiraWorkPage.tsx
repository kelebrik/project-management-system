import { BarChart3, Database, History, Pencil, Sigma } from "lucide-react";
import { useState } from "react";

import { JiraAggregatesPage } from "./JiraAggregatesPage";
import { JiraAnalyticsDashboard } from "./JiraAnalyticsDashboard";
import { JiraWorkDataSections } from "./JiraWorkDataSections";
import { usePageContext } from "./PageContext";

export const JIRA_PRODUCTION_BASE_URL = "https://tasks.sberdevices.ru";

type JiraWorkView = "active" | "retro" | "data" | "aggregates";

export function ProjectJiraWorkPage() {
  const { currentUser, isClosedProject, project } = usePageContext();
  const [view, setView] = useState<JiraWorkView>("active");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const dashboardVisible = view === "active" || view === "retro";
  const dashboardEditing = editingProjectId === project.id;
  const canEditWidgets = currentUser?.role === "ADMIN" && !isClosedProject;

  return (
    <article className="jira-work-page">
      <div className="jira-work-page-head">
        <div>
          <h2>Работы в Jira</h2>
          <p>Аналитика потока и контроль работ</p>
        </div>
        <div className="jira-work-page-actions">
          {dashboardVisible && canEditWidgets && !dashboardEditing && (
            <button
              type="button"
              className="button"
              onClick={() => setEditingProjectId(project.id)}
            >
              <Pencil size={16} /> Редактировать
            </button>
          )}
          <div className="jira-work-view-switch" aria-label="Раздел Работы в Jira">
            <button
              type="button"
              className={view === "active" ? "active" : ""}
              onClick={() => setView("active")}
            >
              <BarChart3 size={16} /> В работе
            </button>
            <button
              type="button"
              className={view === "retro" ? "active" : ""}
              onClick={() => setView("retro")}
            >
              <History size={16} /> Ретро
            </button>
            <button
              type="button"
              className={view === "data" ? "active" : ""}
              onClick={() => setView("data")}
            >
              <Database size={16} /> Данные Jira
            </button>
            <button
              type="button"
              className={view === "aggregates" ? "active" : ""}
              onClick={() => setView("aggregates")}
            >
              <Sigma size={16} /> Агрегаты
            </button>
          </div>
        </div>
      </div>

      {view === "data" ? <JiraWorkDataSections /> : null}
      {view === "aggregates" ? <JiraAggregatesPage /> : null}
      {view === "active" || view === "retro"
        ? (
            <JiraAnalyticsDashboard
              editing={dashboardEditing}
              onEditingChange={(editing) => setEditingProjectId(editing ? project.id : null)}
              section={view}
            />
          )
        : null}
    </article>
  );
}
