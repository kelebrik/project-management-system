import { BarChart3, Database } from "lucide-react";
import { useState } from "react";

import { JiraAnalyticsDashboard } from "./JiraAnalyticsDashboard";
import { JiraWorkDataSections } from "./JiraWorkDataSections";

export const JIRA_PRODUCTION_BASE_URL = "https://tasks.sberdevices.ru";

type JiraWorkView = "analytics" | "data";

export function ProjectJiraWorkPage() {
  const [view, setView] = useState<JiraWorkView>("analytics");

  return (
    <article className="jira-work-page">
      <div className="jira-work-page-head">
        <div>
          <h2>Работы в Jira</h2>
          <p>Аналитика потока и контроль работ</p>
        </div>
        <div className="jira-work-view-switch" aria-label="Раздел Работы в Jira">
          <button
            type="button"
            className={view === "analytics" ? "active" : ""}
            onClick={() => setView("analytics")}
          >
            <BarChart3 size={16} /> Дашборды
          </button>
          <button
            type="button"
            className={view === "data" ? "active" : ""}
            onClick={() => setView("data")}
          >
            <Database size={16} /> Данные Jira
          </button>
        </div>
      </div>

      {view === "analytics" ? <JiraAnalyticsDashboard /> : <JiraWorkDataSections />}
    </article>
  );
}
