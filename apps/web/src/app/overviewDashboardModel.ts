import { signedDaysBetween, startOfDay } from "./dateUtils";
import type { ProjectDetails, WbsItem, WbsItemStatus } from "./domainTypes";
import { issuePrimaryJiraLink } from "./labels";
import type { StructureMilestone } from "./milestoneTimeline";
import { WBS_PREDECESSOR_KEYS } from "./wbsTable";

export function createOverviewDashboard(
  project: ProjectDetails | null,
  structureMilestones: StructureMilestone[],
) {
  const today = startOfDay(new Date());
  const wbsItems = project?.wbsItems ?? [];
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
  const blockerIssues = openIssues
    .filter(
      (issue) =>
        issue.severity === "CRITICAL" || issue.status === "Blocked",
    )
    .sort((left, right) =>
      String(left.dueDate ?? "9999").localeCompare(
        String(right.dueDate ?? "9999"),
      ),
    );
  const blockedWbsItems = wbsItems
    .filter((item) => item.status === "BLOCKED")
    .map((item) => ({
      id: item.id,
      title: item.title,
      code: item.code,
      dueDate: item.dueDate,
      jiraTicketKey: item.jiraTicketKey,
      jiraTicketUrl: item.jiraTicketUrl,
      source: "structure" as const,
    }));
  const blockingTickets = [
    ...blockerIssues.map((issue) => {
      const jiraLink = issuePrimaryJiraLink(issue);
      return {
        id: issue.id,
        title: issue.title,
        code: jiraLink.key || issue.severity,
        dueDate: issue.dueDate,
        jiraTicketKey: jiraLink.key,
        jiraTicketUrl: jiraLink.url,
        source: "issue" as const,
      };
    }),
    ...blockedWbsItems,
  ]
    .sort((left, right) =>
      String(left.dueDate ?? "9999").localeCompare(
        String(right.dueDate ?? "9999"),
      ),
    )
    .slice(0, 6);
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
    item.baselineDueDate && item.dueDate && item.status !== "CANCELLED";
  const closedScheduleCauseCutoff = startOfDay(new Date(today));
  closedScheduleCauseCutoff.setDate(closedScheduleCauseCutoff.getDate() - 30);
  const isVisibleScheduleVarianceCause = (item: WbsItem) => {
    if (item.status !== "DONE") return true;
    if (!item.closedAt) return true;
    const closedAt = startOfDay(new Date(item.closedAt));
    if (Number.isNaN(closedAt.getTime())) return true;
    return closedAt >= closedScheduleCauseCutoff;
  };
  const allScheduleDelays = wbsItems
    .filter(hasScheduleVarianceDates)
    .map((item) => ({
      item,
      delay: signedDaysBetween(
        startOfDay(new Date(item.baselineDueDate as string)),
        startOfDay(new Date(item.dueDate as string)),
      ),
    }))
    .filter(({ delay }) => delay > 0);
  const delayByItemId = new Map(
    allScheduleDelays.map(({ item, delay }) => [item.id, delay]),
  );
  const delayedLeafTaskIds = new Set(
    allScheduleDelays
      .filter(
        ({ item, delay }) =>
          delay > 0 &&
          item.type !== "MILESTONE" &&
          !childrenByParentId.has(item.id),
      )
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
      if (delayedLeafTaskIds.has(predecessorId)) {
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
  const openStatuses: WbsItemStatus[] = ["IN_PROGRESS", "AT_RISK", "BLOCKED"];
  const isScheduleVarianceOpenCandidate = (item: WbsItem) =>
    hasScheduleVarianceDates(item) &&
    item.type !== "MILESTONE" &&
    item.status !== "DONE";
  const scheduleDeltaItems = allScheduleDelays
    .filter(({ item, delay }) => {
      if (
        delay <= 0 ||
        item.type === "MILESTONE" ||
        childrenByParentId.has(item.id) ||
        !isVisibleScheduleVarianceCause(item)
      ) {
        return false;
      }
      const upstreamCauseIds = [...upstreamDelayedCauseIds(item.id)];

      if (upstreamCauseIds.length === 0) return true;

      const allUpstreamCausesClosed = upstreamCauseIds.every(
        (predecessorId) => wbsById.get(predecessorId)?.status === "DONE",
      );

      return (
        criticalPathIds.has(item.id) &&
        openStatuses.includes(item.status) &&
        allUpstreamCausesClosed
      );
    })
    .map(({ item, delay: rawDelay }) => {
      const upstreamCauseIds = [...upstreamDelayedCauseIds(item.id)];
      const inheritedFrom = upstreamCauseIds
        .map((itemId) => wbsById.get(itemId))
        .filter((entry): entry is WbsItem => Boolean(entry))
        .sort(
          (left, right) =>
            (delayByItemId.get(right.id) ?? 0) -
            (delayByItemId.get(left.id) ?? 0),
        )[0];
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
        right.rawDelay - left.rawDelay ||
        left.item.code.localeCompare(right.item.code, undefined, {
          numeric: true,
        }),
    )
    .slice(0, 5);
  const scheduleVarianceFromStructure = scheduleVarianceItems
    .filter(isScheduleVarianceOpenCandidate)
    .reduce((maxDelay, item) => {
      const delay = signedDaysBetween(
        startOfDay(new Date(item.baselineDueDate as string)),
        startOfDay(new Date(item.dueDate as string)),
      );
      return Math.max(maxDelay, delay);
    }, 0);

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
