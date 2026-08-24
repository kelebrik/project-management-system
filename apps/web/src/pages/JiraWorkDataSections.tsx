import { RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import { JiraCapacitySampler } from "./JiraCapacitySampler";
import { usePageContext } from "./PageContext";

type JiraScopeType = "LABEL" | "EPIC";

function scopeValueIsValid(type: JiraScopeType, value: string) {
  const normalized = value.trim();
  return type === "LABEL"
    ? normalized.length > 0 && !/[\s"'\\]/.test(normalized)
    : /^[A-Za-z][A-Za-z0-9_]*-\d+$/.test(normalized);
}

export function JiraWorkDataSections({
  canClear,
  clearing,
  dataRevision,
  onClearData,
}: {
  canClear: boolean;
  clearing: boolean;
  dataRevision: number;
  onClearData: () => void;
}) {
  const {
    currentUser,
    isClosedProject,
    project,
    syncJira,
    syncing,
  } = usePageContext();
  const [scopeDraft, setScopeDraft] = useState<{
    projectId: string;
    type: JiraScopeType;
    value: string;
  }>({
    projectId: project.id,
    type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL",
    value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
  });

  const scope = scopeDraft.projectId === project.id
    ? scopeDraft
    : {
        projectId: project.id,
        type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL" as JiraScopeType,
        value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
      };
  const canEditScope = currentUser?.role === "ADMIN" && !isClosedProject;
  const scopeValueValid = scopeValueIsValid(scope.type, scope.value);

  return (
    <div className="jira-work-data-view">
      <section className="jira-data-scope-panel">
        <header>
          <h3>Область синхронизации Jira</h3>
        </header>
        <div className="jira-data-scope-controls">
          <label>
            <span>Отбор тикетов</span>
            <select
              aria-label="Способ отбора тикетов"
              disabled={!canEditScope}
              value={scope.type}
              onChange={(event) => setScopeDraft({
                projectId: project.id,
                type: event.target.value as JiraScopeType,
                value: "",
              })}
            >
              <option value="LABEL">Лейбл</option>
              <option value="EPIC">Код эпика</option>
            </select>
          </label>
          <label className="jira-data-scope-value">
            <span>{scope.type === "LABEL" ? "Лейбл" : "Код эпика"}</span>
            <input
              aria-label={scope.type === "LABEL" ? "Лейбл Jira" : "Код эпика Jira"}
              disabled={!canEditScope}
              maxLength={100}
              placeholder={scope.type === "LABEL" ? "cvte968" : "CVTE-1234"}
              value={scope.value}
              onChange={(event) => setScopeDraft({ ...scope, value: event.target.value })}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() => syncJira({
              baseUrl: "https://tasks.sberdevices.ru",
              scopeType: scope.type,
              scopeValue: scope.value.trim(),
            })}
            disabled={syncing || clearing || !scopeValueValid}
          >
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? "Обновляю..." : "Обновить"}
          </button>
          {canClear && (
            <button
              type="button"
              className="button"
              onClick={onClearData}
              disabled={syncing || clearing}
            >
              <Trash2 size={16} /> {clearing ? "Очищаю..." : "Очистить"}
            </button>
          )}
        </div>
      </section>

      <JiraCapacitySampler key={`${project.id}:${dataRevision}`} />
    </div>
  );
}
