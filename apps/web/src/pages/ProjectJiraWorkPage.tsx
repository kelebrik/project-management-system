import { BarChart3, Database, History, Sigma } from "lucide-react";
import { useState } from "react";

import { apiClient } from "../api/client";
import { useConfirm } from "../hooks/useConfirm";
import { JiraAggregatesPage } from "./JiraAggregatesPage";
import { JiraAnalyticsDashboard } from "./JiraAnalyticsDashboard";
import { JiraWorkDataSections } from "./JiraWorkDataSections";
import { usePageContext } from "./PageContext";

export const JIRA_PRODUCTION_BASE_URL = "https://tasks.sberdevices.ru";

type JiraWorkView = "active" | "retro" | "data" | "aggregates";

export function ProjectJiraWorkPage() {
  const {
    currentUser,
    isClosedProject,
    project,
    setError,
    setNotice,
    syncing,
  } = usePageContext();
  const confirm = useConfirm();
  const [view, setView] = useState<JiraWorkView>("active");
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [clearingProjectId, setClearingProjectId] = useState<string | null>(null);
  const [jiraDataRevision, setJiraDataRevision] = useState(0);
  const dashboardEditing = editingProjectId === project.id;
  const clearing = clearingProjectId === project.id;
  const canEditWidgets = currentUser?.role === "ADMIN" && !isClosedProject;

  const clearJiraData = async () => {
    if (!canEditWidgets || syncing || clearing) return;
    const approved = await confirm({
      title: "Очистить данные Jira проекта?",
      message:
        `Будут удалены все загруженные тикеты и их история только для проекта «${project.code} · ${project.name}». `
        + "Настройки отбора и дашборды сохранятся. Для восстановления данных потребуется снова нажать «Обновить».",
      confirmLabel: "Очистить данные",
      tone: "danger",
    });
    if (!approved) return;
    setClearingProjectId(project.id);
    setError(null);
    try {
      const result = await apiClient.delete<{
        ticketsDeleted: number;
        versionsDeleted: number;
      }>(
        `/api/projects/${project.id}/jira/data`,
        "Не удалось очистить данные Jira проекта",
      );
      setJiraDataRevision((revision) => revision + 1);
      setNotice(
        `Данные Jira проекта очищены: тикетов ${result.ticketsDeleted}, версий истории ${result.versionsDeleted}.`,
      );
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось очистить данные Jira проекта");
    } finally {
      setClearingProjectId(null);
    }
  };

  return (
    <article className="jira-work-page">
      <div className="jira-work-page-head">
        <div>
          <h2>Работы в Jira</h2>
          <p>Аналитика потока и контроль работ</p>
        </div>
        <div className="jira-work-page-actions">
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

      {view === "data" ? (
        <JiraWorkDataSections
          canClear={canEditWidgets}
          clearing={clearing}
          dataRevision={jiraDataRevision}
          onClearData={() => void clearJiraData()}
        />
      ) : null}
      {view === "aggregates" ? <JiraAggregatesPage /> : null}
      {view === "active" || view === "retro"
        ? (
            <JiraAnalyticsDashboard
              canClear={canEditWidgets}
              editing={dashboardEditing}
              clearing={clearing}
              dataRevision={jiraDataRevision}
              onClearData={() => void clearJiraData()}
              onEditingChange={(editing) => setEditingProjectId(editing ? project.id : null)}
              onStartEditing={() => setEditingProjectId(project.id)}
              section={view}
            />
          )
        : null}
    </article>
  );
}
