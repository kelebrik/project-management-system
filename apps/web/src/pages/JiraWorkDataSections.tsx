import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import {
  jiraAnalyticsScopeValueIsValid,
  jiraAnalyticsScopeValueMaxLength,
  normalizeJiraAnalyticsScopeValue,
  type JiraAnalyticsScopeType,
} from "@pms/shared";
import { Play, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";

import {
  JiraCapacitySampler,
  useJiraHistoryAdminControls,
} from "./JiraCapacitySampler";
import { usePageContext } from "./PageContext";

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
  const { t: uiText } = useInterfaceTranslation();
  const {
    currentUser,
    isClosedProject,
    project,
    syncJira,
    syncing,
  } = usePageContext();
  const [scopeDraft, setScopeDraft] = useState<{
    projectId: string;
    type: JiraAnalyticsScopeType;
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
        type: project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL" as JiraAnalyticsScopeType,
        value: project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
      };
  const canEditScope = currentUser?.role === "ADMIN" && !isClosedProject;
  const scopeValueValid = jiraAnalyticsScopeValueIsValid(scope.type, scope.value);
  const history = useJiraHistoryAdminControls(dataRevision);

  return (
    <div className="jira-work-data-view">
      <section className="jira-data-scope-panel">
        <header>
          <h3>{uiText("ui.jira.jiraSyncScope")}</h3>
        </header>
        <div className="jira-data-scope-controls">
          <label>
            <span>{uiText("ui.jira.ticketSelection")}</span>
            <select
              aria-label={uiText("ui.jira.ticketSelectionMethod")}
              disabled={!canEditScope}
              value={scope.type}
              onChange={(event) => setScopeDraft({
                projectId: project.id,
                type: event.target.value as JiraAnalyticsScopeType,
                value: "",
              })}
            >
              <option value="LABEL">{uiText("ui.jira.label")}</option>
              <option value="EPIC">{uiText("ui.jira.epicCode")}</option>
            </select>
          </label>
          <label className="jira-data-scope-value">
            <span>{scope.type === "LABEL" ? uiText("ui.jira.labels") : uiText("ui.jira.epicCode")}</span>
            <input
              aria-label={scope.type === "LABEL" ? uiText("ui.jira.jiraLabelsField") : uiText("ui.jira.jiraEpicCode")}
              disabled={!canEditScope}
              maxLength={jiraAnalyticsScopeValueMaxLength}
              placeholder={scope.type === "LABEL" ? "cvte968, cvte950" : "CVTE-1234"}
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
              scopeValue: normalizeJiraAnalyticsScopeValue(scope.type, scope.value),
            })}
            disabled={!canEditScope || syncing || clearing || !scopeValueValid}
          >
            <RefreshCw size={16} className={syncing ? "spin" : ""} />
            {syncing ? uiText("ui.jira.refreshingDots") : uiText("ui.admin.refresh")}
          </button>
          {canClear && (
            <button
              type="button"
              className="button"
              onClick={onClearData}
              disabled={syncing || clearing}
            >
              <Trash2 size={16} /> {clearing ? uiText("ui.jira.clearing") : uiText("ui.jira.clear")}
            </button>
          )}
          <button
            type="button"
            className="button"
            onClick={() => void history.runBackfill()}
            disabled={!canEditScope || syncing || clearing || history.backfillRunning || history.historyStatus?.historyWrite?.enabled !== true}
          >
            <Play size={16} /> {history.backfillRunning ? uiText("ui.jira.importing") : uiText("ui.jira.fullImport")}
          </button>
          <button
            type="button"
            className="icon-button jira-data-history-refresh"
            onClick={() => void history.refresh()}
            disabled={!canEditScope || history.historyLoading}
            aria-label={uiText("ui.jira.refreshImportStatus")}
            title={uiText("ui.jira.refreshImportStatus")}
          >
            <RefreshCw size={17} className={history.historyLoading ? "spin" : ""} />
          </button>
        </div>
      </section>

      <JiraCapacitySampler key={`${project.id}:${dataRevision}`} history={history} />
    </div>
  );
}
