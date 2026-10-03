import type { AppStateBag } from "../app/appStateBag";
import { useCallback, useEffect, useRef, type FormEvent } from "react";
import { PUBLIC_DEMO_USER_ID } from "@pms/shared";
import { apiClient } from "../api/client";
import { effectiveProjectView, viewPatchOf, writeDemoView } from "../app/projectView";
import type { ProjectDetails, ProjectUiState } from "../app/domainTypes";
import {
  artifactToForm,
  issueToDraft,
  normalizePassportRows,
  raidToForm,
} from "../app/formState";
import { mergeWbsDrafts } from "../app/wbsDraftMerge";
import { apiBase, authenticatedFetch } from "../app/http";
import { normalizeJiraWorkSectionDrafts } from "../app/jiraWorkSections";
import { pollJiraSyncRun } from "../app/jiraSyncPolling";
import {
  GANTT_PANEL_HEIGHT_DEFAULT,
  GANTT_PANEL_WIDTH_DEFAULT,
  clampNumber,
} from "../app/ganttConfig";
import { createProjectTargetSummary } from "../app/projectTargetModel";
import { isoDate } from "../app/dateUtils";
import { buildWbsTree, collapsedWbsIdsForLevel } from "../app/wbsTree";
import {
  normalizeWbsColumnOrder,
  normalizeWbsColumnWidths,
  normalizeWbsHiddenColumns,
  normalizeWbsSort,
  type ProjectCalendarCode,
  type WbsTableColumnKey,
} from "../app/wbsTable";
import { shouldApplyProjectSnapshotAfterWbsSave } from "../wbsProjectLoadGuard";

type ProjectLifecycleActionsDeps = AppStateBag;

type JiraSyncRunState = {
  status?: string;
  pollAfterMs?: number;
  error?: string | { message?: string };
  result?: {
    synced?: number;
    configuredSections?: number;
    jiraUsers?: unknown[];
    criticalBugSlaConfigured?: boolean;
    criticalBugSlaCandidates?: number;
    criticalBugSlaIssues?: number;
    warning?: string;
    history?: {
      retriesQueued?: number;
      disabledReason?: string | null;
    };
  };
};

const JIRA_SYNC_CLIENT_POLL_MAX_MS = 15 * 60_000;

export function useProjectLifecycleActions(deps: ProjectLifecycleActionsDeps) {
  const collapsedDefaultsProjectIdRef = useRef<string | null>(null);
  const viewAppliedProjectIdRef = useRef<string | null>(null);
  const lifecycleMountedRef = useRef(true);
  useEffect(() => {
    lifecycleMountedRef.current = true;
    return () => {
      lifecycleMountedRef.current = false;
    };
  }, []);
  const {
    activeView,
    authMode,
    currentUser,
    calendarOverridesByKey,
    isDefaultWorkingDay,
    jiraForm,
    jiraWorkSectionDrafts,
    pendingWbsSaveCountRef,
    project,
    projectLoadSequenceRef,
    projectRef,
    projectTargetApprovedBy,
    projectTargetChangeReason,
    projectTargetDateDraft,
    projectTargetSummary,
    reloadAuditEvents,
    selectedProjectId,
    setActiveWbsItemId,
    setArtifactDrafts,
    setCollapsedWbsIds,
    setError,
    setExpandedArtifactId,
    setExpandedIssueId,
    setExpandedRaidId,
    setGanttPanelHeight,
    setGanttPanelWidth,
    setGanttWbsWidth,
    setIssueEditDrafts,
    setIssueLinkDrafts,
    setJiraForm,
    setJiraWorkSectionDrafts,
    setNotice,
    setPassportRows,
    setProject,
    setProjectTargetApprovedBy,
    setProjectTargetChangeReason,
    setProjectTargetDateDraft,
    setProjects,
    setRaidDrafts,
    setRaidStatusDrafts,
    setSavingCalendar,
    setSavingJira,
    setSavingJiraWorkSections,
    setSavingProjectTargetDate,
    setSelectedCalendarYear,
    setSelectedWbsIds,
    setSidebarCollapsed,
    setSyncing,
    setTaskDrafts,
    setWbsColumnOrder,
    setWbsColumnWidths,
    setWbsDrafts,
    setWbsHiddenColumns,
    setWbsRedoHistory,
    setWbsSort,
    setWbsUndoHistory,
    wbsDraftsRef,
    wbsSaveSequenceRef,
  } = deps;

async function syncJira(options: {
  baseUrl?: string;
  scopeType?: "LABEL" | "EPIC";
  scopeValue?: string;
} = {}) {
  if (!project) return;
  setSyncing(true);
  setError(null);
  try {
    await persistJiraWorkSections(project.id);
    const response = await authenticatedFetch(
      `${apiBase}/api/projects/${project.id}/jira/sync`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          baseUrl: options.baseUrl,
          scopeType:
            options.scopeType ?? project.jiraAnalyticsSettings?.jiraScopeType ?? "LABEL",
          scopeValue:
            options.scopeValue ?? project.jiraAnalyticsSettings?.jiraScopeValue ?? "",
        }),
      },
    );
    const accepted = await response.json();
    if (response.status === 409 && !accepted.statusUrl) {
      throw new Error(accepted.error ?? "Обновление Jira для этого проекта уже выполняется");
    }
    if (!response.ok && !(response.status === 409 && accepted.statusUrl)) {
      throw new Error(accepted.error ?? "Не удалось синхронизировать Jira");
    }
    if (!accepted.statusUrl) {
      throw new Error("Сервер не вернул адрес состояния синхронизации Jira");
    }
    const polling = await pollJiraSyncRun<JiraSyncRunState>({
      initialDelayMs: Number(accepted.pollAfterMs) || 3_000,
      maxDurationMs: JIRA_SYNC_CLIENT_POLL_MAX_MS,
      wait: (delayMs) => new Promise((resolve) => window.setTimeout(resolve, delayMs)),
      isCurrent: () => lifecycleMountedRef.current && projectRef.current?.id === project.id,
      poll: async () => {
        const statusResponse = await authenticatedFetch(`${apiBase}${accepted.statusUrl}`);
        const state: JiraSyncRunState = await statusResponse.json();
        if (!statusResponse.ok) {
          throw new Error(
            typeof state.error === "string"
              ? state.error
              : state.error?.message ?? "Не удалось получить состояние синхронизации Jira",
          );
        }
        return state;
      },
    });
    if (polling.outcome === "STALE") return;
    const runState = polling.state;
    if (polling.outcome === "FAILED") {
      const runError = runState?.error;
      throw new Error(
        typeof runError === "string"
          ? runError
          : runError?.message ?? "Синхронизация Jira завершилась ошибкой",
      );
    }
    if (polling.outcome === "BACKGROUND") {
      setNotice("Синхронизация Jira продолжает выполняться в фоне. Результат появится после обновления страницы.");
      return;
    }
    const result = runState?.result ?? {};
    const refreshed = await authenticatedFetch(
      `${apiBase}/api/projects/${project.id}/overview`,
    );
    if (!lifecycleMountedRef.current || projectRef.current?.id !== project.id) return;
    applyProject(await refreshed.json());
    const syncedCount =
      typeof result.synced === "number" ? result.synced : 0;
    const configuredSections =
      typeof result.configuredSections === "number"
        ? result.configuredSections
        : 0;
    const jiraUsers = Array.isArray(result.jiraUsers)
      ? result.jiraUsers.filter((user): user is string => typeof user === "string" && user.length > 0)
      : [];
    const jiraUserText =
      jiraUsers.length > 0 ? ` Запрос выполнен от: ${jiraUsers.join(", ")}.` : "";
    const criticalBugSlaConfigured = result.criticalBugSlaConfigured === true;
    const criticalBugSlaCandidates =
      typeof result.criticalBugSlaCandidates === "number" ? result.criticalBugSlaCandidates : 0;
    const criticalBugSlaIssues =
      typeof result.criticalBugSlaIssues === "number" ? result.criticalBugSlaIssues : 0;
    const slaText = criticalBugSlaConfigured
      ? ` SLA Critical/Blocker: ${criticalBugSlaIssues} багов из ${criticalBugSlaCandidates} кандидатов.`
      : " SLA Critical/Blocker не настроен: не удалось определить Jira project key.";
    const warning = typeof result.warning === "string" ? result.warning : "";
    const historyRetries = typeof result.history?.retriesQueued === "number"
      ? result.history.retriesQueued
      : 0;
    const retryText = historyRetries > 0
      ? ` В очередь повторов: ${historyRetries}.`
      : "";
    const historyText = result.history?.disabledReason === "CAPACITY_LIMIT"
      ? " История не записывалась из-за лимита ёмкости; текущие данные обновлены."
      : "";
    if (warning) {
      setNotice(`Jira: ${warning}.${historyText}`);
    } else if (configuredSections === 0) {
      setNotice(`Jira: нет разделов с заполненным фильтром.${slaText}${historyText}`);
    } else if (syncedCount === 0) {
      setNotice(
        `Jira: синхронизация выполнена, тикетов не найдено.${jiraUserText}${slaText} Проверь JQL и Browse-доступ сервисной учетки к ${options.baseUrl ?? "Jira"}`,
      );
    } else {
      setNotice(`Jira: синхронизировано тикетов: ${syncedCount}.${retryText}${jiraUserText}${slaText}${historyText}`);
    }
  } catch (syncError) {
    if (lifecycleMountedRef.current && projectRef.current?.id === project.id) {
      setError(
        syncError instanceof Error
          ? syncError.message
          : "Не удалось синхронизировать Jira",
      );
    }
  } finally {
    setSyncing(false);
  }
}

function jiraWorkSectionsPayload() {
  return {
    sections: jiraWorkSectionDrafts.map((section, index) => ({
      id: section.id ?? undefined,
      sortOrder: index,
      title: section.title.trim() || `Раздел ${index + 1}`,
      jql: section.jql.trim(),
      filterUrl: section.filterUrl.trim(),
    })),
  };
}

async function persistJiraWorkSections(projectId: string) {
  const response = await authenticatedFetch(
    `${apiBase}/api/projects/${projectId}/jira-work-sections`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(jiraWorkSectionsPayload()),
    },
  );
  const result = await response.json();
  if (!response.ok) {
    throw new Error(
      result.error?.formErrors?.join(", ") ||
        result.error ||
        "Не удалось сохранить разделы Jira",
    );
  }
}

const applyProject = useCallback(
  (nextProject: ProjectDetails) => {
    const previousProject = projectRef.current;
    projectRef.current = nextProject;
    // A refresh of the same project keeps what the user is typing; opening a
    // different project starts from its saved state.
    const nextWbsDrafts = mergeWbsDrafts({
      localDrafts: wbsDraftsRef.current,
      previous:
        previousProject?.id === nextProject.id
          ? { items: previousProject.wbsItems, dependencies: previousProject.wbsDependencies }
          : null,
      next: { items: nextProject.wbsItems, dependencies: nextProject.wbsDependencies },
    });
    wbsDraftsRef.current = nextWbsDrafts;
    setProject(nextProject);
    setProjectTargetDateDraft(
      isoDate(
        createProjectTargetSummary(nextProject)?.currentTargetDate ??
          new Date(nextProject.targetDate),
      ),
    );
    setProjectTargetChangeReason("");
    setProjectTargetApprovedBy("");
    setWbsUndoHistory([]);
    setWbsRedoHistory([]);
    // The view is this person's own (see effectiveProjectView), not the project's. It is
    // applied when a project opens, not on every reload of its data, so a reload racing a
    // layout save cannot put the old columns back.
    const viewKey = `${currentUser?.id ?? ""}:${nextProject.id}`;
    const opensProject = viewAppliedProjectIdRef.current !== viewKey;
    viewAppliedProjectIdRef.current = viewKey;
    const view = effectiveProjectView(nextProject, currentUser?.id);
    if (opensProject) {
      setSidebarCollapsed(view.sidebarCollapsed ?? false);
      setWbsColumnOrder(
        normalizeWbsColumnOrder(view.wbsColumnOrder as WbsTableColumnKey[] | undefined),
      );
      setWbsHiddenColumns(
        normalizeWbsHiddenColumns(view.wbsHiddenColumns as WbsTableColumnKey[] | undefined),
      );
      setWbsColumnWidths((current) =>
        normalizeWbsColumnWidths({
          ...current,
          ...(view.wbsColumnWidths ?? {}),
        }),
      );
      setWbsSort(normalizeWbsSort(view.wbsSort));
      setGanttWbsWidth(
        clampNumber(view.ganttWbsWidth ?? 360, 260, 640),
      );
      setGanttPanelHeight(
        clampNumber(
          view.ganttPanelHeight ?? GANTT_PANEL_HEIGHT_DEFAULT,
          320,
          900,
        ),
      );
      setGanttPanelWidth(
        view.ganttPanelWidth ?? GANTT_PANEL_WIDTH_DEFAULT,
      );
    }
    setPassportRows(normalizePassportRows(nextProject));
    setSelectedCalendarYear((currentYear) => {
      const startDate = nextProject.startDate
        ? new Date(nextProject.startDate)
        : new Date();
      const startYear = startDate.getFullYear();
      const allowedYears = [startYear, startYear + 1, startYear + 2];
      return currentYear && allowedYears.includes(currentYear)
        ? currentYear
        : startYear + 1;
    });
    setJiraForm({
      baseUrl: nextProject.jiraIntegration?.baseUrl ?? "",
      boardUrl: nextProject.jiraIntegration?.boardUrl ?? "",
      projectKey: nextProject.jiraIntegration?.projectKey ?? "",
      issuesJql: nextProject.jiraIntegration?.issuesJql ?? "",
      openIssuesJql: nextProject.jiraIntegration?.openIssuesJql ?? "",
    });
    setJiraWorkSectionDrafts(
      normalizeJiraWorkSectionDrafts(nextProject.jiraWorkSections),
    );
    setTaskDrafts(
      Object.fromEntries(
        nextProject.tasks.map((task) => [
          task.id,
          {
            jiraTicketKey: task.jiraTicketKey ?? "",
            jiraTicketUrl: task.jiraTicketUrl ?? "",
          },
        ]),
      ),
    );
    const allProjectIssues = [
      ...nextProject.issues,
      ...(nextProject.closedIssues ?? []),
    ];
    setIssueLinkDrafts(
      Object.fromEntries(
        allProjectIssues.map((issue) => [
          issue.id,
          { jiraKey: "" },
        ]),
      ),
    );
    setIssueEditDrafts(
      Object.fromEntries(
        nextProject.issues.map((issue) => [issue.id, issueToDraft(issue)]),
      ),
    );
    setExpandedIssueId((currentIssueId) =>
      allProjectIssues.some((issue) => issue.id === currentIssueId)
        ? currentIssueId
        : null,
    );
    setWbsDrafts(nextWbsDrafts);
    setActiveWbsItemId((currentItemId) =>
      nextProject.wbsItems.some((item) => item.id === currentItemId)
        ? currentItemId
        : null,
    );
    setSelectedWbsIds(
      (currentIds) =>
        new Set(
          [...currentIds].filter((itemId) =>
            nextProject.wbsItems.some((item) => item.id === itemId),
          ),
        ),
    );
    const isNewProjectForWbsDefaults =
      collapsedDefaultsProjectIdRef.current !== `${currentUser?.id ?? ""}:${nextProject.id}`;
    collapsedDefaultsProjectIdRef.current = `${currentUser?.id ?? ""}:${nextProject.id}`;
    setCollapsedWbsIds((currentIds) => {
      if (isNewProjectForWbsDefaults) {
        // The level this person last chose; none means everything open.
        const level = effectiveProjectView(nextProject, currentUser?.id).wbsHierarchyLevel;
        return level === null ? new Set<string>() : collapsedWbsIdsForLevel(buildWbsTree(nextProject.wbsItems), level ?? 1);
      }
      return new Set(
        [...currentIds].filter((itemId) =>
          nextProject.wbsItems.some((item) => item.id === itemId),
        ),
      );
    });
    setArtifactDrafts(
      Object.fromEntries(
        nextProject.artifacts.map((item) => [item.id, artifactToForm(item)]),
      ),
    );
    setExpandedArtifactId((currentArtifactId) =>
      nextProject.artifacts.some((item) => item.id === currentArtifactId)
        ? currentArtifactId
        : null,
    );
    setRaidDrafts(
      Object.fromEntries(
        nextProject.raidItems.map((item) => [item.id, raidToForm(item)]),
      ),
    );
    setRaidStatusDrafts((current) =>
      Object.fromEntries(
        nextProject.raidItems.map((item) => [
          item.id,
          current[item.id] ?? { statusAt: isoDate(new Date()), text: "" },
        ]),
      ),
    );
    setExpandedRaidId((currentRaidId) =>
      nextProject.raidItems.some((item) => item.id === currentRaidId)
        ? currentRaidId
        : null,
    );
  },
  // All of these are state setters and refs, stable between renders.
  [currentUser?.id, projectRef, setActiveWbsItemId, setArtifactDrafts, setCollapsedWbsIds, setExpandedArtifactId, setExpandedIssueId, setExpandedRaidId, setGanttPanelHeight, setGanttPanelWidth, setGanttWbsWidth, setIssueEditDrafts, setIssueLinkDrafts, setJiraForm, setJiraWorkSectionDrafts, setPassportRows, setProject, setProjectTargetApprovedBy, setProjectTargetChangeReason, setProjectTargetDateDraft, setRaidDrafts, setRaidStatusDrafts, setSelectedCalendarYear, setSelectedWbsIds, setSidebarCollapsed, setTaskDrafts, setWbsColumnOrder, setWbsColumnWidths, setWbsDrafts, setWbsHiddenColumns, setWbsRedoHistory, setWbsSort, setWbsUndoHistory, wbsDraftsRef],
);

useEffect(() => {
  if (authMode !== "ready" || !selectedProjectId) return;
  let cancelled = false;
  const loadSequence = projectLoadSequenceRef.current + 1;
  projectLoadSequenceRef.current = loadSequence;
  const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
  const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
  apiClient
    .get<ProjectDetails>(
      `/api/projects/${selectedProjectId}/overview`,
      "Не удалось загрузить проект",
    )
    .then((data: ProjectDetails) => {
      if (
        !cancelled &&
        shouldApplyProjectSnapshotAfterWbsSave({
          loadSequenceAtStart: loadSequence,
          currentLoadSequence: projectLoadSequenceRef.current,
          wbsSaveSequenceAtStart,
          currentWbsSaveSequence: wbsSaveSequenceRef.current,
          pendingWbsSavesAtStart,
          currentPendingWbsSaves: pendingWbsSaveCountRef.current,
        })
      ) {
        applyProject(data);
      }
    })
    .catch(() => setError("Не удалось загрузить проект"));
  return () => {
    cancelled = true;
  };
}, [applyProject, authMode, pendingWbsSaveCountRef, projectLoadSequenceRef, selectedProjectId, setError, wbsSaveSequenceRef]);

useEffect(() => {
  if (!selectedProjectId || activeView !== "project-overview") {
    return;
  }
  let cancelled = false;
  const loadSequence = projectLoadSequenceRef.current + 1;
  projectLoadSequenceRef.current = loadSequence;
  const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
  const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
  apiClient
    .get<ProjectDetails>(
      `/api/projects/${selectedProjectId}/overview`,
      "Не удалось обновить обзор проекта",
    )
    .then((data) => {
      if (
        !cancelled &&
        shouldApplyProjectSnapshotAfterWbsSave({
          loadSequenceAtStart: loadSequence,
          currentLoadSequence: projectLoadSequenceRef.current,
          wbsSaveSequenceAtStart,
          currentWbsSaveSequence: wbsSaveSequenceRef.current,
          pendingWbsSavesAtStart,
          currentPendingWbsSaves: pendingWbsSaveCountRef.current,
        })
      ) {
        applyProject(data);
      }
    })
    .catch((loadError) => {
      if (!cancelled) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Не удалось обновить обзор проекта",
        );
      }
    });
  return () => {
    cancelled = true;
  };
}, [activeView, applyProject, pendingWbsSaveCountRef, projectLoadSequenceRef, selectedProjectId, setError, wbsSaveSequenceRef]);

async function toggleCalendarDay(
  calendarCode: ProjectCalendarCode,
  dateValue: Date,
) {
  if (!project) return;
  const dateKey = isoDate(dateValue);
  const overrideKey = `${calendarCode}:${dateKey}`;
  const currentOverride = calendarOverridesByKey.get(overrideKey);
  const currentWorkingDay =
    currentOverride?.isWorkingDay ?? isDefaultWorkingDay(dateValue);
  setSavingCalendar(overrideKey);
  setError(null);
  setNotice(null);
  try {
    const response = await authenticatedFetch(
      `${apiBase}/api/projects/${project.id}/calendar-overrides`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          calendarCode,
          date: dateKey,
          isWorkingDay: !currentWorkingDay,
          description: !currentWorkingDay
            ? "Рабочий день"
            : "Выходной / праздничный день",
        }),
      },
    );
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      throw new Error(result?.error ?? "Не удалось сохранить календарь");
    }
    setProject((current) => {
      if (!current) return current;
      const withoutCurrent = current.calendarOverrides.filter(
        (override) =>
          !(
            override.calendarCode === calendarCode &&
            isoDate(new Date(override.date)) === dateKey
          ),
      );
      return {
        ...current,
        calendarOverrides: [...withoutCurrent, result],
      };
    });
    await refreshProject(project.id);
  } catch (calendarError) {
    setError(
      calendarError instanceof Error
        ? calendarError.message
        : "Не удалось сохранить календарь",
    );
  } finally {
    setSavingCalendar(null);
  }
}

async function refreshProject(projectId = project?.id) {
  if (!projectId) return;
  const loadSequence = projectLoadSequenceRef.current + 1;
  projectLoadSequenceRef.current = loadSequence;
  const wbsSaveSequenceAtStart = wbsSaveSequenceRef.current;
  const pendingWbsSavesAtStart = pendingWbsSaveCountRef.current;
  const refreshed = await apiClient.get<ProjectDetails>(
    `/api/projects/${projectId}/overview`,
    "Не удалось загрузить проект",
  );
  if (
    !shouldApplyProjectSnapshotAfterWbsSave({
      loadSequenceAtStart: loadSequence,
      currentLoadSequence: projectLoadSequenceRef.current,
      wbsSaveSequenceAtStart,
      currentWbsSaveSequence: wbsSaveSequenceRef.current,
      pendingWbsSavesAtStart,
      currentPendingWbsSaves: pendingWbsSaveCountRef.current,
    })
  ) {
    return;
  }
  applyProject(refreshed);
}

async function saveJiraIntegration(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!project) return;
  setSavingJira(true);
  setError(null);
  setNotice(null);
  try {
    const response = await authenticatedFetch(
      `${apiBase}/api/projects/${project.id}/jira-integration`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(jiraForm),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      throw new Error(
        result.error?.formErrors?.join(", ") ||
          result.error ||
          "Не удалось сохранить Jira",
      );
    }
    await refreshProject(project.id);
    setNotice("Jira-настройки сохранены");
  } catch (saveError) {
    setError(
      saveError instanceof Error
        ? saveError.message
        : "Не удалось сохранить Jira",
    );
  } finally {
    setSavingJira(false);
  }
}

async function saveJiraWorkSections(event: FormEvent<HTMLFormElement>) {
  event.preventDefault();
  if (!project) return;
  setSavingJiraWorkSections(true);
  setError(null);
  setNotice(null);
  try {
    await persistJiraWorkSections(project.id);
    await refreshProject(project.id);
    setNotice("Разделы Jira сохранены");
  } catch (saveError) {
    setError(
      saveError instanceof Error
        ? saveError.message
        : "Не удалось сохранить разделы Jira",
    );
  } finally {
    setSavingJiraWorkSections(false);
  }
}

async function saveProjectTargetDate() {
  if (!project) return;
  const targetDate = projectTargetDateDraft.trim();
  const reason = projectTargetChangeReason.trim();
  if (!targetDate) {
    setError("Укажите текущую утвержденную цель");
    return;
  }
  const currentTargetDate =
    projectTargetSummary?.currentTargetDate ?? new Date(project.targetDate);
  if (targetDate === isoDate(currentTargetDate)) {
    setNotice("Цель проекта не изменилась");
    return;
  }
  if (!reason) {
    setError("Укажите причину изменения цели");
    return;
  }
  setSavingProjectTargetDate(true);
  setError(null);
  setNotice(null);
  try {
    const updated = await apiClient.patch<ProjectDetails>(
      `/api/projects/${project.id}/target-date`,
      {
        targetDate,
        reason,
        approvedBy: projectTargetApprovedBy.trim() || null,
      },
      "Не удалось сохранить цель проекта",
    );
    applyProject(updated);
    setProjects((currentProjects) =>
      currentProjects.map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item,
      ),
    );
    await reloadAuditEvents();
    setNotice("Цель проекта сохранена");
  } catch (saveError) {
    setError(
      saveError instanceof Error
        ? saveError.message
        : "Не удалось сохранить цель проекта",
    );
  } finally {
    setSavingProjectTargetDate(false);
  }
}

/**
 * Saves interface settings. The view (columns, widths, sorting, level, panel
 * sizes) is this person's own and goes to their view of the project; the
 * project's shared content in uiState (passport rows, milestone label layout)
 * still goes to the project.
 */
async function saveProjectUiState(patch: ProjectUiState, _options?: unknown) {
  if (!project) return;
  const viewPatch = viewPatchOf(patch);
  const { passportRows, milestoneLabelLayout } = patch;
  const sharedPatch: ProjectUiState = {
    ...(passportRows !== undefined ? { passportRows } : {}),
    ...(milestoneLabelLayout !== undefined ? { milestoneLabelLayout } : {}),
  };
  const projectId = project.id;
  if (Object.keys(viewPatch).length > 0) {
    setProject((current) =>
      current && current.id === projectId ? { ...current, myViewState: { ...(current.myViewState ?? {}), ...viewPatch } } : current,
    );
    if (currentUser?.id === PUBLIC_DEMO_USER_ID) {
      writeDemoView(projectId, viewPatch);
    } else {
      await apiClient.patch(`/api/projects/${projectId}/my-view`, viewPatch, "Не удалось сохранить настройки вида");
    }
  }
  if (Object.keys(sharedPatch).length === 0) return;
  const nextUiState: ProjectUiState = { ...(project.uiState ?? {}), ...sharedPatch };
  setProject((current) =>
    current ? { ...current, uiState: nextUiState } : current,
  );
  const response = await authenticatedFetch(`${apiBase}/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ uiState: nextUiState }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.error ?? "Не удалось сохранить настройки интерфейса");
  }
}


  return {
    applyProject,
    refreshProject,
    saveJiraIntegration,
    saveJiraWorkSections,
    saveProjectTargetDate,
    saveProjectUiState,
    syncJira,
    toggleCalendarDay,
  };
}
