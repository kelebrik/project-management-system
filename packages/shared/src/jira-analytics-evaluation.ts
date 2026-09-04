import {
  JIRA_ANALYTICS_FIELDS_BY_SOURCE,
  codePointCompare,
  isJiraBugIssueType,
  isJiraCancelledStatus,
  isJiraCriticalPriority,
  isJiraUnresolvedResolution,
  normalizedJiraValue,
  type JiraAnalyticsFilterField,
  type JiraAnalyticsGroupBy,
  type JiraAnalyticsMetric,
  type JiraAnalyticsSortDirection,
  type JiraAnalyticsSortField,
  type JiraAnalyticsTimeZone,
} from "./jira-analytics-core.js";
import type {
  JiraAnalyticsFilter,
  JiraAnalyticsStatusIntervalEndEndpoint,
  JiraAnalyticsStatusIntervalEndpoint,
  JiraAnalyticsStatusIntervalRowConfig,
} from "./jira-analytics-datasets.js";
import {
  JiraAnalyticsEvaluationLimitError,
  type JiraAnalyticsDataQuality,
  type JiraAnalyticsDataQualityWarning,
  type JiraAnalyticsEvaluationAccumulator,
  type JiraAnalyticsEvaluationLimits,
  type JiraAnalyticsEvaluationOptions,
  type JiraAnalyticsEvaluationResult,
  type JiraAnalyticsExecutableDefinition,
  type JiraAnalyticsGoalMapping,
  type JiraAnalyticsIssueData,
  type JiraAnalyticsResultRecord,
} from "./jira-analytics-evaluation-types.js";

function validDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function publicIssue(issue: JiraAnalyticsIssueData) {
  const {
    statusTransitions: _transitions,
    developmentActivities: _development,
    criticalEndPriority: _criticalEndPriority,
    dataObservedAt: _dataObservedAt,
    ...result
  } = issue;
  return result;
}

function issueRecord(issue: JiraAnalyticsIssueData): JiraAnalyticsResultRecord {
  return {
    id: `issue:${issue.id}`,
    source: "issues",
    issue: publicIssue(issue),
    eventAt: validDate(issue.updatedAt)?.toISOString() ?? null,
    intervalStartAt: null,
    intervalEndAt: null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours: null,
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

function goalIssueRecords(
  issue: JiraAnalyticsIssueData,
  goals: readonly JiraAnalyticsGoalMapping[],
): JiraAnalyticsResultRecord[] {
  const issueLabels = new Map(
    issue.labels.map((label) => [normalizedJiraValue(label), label] as const),
  );
  return goals.flatMap((goal) => {
    const matchedLabels = goal.labels.flatMap((label) => {
      const matched = issueLabels.get(normalizedJiraValue(label));
      return matched ? [matched] : [];
    });
    if (matchedLabels.length === 0) return [];
    return [{
      ...issueRecord(issue),
      id: `goal-issue:${goal.id}:${issue.id}`,
      source: "goalIssues" as const,
      goal: { ...goal, matchedLabels },
    }];
  });
}

function transitionRecords(issue: JiraAnalyticsIssueData): JiraAnalyticsResultRecord[] {
  if (!issue.transitionHistoryComplete) return [];
  const transitions = issue.statusTransitions
    .map((transition) => ({ ...transition, date: validDate(transition.transitionedAt) }))
    .filter((transition): transition is typeof transition & { date: Date } => transition.date !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime() || codePointCompare(left.id, right.id));
  let enteredAt = validDate(issue.issueCreatedAt);
  return transitions.map((transition) => {
    const durationHours = enteredAt
      ? Math.max(0, (transition.date.getTime() - enteredAt.getTime()) / 3_600_000)
      : null;
    enteredAt = transition.date;
    return {
      id: `transition:${transition.id}`,
      source: "transitions",
      issue: publicIssue(issue),
      eventAt: transition.date.toISOString(),
      intervalStartAt: null,
      intervalEndAt: null,
      intervalStartFromStatus: null,
      intervalStartToStatus: null,
      intervalEndFromStatus: null,
      intervalEndToStatus: null,
      durationHours,
      commitCount: 0,
      mergeRequestCount: 0,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      sprint: issue.sprint,
    };
  });
}

function developmentRecords(issue: JiraAnalyticsIssueData): JiraAnalyticsResultRecord[] {
  return issue.developmentActivities
    .filter((activity) => !activity.isBaseline)
    .flatMap((activity) => {
      const eventAt = validDate(activity.activityAt);
      if (!eventAt) return [];
      return [{
        id: `development:${activity.id}`,
        source: "development" as const,
        issue: publicIssue(issue),
        eventAt: eventAt.toISOString(),
        intervalStartAt: null,
        intervalEndAt: null,
        intervalStartFromStatus: null,
        intervalStartToStatus: null,
        intervalEndFromStatus: null,
        intervalEndToStatus: null,
        durationHours: null,
        commitCount: activity.commitCount,
        mergeRequestCount: activity.mergeRequestCount,
        fromStatus: null,
        toStatus: null,
        sprint: activity.sprintAtObservation,
      }];
    });
}

function matchesConfiguredValue(actual: string | null | undefined, expected: readonly string[]) {
  const normalized = normalizedJiraValue(actual);
  return normalized !== "" && expected.some((value) => normalizedJiraValue(value) === normalized);
}

function matchesConfiguredIssueType(actual: string | null | undefined, expected: readonly string[]) {
  const normalized = normalizedJiraValue(actual);
  if (normalized === "") return false;
  return expected.some((value) => {
    const configured = normalizedJiraValue(value);
    return configured !== "" && (
      normalized === configured
      || normalized.startsWith(`${configured}:`)
      || normalized.startsWith(`${configured}-`)
      || normalized.startsWith(`${configured} -`)
      || normalized.startsWith(`${configured} (`)
      || normalized.startsWith(`${configured}/`)
    );
  });
}

function criticalBugRecord(
  issue: JiraAnalyticsIssueData,
  now: Date,
  config?: JiraAnalyticsExecutableDefinition["criticalSlaConfig"],
): JiraAnalyticsResultRecord | null {
  if (config && !matchesConfiguredIssueType(issue.issueType, config.issueTypes)) return null;
  if (config && !issue.resolutionAt && !matchesConfiguredValue(issue.priority, config.priorities)) return null;
  if (config?.requirePriorityAtResolution && issue.resolutionAt && !matchesConfiguredValue(issue.criticalEndPriority, config.priorities)) return null;
  if (config?.openIntervals === "exclude" && !issue.resolutionAt) return null;
  const startedAt = validDate(issue.criticalPriorityAt);
  if ((!config && !issue.criticalSlaTracked) || !startedAt) return null;
  const finishedAt = validDate(issue.resolutionAt) ?? now;
  return {
    id: `critical-bug:${issue.id}`,
    source: "criticalBugs",
    issue: publicIssue(issue),
    eventAt: startedAt.toISOString(),
    intervalStartAt: startedAt.toISOString(),
    intervalEndAt: validDate(issue.resolutionAt)?.toISOString() ?? null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours: Math.max(0, (finishedAt.getTime() - startedAt.getTime()) / 3_600_000),
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

function criticalRiskRecord(
  issue: JiraAnalyticsIssueData,
  now: Date,
  config: NonNullable<JiraAnalyticsExecutableDefinition["criticalRiskConfig"]>,
): JiraAnalyticsResultRecord | null {
  if (!jiraIssueIsInWorkScope(issue) || issue.resolutionAt || !matchesConfiguredValue(issue.priority, config.priorities)) return null;
  const startedAt = validDate(issue.criticalPriorityAt);
  if (!startedAt) return null;
  const durationHours = Math.max(0, (now.getTime() - startedAt.getTime()) / 3_600_000);
  const bugAtRisk = matchesConfiguredIssueType(issue.issueType, config.bugIssueTypes)
    && durationHours > config.bugSlaHours - config.bugWarningHours
    && durationHours < config.bugSlaHours;
  const taskAtRisk = matchesConfiguredIssueType(issue.issueType, config.taskIssueTypes)
    && durationHours >= config.taskRiskHours;
  if (!bugAtRisk && !taskAtRisk) return null;
  return {
    id: `critical-risk:${issue.id}`,
    source: "criticalBugs",
    issue: publicIssue(issue),
    eventAt: startedAt.toISOString(),
    intervalStartAt: startedAt.toISOString(),
    intervalEndAt: null,
    intervalStartFromStatus: null,
    intervalStartToStatus: null,
    intervalEndFromStatus: null,
    intervalEndToStatus: null,
    durationHours,
    commitCount: issue.commitCount,
    mergeRequestCount: issue.mergeRequestCount,
    fromStatus: null,
    toStatus: null,
    sprint: issue.sprint,
  };
}

type JiraStatusEntryEvent = {
  at: Date;
  identity: string;
  fromStatus: string | null;
  toStatus: string | null;
  isCreation: boolean;
};

function statusMatches(status: string | null, expected: readonly string[]) {
  const normalized = normalizedJiraValue(status);
  return normalized !== "" && expected.some((value) => normalizedJiraValue(value) === normalized);
}

function statusIntervalNeedsCreatedAt(config: JiraAnalyticsStatusIntervalRowConfig) {
  return config.start.anchor === "issueCreated" || config.start.anchor === "firstStatusEntry";
}

function statusEndpointMatches(
  event: JiraStatusEntryEvent,
  endpoint: JiraAnalyticsStatusIntervalEndpoint | JiraAnalyticsStatusIntervalEndEndpoint,
) {
  if (endpoint.anchor === "issueCreated") return event.isCreation;
  if (endpoint.anchor === "criticalPriority") return event.identity === "critical-priority";
  if (endpoint.anchor === "resolution") return event.identity === "resolution";
  if (endpoint.anchor === "firstStatusEntry") return statusMatches(event.toStatus, endpoint.statuses);
  return !event.isCreation &&
    (endpoint.fromStatuses.length === 0 || statusMatches(event.fromStatus, endpoint.fromStatuses)) &&
    (endpoint.toStatuses.length === 0 || statusMatches(event.toStatus, endpoint.toStatuses));
}

function statusIntervalRecords(
  issue: JiraAnalyticsIssueData,
  config: JiraAnalyticsStatusIntervalRowConfig,
  now: Date,
): JiraAnalyticsResultRecord[] {
  if (!issue.transitionHistoryComplete) return [];
  const createdAt = validDate(issue.issueCreatedAt);
  if (statusIntervalNeedsCreatedAt(config) && !createdAt) return [];
  const transitions = issue.statusTransitions
    .map((transition) => ({ ...transition, date: validDate(transition.transitionedAt) }))
    .filter((transition): transition is typeof transition & { date: Date } => transition.date !== null)
    .sort((left, right) => left.date.getTime() - right.date.getTime() || codePointCompare(left.id, right.id));
  const entries: JiraStatusEntryEvent[] = [
    ...(createdAt ? [{
      at: createdAt,
      identity: "created",
      fromStatus: null,
      toStatus: transitions.length > 0 ? transitions[0]?.fromStatus ?? null : issue.status ?? null,
      isCreation: true,
    }] : []),
    ...transitions.map((transition) => ({
      at: transition.date,
      identity: transition.id,
      fromStatus: transition.fromStatus,
      toStatus: transition.toStatus,
      isCreation: false,
    })),
    ...(validDate(issue.criticalPriorityAt) ? [{
      at: validDate(issue.criticalPriorityAt)!,
      identity: "critical-priority",
      fromStatus: null,
      toStatus: null,
      isCreation: false,
    }] : []),
    ...(validDate(issue.resolutionAt) ? [{
      at: validDate(issue.resolutionAt)!,
      identity: "resolution",
      fromStatus: null,
      toStatus: null,
      isCreation: false,
    }] : []),
  ].sort((left, right) => left.at.getTime() - right.at.getTime() || codePointCompare(left.identity, right.identity));
  const matchingStarts = entries.filter((entry) => statusEndpointMatches(entry, config.start));
  const startOccurrence = config.start.occurrence ?? "first";
  const starts = startOccurrence === "all"
    ? matchingStarts
    : startOccurrence === "last"
      ? matchingStarts.slice(-1)
      : matchingStarts.slice(0, 1);
  const records: JiraAnalyticsResultRecord[] = [];
  let consumedThrough = Number.NEGATIVE_INFINITY;
  for (const start of starts) {
    if (start.at.getTime() <= consumedThrough) continue;
    const matchingEnds = entries.filter((entry) =>
      entry.at.getTime() >= start.at.getTime() &&
      (entry.at.getTime() > start.at.getTime() || entry.identity !== start.identity || config.start.anchor === "issueCreated") &&
      statusEndpointMatches(entry, config.end)
    );
    const endOccurrence = config.end.occurrence ?? "first";
    const end = endOccurrence === "last" ? matchingEnds.at(-1) ?? null : matchingEnds[0] ?? null;
    if (!end && config.openIntervals === "exclude") continue;
    const finishedAt = end?.at ?? now;
    const intervalStartAt = start.at.toISOString();
    const intervalEndAt = end?.at.toISOString() ?? null;
    records.push({
      id: `status-interval:${issue.id}:${start.identity}:${end?.identity ?? "open"}`,
      source: "statusIntervals" as const,
      issue: publicIssue(issue),
      eventAt: config.periodAnchor === "start" ? intervalStartAt : intervalEndAt,
      intervalStartAt,
      intervalEndAt,
      intervalStartFromStatus: start.fromStatus,
      intervalStartToStatus: start.toStatus,
      intervalEndFromStatus: end?.fromStatus ?? null,
      intervalEndToStatus: end?.toStatus ?? null,
      durationHours: Math.max(0, (finishedAt.getTime() - start.at.getTime()) / 3_600_000),
      commitCount: issue.commitCount,
      mergeRequestCount: issue.mergeRequestCount,
      fromStatus: start.toStatus,
      toStatus: end?.toStatus ?? null,
      sprint: issue.sprint,
    });
    consumedThrough = end?.at.getTime() ?? Number.POSITIVE_INFINITY;
  }
  return records.map((record, index) => ({
    ...record,
    occurrenceIndex: index + 1,
    occurrenceCount: records.length,
  }));
}

function jiraIssueIsInWorkScope(
  issue: Pick<JiraAnalyticsIssueData, "resolution" | "status">,
) {
  return isJiraUnresolvedResolution(issue.resolution) && !isJiraCancelledStatus(issue.status);
}

function recordValue(record: JiraAnalyticsResultRecord, field: JiraAnalyticsFilterField | "rowId") {
  if (field === "rowId") return record.id;
  if (record.semanticValues && Object.hasOwn(record.semanticValues, field)) {
    return record.semanticValues[field] ?? null;
  }
  if (field === "goalId") return record.goal?.id ?? null;
  if (field === "goalName") return record.goal?.name ?? null;
  if (field === "goalStatus") return record.goal?.status ?? null;
  if (field === "goalDate") return record.goal?.date ?? null;
  if (field === "goalLabels") return record.goal?.labels ?? [];
  if (field === "matchedLabels") return record.goal?.matchedLabels ?? [];
  if (field === "issueKey") return record.issue.issueKey;
  if (field === "project") {
    return record.issue.issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1] ?? null;
  }
  if (field === "summary") return record.issue.summary;
  if (field === "fromStatus") return record.fromStatus;
  if (field === "toStatus") return record.toStatus;
  if (field === "durationHours") return record.durationHours;
  if (field === "commitCount") return record.commitCount;
  if (field === "mergeRequestCount") return record.mergeRequestCount;
  if (field === "sprintCount") return record.issue.sprintCount;
  if (field === "labels") return record.issue.labels;
  if (field === "hasDevelopment") return record.issue.commitCount > 0 || record.issue.mergeRequestCount > 0;
  if (field === "eventAt") return record.eventAt;
  if (field === "intervalStartAt") return record.intervalStartAt;
  if (field === "intervalEndAt") return record.intervalEndAt;
  if (field === "sprint") return record.sprint;
  if (field === "resolution") return isJiraUnresolvedResolution(record.issue.resolution) ? null : record.issue.resolution;
  if (JIRA_ANALYTICS_FIELDS_BY_SOURCE.gitlabCommits.includes(field)) return null;
  return record.issue[field as keyof typeof record.issue];
}

function filterMatches(record: JiraAnalyticsResultRecord, filter: JiraAnalyticsFilter) {
  const actual = recordValue(record, filter.field);
  if (filter.field === "labels" || filter.field === "goalLabels" || filter.field === "matchedLabels") {
    const labels = Array.isArray(actual)
      ? actual.map((label) => String(label).trim()).filter(Boolean)
      : [];
    if (filter.operator === "empty") return labels.length === 0;
    if (filter.operator === "notEmpty") return labels.length > 0;
    const expected = normalizedJiraValue(filter.value);
    const expectedSet = filter.value.split(",").map(normalizedJiraValue).filter(Boolean);
    const foldedLabels = labels.map(normalizedJiraValue);
    if (filter.operator === "equals") return foldedLabels.includes(expected);
    if (filter.operator === "notEquals") return !foldedLabels.includes(expected);
    if (filter.operator === "oneOf") return expectedSet.some((value) => foldedLabels.includes(value));
    if (filter.operator === "noneOf") return expectedSet.every((value) => !foldedLabels.includes(value));
    if (filter.operator === "contains") return foldedLabels.some((label) => label.includes(expected));
    return false;
  }
  const actualText = actual === null || actual === undefined ? "" : String(actual).trim();
  const expected = filter.field === "resolution" &&
    (filter.operator === "equals" || filter.operator === "notEquals") &&
    isJiraUnresolvedResolution(filter.value)
    ? ""
    : filter.value.trim();
  if (filter.operator === "empty") return actualText === "";
  if (filter.operator === "notEmpty") return actualText !== "";
  const foldedActual = actualText.toLocaleLowerCase("ru-RU");
  const foldedExpected = expected.toLocaleLowerCase("ru-RU");
  if (filter.operator === "equals") return foldedActual === foldedExpected;
  if (filter.operator === "notEquals") return foldedActual !== foldedExpected;
  if (filter.operator === "oneOf" || filter.operator === "noneOf") {
    const values = filter.value.split(",").map(normalizedJiraValue).filter(Boolean);
    const includes = values.includes(normalizedJiraValue(actualText));
    return filter.operator === "oneOf" ? includes : !includes;
  }
  if (filter.operator === "contains") return foldedActual.includes(foldedExpected);
  if (filter.operator === "before" || filter.operator === "after") {
    const actualDate = new Date(actualText);
    const expectedDate = new Date(expected);
    if (Number.isNaN(actualDate.getTime()) || Number.isNaN(expectedDate.getTime())) return false;
    return filter.operator === "before" ? actualDate < expectedDate : actualDate > expectedDate;
  }
  const actualNumber = Number(actual);
  const expectedNumber = Number(expected);
  if (!Number.isFinite(actualNumber) || !Number.isFinite(expectedNumber)) return false;
  if (filter.operator === "greaterThan") return actualNumber > expectedNumber;
  if (filter.operator === "atLeast") return actualNumber >= expectedNumber;
  if (filter.operator === "lessThan") return actualNumber < expectedNumber;
  if (filter.operator === "atMost") return actualNumber <= expectedNumber;
  return actualNumber === expectedNumber;
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const index = (ordered.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return ordered[lower] ?? 0;
  const weight = index - lower;
  return (ordered[lower] ?? 0) * (1 - weight) + (ordered[upper] ?? 0) * weight;
}

type MetricState = {
  recordCount: number;
  commitCount: number;
  mergeRequestCount: number;
  durationSum: number;
  durations: number[];
};

function emptyMetricState(): MetricState {
  return {
    recordCount: 0,
    commitCount: 0,
    mergeRequestCount: 0,
    durationSum: 0,
    durations: [],
  };
}

function addRecordToMetricState(state: MetricState, record: JiraAnalyticsResultRecord) {
  state.recordCount += 1;
  state.commitCount += record.commitCount;
  state.mergeRequestCount += record.mergeRequestCount;
  if (record.durationHours !== null && Number.isFinite(record.durationHours)) {
    state.durationSum += record.durationHours;
    state.durations.push(record.durationHours);
  }
}

function metricValue(metric: JiraAnalyticsMetric, state: MetricState) {
  if (metric === "count") return state.recordCount;
  if (metric === "commits") return state.commitCount;
  if (metric === "mergeRequests") return state.mergeRequestCount;
  if (state.durations.length === 0) return 0;
  if (metric === "averageDuration") return state.durationSum / state.durations.length;
  if (metric === "p50Duration") return percentile(state.durations, 0.5);
  if (metric === "p85Duration") return percentile(state.durations, 0.85);
  return percentile(state.durations, 0.95);
}

function zonedDateParts(date: Date, timeZone: JiraAnalyticsTimeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day") };
}

function isoWeek(date: Date, timeZone: JiraAnalyticsTimeZone) {
  const parts = zonedDateParts(date, timeZone);
  const localDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  const weekday = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - weekday);
  const weekYear = localDate.getUTCFullYear();
  const yearStart = new Date(Date.UTC(weekYear, 0, 1));
  const week = Math.ceil((((localDate.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7);
  const monday = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  monday.setUTCDate(monday.getUTCDate() - weekday + 1);
  const label = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(monday);
  return { key: `${weekYear}-W${String(week).padStart(2, "0")}`, label };
}

function groupIdentity(
  record: JiraAnalyticsResultRecord,
  groupBy: JiraAnalyticsGroupBy,
  timeZone: JiraAnalyticsTimeZone,
) {
  const value = (raw: string | null | undefined, emptyLabel: string) => raw
    ? { key: `value:${raw}`, label: raw }
    : { key: "__empty__", label: emptyLabel };
  if (groupBy === "goal") return value(record.goal?.name, "Без цели");
  if (groupBy === "project") {
    const project = record.issue.issueKey.trim().toUpperCase().match(/^([A-Z][A-Z0-9_]*)-\d+$/)?.[1];
    return value(project, "Без проекта");
  }
  if (groupBy === "status") return value(record.issue.status, "Без статуса");
  if (groupBy === "assignee") return value(record.issue.assignee, "Не назначен");
  if (groupBy === "reporter") return value(record.issue.reporter, "Без автора");
  if (groupBy === "priority") return value(record.issue.priority, "Без приоритета");
  if (groupBy === "sprint") return value(record.sprint, "Без Sprint");
  if (groupBy === "issueType") return value(record.issue.issueType, "Без типа");
  if (groupBy === "resolution") {
    return isJiraUnresolvedResolution(record.issue.resolution)
      ? { key: "__empty__", label: "Без Resolution" }
      : value(record.issue.resolution, "Без Resolution");
  }
  if (groupBy === "fromStatus") return value(record.fromStatus, "Без статуса");
  if (groupBy === "toStatus") return value(record.toStatus, "Без статуса");
  if (groupBy === "week") {
    const eventAt = validDate(record.eventAt);
    return eventAt ? isoWeek(eventAt, timeZone) : { key: "__empty__", label: "Без даты" };
  }
  return { key: "__all__", label: "Все" };
}

function effectivePeriod(
  definition: JiraAnalyticsExecutableDefinition,
  options: JiraAnalyticsEvaluationOptions,
) {
  if (definition.periodMode === "NONE") return null;
  if (definition.periodMode === "FIXED") return definition.periodDays;
  if (!options.periodDays) throw new Error("DASHBOARD_PERIOD_REQUIRED");
  return options.periodDays;
}

export function evaluateJiraAnalyticsAggregate(
  definition: JiraAnalyticsExecutableDefinition,
  issues: JiraAnalyticsIssueData[],
  options: JiraAnalyticsEvaluationOptions,
): JiraAnalyticsEvaluationResult {
  const accumulator = createJiraAnalyticsEvaluationAccumulator(definition, options);
  accumulator.addIssues(issues);
  return accumulator.finish();
}

function sourceRecords(
  definition: JiraAnalyticsExecutableDefinition,
  issue: JiraAnalyticsIssueData,
  now: Date,
) {
  if (definition.source === "issues") return [issueRecord(issue)];
  if (definition.source === "goalIssues") return goalIssueRecords(issue, definition.goalMappings ?? []);
  if (definition.source === "transitions") return transitionRecords(issue);
  if (definition.source === "development") return developmentRecords(issue);
  if (definition.source === "statusIntervals") {
    const config = definition.rowConfig;
    if (!config || config.kind !== "statusInterval") return [];
    return statusIntervalRecords(issue, config, now);
  }
  const record = definition.criticalRiskConfig
    ? criticalRiskRecord(issue, now, definition.criticalRiskConfig)
    : criticalBugRecord(issue, now, definition.criticalSlaConfig);
  return record ? [record] : [];
}

function compareResultRecords(
  left: JiraAnalyticsResultRecord,
  right: JiraAnalyticsResultRecord,
  sortBy: JiraAnalyticsSortField = "default",
  direction: JiraAnalyticsSortDirection = "desc",
) {
  const sign = direction === "asc" ? 1 : -1;
  if (sortBy === "goalDate") {
    return sign * ((validDate(left.goal?.date)?.getTime() ?? 0) - (validDate(right.goal?.date)?.getTime() ?? 0))
      || codePointCompare(left.id, right.id);
  }
  if (sortBy === "issueKey") {
    return sign * codePointCompare(left.issue.issueKey, right.issue.issueKey) || codePointCompare(left.id, right.id);
  }
  if (sortBy === "eventAt") {
    return sign * ((validDate(left.eventAt)?.getTime() ?? 0) - (validDate(right.eventAt)?.getTime() ?? 0)) || codePointCompare(left.id, right.id);
  }
  if (sortBy === "durationHours" || sortBy === "commitCount" || sortBy === "mergeRequestCount") {
    const leftValue = sortBy === "durationHours" ? left.durationHours ?? -1 : left[sortBy];
    const rightValue = sortBy === "durationHours" ? right.durationHours ?? -1 : right[sortBy];
    return sign * (leftValue - rightValue) || codePointCompare(left.id, right.id);
  }
  if (sortBy === "sprintCount") {
    return sign * (left.issue.sprintCount - right.issue.sprintCount) || codePointCompare(left.id, right.id);
  }
  return (right.durationHours ?? -1) - (left.durationHours ?? -1) ||
    (validDate(right.eventAt)?.getTime() ?? 0) - (validDate(left.eventAt)?.getTime() ?? 0) ||
    codePointCompare(left.id, right.id);
}

export function createJiraAnalyticsEvaluationAccumulator(
  definition: JiraAnalyticsExecutableDefinition,
  options: JiraAnalyticsEvaluationOptions,
  limits: JiraAnalyticsEvaluationLimits = {},
): JiraAnalyticsEvaluationAccumulator {
  const now = validDate(options.now);
  if (!now) throw new Error("INVALID_EVALUATED_AT");
  const periodDays = effectivePeriod(definition, options);
  const periodStart = periodDays === null ? null : new Date(now.getTime() - periodDays * 86_400_000);
  const page = Math.max(1, options.page);
  const pageSize = Math.min(limits.maxPageSize ?? 100, Math.max(1, options.pageSize));
  const offset = (page - 1) * pageSize;
  const pageWindow = offset + pageSize;
  if (limits.maxPageWindow !== undefined && pageWindow > limits.maxPageWindow) {
    throw new JiraAnalyticsEvaluationLimitError("pageWindow", limits.maxPageWindow);
  }

  const allState = emptyMetricState();
  const selectedState = options.groupKey ? emptyMetricState() : allState;
  const grouped = new Map<string, { label: string; state: MetricState }>();
  const selectedRecords: JiraAnalyticsResultRecord[] = [];
  let qualityPopulation = 0;
  let qualityComplete = 0;
  let incompleteTransitionHistory = 0;
  let missingIssueCreatedAt = 0;
  let oldestObservedAt: Date | null = null;
  let latestObservedAt: Date | null = null;
  let matchedRows = 0;

  const issueMatchesQualityScope = (issue: JiraAnalyticsIssueData) =>
    (definition.scope !== "active" || jiraIssueIsInWorkScope(issue)) &&
    (!options.assignee || issue.assignee === options.assignee);

  const criticalQualityCandidate = (issue: JiraAnalyticsIssueData) => {
    const riskConfig = definition.criticalRiskConfig;
    if (riskConfig) {
      return jiraIssueIsInWorkScope(issue)
        && !issue.resolutionAt
        && (
          matchesConfiguredIssueType(issue.issueType, riskConfig.bugIssueTypes)
          || matchesConfiguredIssueType(issue.issueType, riskConfig.taskIssueTypes)
        )
        && matchesConfiguredValue(issue.priority, riskConfig.priorities);
    }
    const config = definition.criticalSlaConfig;
    const issueTypeMatches = config
      ? matchesConfiguredIssueType(issue.issueType, config.issueTypes)
      : isJiraBugIssueType(issue.issueType);
    const priority = issue.resolutionAt ? issue.criticalEndPriority : issue.priority;
    return issueTypeMatches && (config
      ? matchesConfiguredValue(priority, config.priorities)
      : isJiraCriticalPriority(priority));
  };

  const issueIsInQualityPopulation = (issue: JiraAnalyticsIssueData) =>
    issueMatchesQualityScope(issue) &&
    (definition.source !== "criticalBugs" || criticalQualityCandidate(issue));

  const issueHasCompleteSourceData = (issue: JiraAnalyticsIssueData) => {
    if (definition.source === "transitions") return issue.transitionHistoryComplete;
    if (definition.source === "statusIntervals") {
      const config = definition.rowConfig;
      return issue.transitionHistoryComplete && config?.kind === "statusInterval" && (
        !statusIntervalNeedsCreatedAt(config) || validDate(issue.issueCreatedAt) !== null
      );
    }
    if (definition.source === "development") return issue.developmentDataAvailable;
    if (definition.source === "criticalBugs") {
      return (definition.criticalSlaConfig || definition.criticalRiskConfig)
        ? validDate(issue.criticalPriorityAt) !== null
        : issue.criticalSlaTracked && validDate(issue.criticalPriorityAt) !== null;
    }
    return true;
  };

  const observeQuality = (issue: JiraAnalyticsIssueData) => {
    if (!issueIsInQualityPopulation(issue)) return;
    qualityPopulation += 1;
    if (
      (definition.source === "transitions" || definition.source === "statusIntervals") &&
      !issue.transitionHistoryComplete
    ) {
      incompleteTransitionHistory += 1;
    }
    if (
      definition.source === "statusIntervals" &&
      definition.rowConfig?.kind === "statusInterval" &&
      statusIntervalNeedsCreatedAt(definition.rowConfig) &&
      validDate(issue.issueCreatedAt) === null
    ) {
      missingIssueCreatedAt += 1;
    }
    if (issueHasCompleteSourceData(issue)) qualityComplete += 1;
    const observedAt = validDate(issue.dataObservedAt);
    if (!observedAt) return;
    if (!oldestObservedAt || observedAt < oldestObservedAt) oldestObservedAt = observedAt;
    if (!latestObservedAt || observedAt > latestObservedAt) latestObservedAt = observedAt;
  };

  const finishQuality = (): JiraAnalyticsDataQuality => {
    const incomplete = Math.max(0, qualityPopulation - qualityComplete);
    const warningCode = definition.source === "transitions"
      ? "INCOMPLETE_TRANSITION_HISTORY" as const
      : definition.source === "development"
        ? "INCOMPLETE_DEVELOPMENT_DATA" as const
        : "INCOMPLETE_CRITICAL_SLA" as const;
    const warnings: JiraAnalyticsDataQualityWarning[] = qualityPopulation === 0
      ? [{ code: "NO_SOURCE_POPULATION", count: 0 }]
      : definition.source === "statusIntervals"
        ? [
            ...(incompleteTransitionHistory > 0
              ? [{ code: "INCOMPLETE_TRANSITION_HISTORY" as const, count: incompleteTransitionHistory }]
              : []),
            ...(missingIssueCreatedAt > 0
              ? [{ code: "MISSING_ISSUE_CREATED_AT" as const, count: missingIssueCreatedAt }]
              : []),
          ]
        : incomplete > 0 && definition.source !== "issues"
          ? [{ code: warningCode, count: incomplete }]
          : [];
    return {
      status: qualityPopulation === 0
        ? "NO_DATA"
        : incomplete === 0
          ? "COMPLETE"
          : "PARTIAL",
      basis: "CURRENT_PROJECTION",
      source: definition.source,
      population: qualityPopulation,
      complete: qualityComplete,
      incomplete,
      coveragePercent: qualityPopulation === 0
        ? null
        : Math.round((qualityComplete / qualityPopulation) * 10_000) / 100,
      oldestObservedAt: oldestObservedAt?.toISOString() ?? null,
      latestObservedAt: latestObservedAt?.toISOString() ?? null,
      warnings,
    };
  };

  const recordMatches = (record: JiraAnalyticsResultRecord) => {
    if (periodStart) {
      const eventAt = validDate(String(recordValue(record, definition.dateField ?? "eventAt") ?? ""));
      if (eventAt === null || eventAt < periodStart || eventAt > now) return false;
    }
    if (definition.scope === "active" && !jiraIssueIsInWorkScope(record.issue)) return false;
    if (options.assignee && record.issue.assignee !== options.assignee) return false;
    const baseFilters = definition.baseFilters ?? [];
    const baseMatches = baseFilters.length === 0 || (definition.baseFilterLogic === "or"
      ? baseFilters.some((filter) => filterMatches(record, filter))
      : baseFilters.every((filter) => filterMatches(record, filter)));
    if (!baseMatches) return false;
    if (definition.filters.length === 0) return true;
    return definition.filterLogic === "or"
      ? definition.filters.some((filter) => filterMatches(record, filter))
      : definition.filters.every((filter) => filterMatches(record, filter));
  };

  return {
    addIssues(issues) {
      for (const issue of issues) {
        observeQuality(issue);
        const seenRowIdentities = new Set<string>();
        const uniqueRows = sourceRecords(definition, issue, now).filter((record) => {
          const identity = definition.rowIdentity?.length
            ? JSON.stringify(definition.rowIdentity.map((field) => recordValue(record, field)))
            : record.id;
          if (seenRowIdentities.has(identity)) return false;
          seenRowIdentities.add(identity);
          return true;
        });
        if (definition.maximumRowsPerIssue !== undefined && uniqueRows.length > definition.maximumRowsPerIssue) {
          throw new JiraAnalyticsEvaluationLimitError("rowsPerIssue", definition.maximumRowsPerIssue);
        }
        for (const record of uniqueRows) {
          if (!recordMatches(record)) continue;
          matchedRows += 1;
          if (definition.maximumRows !== undefined && matchedRows > definition.maximumRows) {
            throw new JiraAnalyticsEvaluationLimitError("rows", definition.maximumRows);
          }
          addRecordToMetricState(allState, record);

          const identity = definition.groupBy !== "none" || options.groupKey
            ? groupIdentity(record, definition.groupBy, definition.timeZone)
            : null;
          if (definition.groupBy !== "none" && identity) {
            let group = grouped.get(identity.key);
            if (!group) {
              if (limits.maxGroups !== undefined && grouped.size >= limits.maxGroups) {
                throw new JiraAnalyticsEvaluationLimitError("groups", limits.maxGroups);
              }
              group = { label: identity.label, state: emptyMetricState() };
              grouped.set(identity.key, group);
            }
            addRecordToMetricState(group.state, record);
          }

          if (!options.groupKey || identity?.key === options.groupKey) {
            if (selectedState !== allState) addRecordToMetricState(selectedState, record);
            selectedRecords.push(record);
            if (selectedRecords.length > pageWindow * 2) {
              selectedRecords.sort((left, right) => compareResultRecords(
                left,
                right,
                definition.sortBy,
                definition.sortDirection,
              ));
              selectedRecords.splice(pageWindow);
            }
          }
        }
      }
      selectedRecords.sort((left, right) => compareResultRecords(
        left,
        right,
        definition.sortBy,
        definition.sortDirection,
      ));
      selectedRecords.splice(pageWindow);
    },
    finish() {
      const groups = [...grouped.entries()]
        .map(([key, group]) => ({
          key,
          label: group.label,
          value: metricValue(definition.metric, group.state),
          recordCount: group.state.recordCount,
        }))
        .sort((left, right) => right.value - left.value || codePointCompare(left.key, right.key));
      return {
        evaluatedAt: now.toISOString(),
        effective: {
          periodDays,
          periodSource: definition.periodMode,
          timeZone: definition.timeZone,
          assignee: options.assignee,
        },
        value: metricValue(definition.metric, selectedState),
        groups,
        records: selectedRecords.slice(offset, pageWindow),
        totalRecords: selectedState.recordCount,
        page,
        pageSize,
        quality: finishQuality(),
      };
    },
  };
}
