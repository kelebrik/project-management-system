import { signedDaysBetween, startOfDay } from "./dateUtils";
import type { ProjectDetails, WbsItem } from "./domainTypes";
import type { StructureMilestone } from "./milestoneTimeline";
import { findActiveProjectGoal } from "./projectTargetModel";
import { WBS_PREDECESSOR_KEYS } from "./wbsTable";

function isWbsCheckpoint(item: Pick<WbsItem, "type">) {
  return item.type === "MILESTONE" || item.type === "GOAL";
}

function validScheduleDate(value: string | null | undefined) {
  if (!value) return null;
  const date = startOfDay(new Date(value));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function createOverviewDashboard(
  project: ProjectDetails | null,
  structureMilestones: StructureMilestone[],
) {
  const today = startOfDay(new Date());
  const wbsItems = project?.wbsItems ?? [];
  const activeGoal = findActiveProjectGoal(wbsItems);
  const openIssues =
    project?.issues.filter(
      (issue) => issue.status !== "Closed" && issue.status !== "Resolved",
    ) ?? [];
  const overdueItems = wbsItems.filter(
    (item) =>
      item.status !== "DONE" &&
      item.status !== "CANCELLED" &&
      item.dueDate !== null &&
      startOfDay(new Date(item.dueDate)) < today,
  );
  const riskItems =
    project?.raidItems.filter(
      (item) =>
        item.status !== "CLOSED" &&
        item.status !== "VALIDATED" &&
        (item.type === "RISK" ||
          item.type === "DEPENDENCY" ||
          item.type === "ASSUMPTION"),
    ) ?? [];
  const decisionItems = openIssues.filter((issue) => issue.decisionRequired);
  const nextMilestone = structureMilestones.find(
    (entry) =>
      entry.milestone.dueDate &&
      startOfDay(new Date(entry.milestone.dueDate)) >= today,
  );
  const redZoneRisks = riskItems
    .filter((item) => item.type === "RISK" && item.riskScore >= 15)
    .sort((left, right) => right.riskScore - left.riskScore)
    .slice(0, 5);
  const blockingTickets =
    project?.jiraWorkSections
      .find((section) => section.sortOrder === 0)
      ?.issues.map(({ snapshot, syncedAt }) => ({
        id: snapshot.id,
        title: snapshot.summary,
        code: snapshot.issueKey,
        jiraTicketKey: snapshot.issueKey,
        jiraTicketUrl: snapshot.issueUrl,
        status: snapshot.status,
        priority: snapshot.priority,
        assignee: snapshot.assignee,
        issueType: snapshot.issueType,
        updatedAt: snapshot.updatedAt,
        syncedAt,
        source: "jira-work-section" as const,
      })) ?? [];
  const openDecisionItems = decisionItems
    .sort((left, right) =>
      String(left.dueDate ?? "9999").localeCompare(
        String(right.dueDate ?? "9999"),
      ),
    )
    .slice(0, 5);
  const criticalPathIds = new Set(project?.criticalPath?.criticalItemIds ?? []);
  const scheduleVarianceItems =
    criticalPathIds.size > 0
      ? wbsItems.filter((item) => criticalPathIds.has(item.id))
      : wbsItems;
  const wbsByCode = new Map(wbsItems.map((item) => [item.code, item]));
  const wbsById = new Map(wbsItems.map((item) => [item.id, item]));
  const childrenByParentId = new Map<string, WbsItem[]>();
  for (const item of wbsItems) {
    if (!item.parentId) continue;
    childrenByParentId.set(item.parentId, [
      ...(childrenByParentId.get(item.parentId) ?? []),
      item,
    ]);
  }
  const predecessorIdsByItemId = new Map<string, Set<string>>();
  const addPredecessor = (itemId: string, predecessorId: string) => {
    if (itemId === predecessorId) return;
    const current = predecessorIdsByItemId.get(itemId) ?? new Set<string>();
    current.add(predecessorId);
    predecessorIdsByItemId.set(itemId, current);
  };
  for (const dependency of project?.wbsDependencies ?? []) {
    addPredecessor(dependency.successorId, dependency.predecessorId);
  }
  for (const item of wbsItems) {
    for (const key of WBS_PREDECESSOR_KEYS) {
      const predecessorCode = item[key]?.trim();
      const predecessor = predecessorCode ? wbsByCode.get(predecessorCode) : null;
      if (predecessor) {
        addPredecessor(item.id, predecessor.id);
      }
    }
  }
  const hasScheduleVarianceDates = (item: WbsItem) =>
    item.baselineDueDate &&
    (item.forecastDueDate || item.dueDate) &&
    item.status !== "CANCELLED";
  const allScheduleDelays = wbsItems
    .filter(hasScheduleVarianceDates)
    .map((item) => {
      const baselineDueDate = validScheduleDate(item.baselineDueDate);
      const forecastDueDate = validScheduleDate(
        item.forecastDueDate ?? item.dueDate,
      );
      return {
        item,
        delay:
          baselineDueDate && forecastDueDate
            ? signedDaysBetween(baselineDueDate, forecastDueDate)
            : 0,
      };
    })
    .filter(({ delay }) => delay > 0);
  const delayByItemId = new Map(
    allScheduleDelays.map(({ item, delay }) => [item.id, delay]),
  );
  const isScheduleDeltaReportable = (item: WbsItem) =>
    item.type === "TASK" && !childrenByParentId.has(item.id);
  const collectReportableDescendantIds = (
    itemId: string,
    result: Set<string>,
    visiting = new Set<string>(),
  ) => {
    if (visiting.has(itemId)) return;
    visiting.add(itemId);
    for (const child of childrenByParentId.get(itemId) ?? []) {
      if (isScheduleDeltaReportable(child)) result.add(child.id);
      collectReportableDescendantIds(child.id, result, visiting);
    }
    visiting.delete(itemId);
  };
  const upstreamItemCache = new Map<string, Set<string>>();
  const upstreamItemIds = (
    itemId: string,
    visiting = new Set<string>(),
  ): Set<string> => {
    const cached = upstreamItemCache.get(itemId);
    if (cached) return cached;
    if (visiting.has(itemId)) return new Set<string>();
    visiting.add(itemId);
    const itemIds = new Set<string>();
    for (const predecessorId of predecessorIdsByItemId.get(itemId) ?? []) {
      itemIds.add(predecessorId);
      for (const upstreamId of upstreamItemIds(predecessorId, visiting)) {
        itemIds.add(upstreamId);
      }
    }
    visiting.delete(itemId);
    upstreamItemCache.set(itemId, itemIds);
    return itemIds;
  };
  const scheduleDeltaCandidateIds = activeGoal ? new Set<string>() : null;
  if (activeGoal && scheduleDeltaCandidateIds) {
    for (const upstreamId of upstreamItemIds(activeGoal.id)) {
      const upstreamItem = wbsById.get(upstreamId);
      if (!upstreamItem) continue;
      if (isScheduleDeltaReportable(upstreamItem)) {
        scheduleDeltaCandidateIds.add(upstreamItem.id);
      }
      collectReportableDescendantIds(upstreamItem.id, scheduleDeltaCandidateIds);
    }
  }
  const isScheduleDeltaCandidate = (item: WbsItem) =>
    scheduleDeltaCandidateIds
      ? scheduleDeltaCandidateIds.has(item.id)
      : isScheduleDeltaReportable(item) &&
        (criticalPathIds.size === 0 || criticalPathIds.has(item.id));
  const delayedScheduleDeltaCandidateIds = new Set(
    allScheduleDelays
      .filter(({ item }) => isScheduleDeltaCandidate(item))
      .map(({ item }) => item.id),
  );
  const upstreamCauseCache = new Map<string, Set<string>>();
  const upstreamDelayedCauseIds = (
    itemId: string,
    visiting = new Set<string>(),
  ): Set<string> => {
    const cached = upstreamCauseCache.get(itemId);
    if (cached) return cached;
    if (visiting.has(itemId)) return new Set<string>();
    visiting.add(itemId);
    const causeIds = new Set<string>();
    for (const predecessorId of predecessorIdsByItemId.get(itemId) ?? []) {
      if (delayedScheduleDeltaCandidateIds.has(predecessorId)) {
        causeIds.add(predecessorId);
      }
      for (const upstreamId of upstreamDelayedCauseIds(predecessorId, visiting)) {
        causeIds.add(upstreamId);
      }
    }
    visiting.delete(itemId);
    upstreamCauseCache.set(itemId, causeIds);
    return causeIds;
  };
  const isScheduleVarianceOpenCandidate = (item: WbsItem) =>
    hasScheduleVarianceDates(item) &&
    !isWbsCheckpoint(item) &&
    item.status !== "DONE";
  const scheduleDeltaItems = allScheduleDelays
    .filter(({ item }) => isScheduleDeltaCandidate(item))
    .map(({ item, delay: rawDelay }) => {
      const inheritedFrom =
        [...upstreamDelayedCauseIds(item.id)]
          .map((itemId) => wbsById.get(itemId))
          .filter((entry): entry is WbsItem => Boolean(entry))
          .sort(
            (left, right) =>
              (delayByItemId.get(right.id) ?? 0) -
                (delayByItemId.get(left.id) ?? 0) ||
              left.code.localeCompare(right.code, undefined, { numeric: true }),
          )[0] ?? null;
      const inheritedDelay = inheritedFrom
        ? delayByItemId.get(inheritedFrom.id) ?? 0
        : 0;
      return {
        item,
        delay: Math.max(0, rawDelay - inheritedDelay),
        rawDelay,
        inheritedFrom,
        inheritedDelay,
      };
    })
    .filter(({ delay }) => delay > 0)
    .sort(
      (left, right) =>
        right.delay - left.delay ||
        right.rawDelay - left.rawDelay ||
        left.item.code.localeCompare(right.item.code, undefined, {
          numeric: true,
        }),
    )
    .slice(0, 5);
  const activeGoalBaselineDueDate = validScheduleDate(
    activeGoal?.baselineDueDate ?? activeGoal?.dueDate,
  );
  const activeGoalForecastDueDate = validScheduleDate(
    activeGoal?.forecastDueDate ?? activeGoal?.dueDate,
  );
  const activeGoalDelay =
    activeGoal && activeGoalBaselineDueDate && activeGoalForecastDueDate
      ? Math.max(
          0,
          signedDaysBetween(activeGoalBaselineDueDate, activeGoalForecastDueDate),
        )
      : null;
  const fallbackScheduleVarianceFromStructure = scheduleVarianceItems
    .filter(isScheduleVarianceOpenCandidate)
    .reduce((maxDelay, item) => {
      const baselineDueDate = validScheduleDate(item.baselineDueDate);
      const forecastDueDate = validScheduleDate(
        item.forecastDueDate ?? item.dueDate,
      );
      const delay =
        baselineDueDate && forecastDueDate
          ? signedDaysBetween(baselineDueDate, forecastDueDate)
          : 0;
      return Math.max(maxDelay, delay);
    }, 0);
  const scheduleVarianceFromStructure =
    activeGoalDelay ?? fallbackScheduleVarianceFromStructure;

  return {
    openIssues,
    overdueItems,
    riskItems,
    decisionItems: decisionItems.length,
    nextMilestone,
    redZoneRisks,
    blockingTickets,
    openDecisionItems,
    scheduleDeltaItems,
    scheduleVarianceFromStructure,
  };
}
