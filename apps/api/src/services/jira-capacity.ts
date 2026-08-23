import {
  captureJiraReadOnlyRequestMetrics,
  fetchJiraIssuesWithMeta,
  type JiraCapacityIssueMeasurement,
  type JiraIssueFetchResult,
  type JiraReadOnlyRequestMetric,
} from '../jira.js';

export type JiraCapacityScopeType = 'LABEL' | 'EPIC';

export type JiraCapacitySampleInput = {
  scopeType: JiraCapacityScopeType;
  scopeValue: string;
  sampleSize: number;
  storageBudgetGiB: number;
  allocatedHistoryGiB: number;
  baseUrl?: string;
};

export type JiraCapacityLevel = 'NORMAL' | 'WARNING' | 'HIGH' | 'CRITICAL' | 'EXCEEDED';

const CAPACITY_GATE_VERSIONS_PER_TICKET = 100 as const;
const CAPACITY_THRESHOLDS = { warning: 70, high: 85, critical: 95 } as const;
const DATABASE_OVERHEAD_MULTIPLIER = 1.5 as const;

type MetricDistribution = {
  min: number;
  average: number;
  p50: number;
  p95: number;
  max: number;
};

export type JiraCapacityReport = {
  reportVersion: 2;
  generatedAt: string;
  mode: 'READ_ONLY';
  persisted: false;
  provenance: 'OBSERVED';
  scope: {
    type: JiraCapacityScopeType;
    value: string;
    tickets: number;
    requestedSample: number;
    observedSample: number;
    strategy: 'OLDEST_AND_NEWEST';
  };
  security: {
    status: 'PASS' | 'BLOCKED';
    jiraWrites: false;
    databaseWrites: false;
    issueContentInReport: false;
    attachmentsExcluded: boolean;
    attachmentFieldExclusionHonored: boolean;
    attachmentReferencesStripped: number;
    allowedMethodsObserved: boolean;
  };
  collection: {
    elapsedMs: number;
    requests: number;
    failedRequests: number;
    requestDurationMs: MetricDistribution;
    byOperation: Record<string, number>;
  };
  sample: {
    jsonBytes: MetricDistribution;
    estimatedFullJsonBytes: MetricDistribution;
    estimatedFullGzipBytes: MetricDistribution;
    fields: MetricDistribution;
    changelogHistories: MetricDistribution;
    changelogItems: MetricDistribution;
    comments: MetricDistribution;
    worklogs: MetricDistribution;
    developmentLinks: MetricDistribution;
    completeChangelogPercent: number;
    completeCommentsPercent: number;
    completeWorklogsPercent: number;
  };
  projections: Array<{
    versionsPerTicket: 10 | 50 | 100;
    rawJsonGiB: number;
    estimatedDatabaseGiB: number;
    estimatedGzipArchiveGiB: number;
    threeDatabaseCopiesGiB: number;
  }>;
  assumptions: {
    projectionUses: 'SAMPLE_P95';
    databaseOverheadMultiplier: typeof DATABASE_OVERHEAD_MULTIPLIER;
    referenceDatabaseCopies: 3;
    capacityGateVersionsPerTicket: typeof CAPACITY_GATE_VERSIONS_PER_TICKET;
    storageBudgetGiB: number;
    allocatedHistoryGiB: number;
    embeddedCommentsAndWorklogs: 'EXTRAPOLATED_WHEN_PAGED';
  };
  capacityGate: {
    status: 'PASS' | 'REVIEW_REQUIRED';
    level: JiraCapacityLevel;
    versionsPerTicket: typeof CAPACITY_GATE_VERSIONS_PER_TICKET;
    estimatedDatabaseGiB: number;
    projectedTotalDatabaseGiB: number;
    allocatedHistoryGiB: number;
    storageBudgetGiB: number;
    utilizationPercent: number;
    thresholdsPercent: typeof CAPACITY_THRESHOLDS;
    reasons: string[];
    warnings: string[];
  };
};

type JiraCapacityFetcher = (
  jql: string,
  options: {
    baseUrl?: string;
    includeAnalyticsFields: boolean;
    includeChangelog: boolean;
    includeRemoteDevelopment: boolean;
    capacitySample: boolean;
    pageSize: number;
  },
) => Promise<JiraIssueFetchResult>;

function jqlLiteral(value: string) {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function jiraCapacityScopeJql(type: JiraCapacityScopeType, value: string) {
  const literal = jqlLiteral(value.trim());
  return type === 'LABEL'
    ? `labels = ${literal}`
    : `(key = ${literal} OR "Epic Link" = ${literal})`;
}

function orderedJql(scopeJql: string, direction: 'ASC' | 'DESC') {
  return `${scopeJql} ORDER BY created ${direction}, key ${direction}`;
}

function rounded(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function percentile(sorted: readonly number[], ratio: number) {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

export function metricDistribution(values: readonly number[]): MetricDistribution {
  if (values.length === 0) return { min: 0, average: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0] ?? 0,
    average: rounded(sorted.reduce((total, value) => total + value, 0) / sorted.length),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted.at(-1) ?? 0,
  };
}

function percent(values: readonly boolean[]) {
  if (values.length === 0) return 0;
  return rounded(values.filter(Boolean).length / values.length * 100, 1);
}

function requestOperation(path: string) {
  if (/\/issue\/[^/]+\/changelog$/.test(path)) return 'issue-changelog';
  if (/\/issue\/[^/]+\/remotelink$/.test(path)) return 'issue-remotelink';
  if (/\/issue\/[^/]+$/.test(path)) return 'issue';
  if (/\/search(?:\/jql)?$/.test(path)) return 'search';
  if (/\/filter\/\d+$/.test(path)) return 'filter';
  if (/\/myself$/.test(path)) return 'myself';
  if (/\/session$/.test(path)) return 'session-auth';
  if (/\/login\.jsp$/.test(path)) return 'web-auth';
  return 'other-read';
}

function projection(
  tickets: number,
  versionsPerTicket: 10 | 50 | 100,
  fullJsonP95: number,
  gzipP95: number,
) {
  const bytesInGiB = 1024 ** 3;
  const rawJsonGiB = tickets * versionsPerTicket * fullJsonP95 / bytesInGiB;
  const estimatedDatabaseGiB = estimateDatabaseGiB(tickets, versionsPerTicket, fullJsonP95);
  const estimatedGzipArchiveGiB = tickets * versionsPerTicket * gzipP95 / bytesInGiB;
  return {
    versionsPerTicket,
    rawJsonGiB: rounded(rawJsonGiB, 3),
    estimatedDatabaseGiB: rounded(estimatedDatabaseGiB, 3),
    estimatedGzipArchiveGiB: rounded(estimatedGzipArchiveGiB, 3),
    threeDatabaseCopiesGiB: rounded(estimatedDatabaseGiB * 3, 3),
  };
}

function estimateDatabaseGiB(tickets: number, versionsPerTicket: number, fullJsonP95: number) {
  return tickets * versionsPerTicket * fullJsonP95
    / 1024 ** 3 * DATABASE_OVERHEAD_MULTIPLIER;
}

export function jiraCapacityLevel(utilizationPercent: number): JiraCapacityLevel {
  if (utilizationPercent > 100) return 'EXCEEDED';
  if (utilizationPercent >= CAPACITY_THRESHOLDS.critical) return 'CRITICAL';
  if (utilizationPercent >= CAPACITY_THRESHOLDS.high) return 'HIGH';
  if (utilizationPercent >= CAPACITY_THRESHOLDS.warning) return 'WARNING';
  return 'NORMAL';
}

export function buildJiraCapacityReport(input: {
  scopeType: JiraCapacityScopeType;
  scopeValue: string;
  sampleSize: number;
  storageBudgetGiB: number;
  allocatedHistoryGiB?: number;
  total: number;
  measurements: JiraCapacityIssueMeasurement[];
  requests: JiraReadOnlyRequestMetric[];
  elapsedMs: number;
}): JiraCapacityReport {
  const measurements = Array.from(
    new Map(input.measurements.map((measurement) => [measurement.identity, measurement])).values(),
  );
  const fullJson = metricDistribution(measurements.map((item) => item.estimatedFullJsonBytes));
  const gzip = metricDistribution(measurements.map((item) => item.estimatedFullGzipBytes));
  const projections = ([10, 50, 100] as const).map((versions) =>
    projection(input.total, versions, fullJson.p95, gzip.p95));
  const gateProjection = projection(
    input.total,
    CAPACITY_GATE_VERSIONS_PER_TICKET,
    fullJson.p95,
    gzip.p95,
  );
  const exactScopeDatabaseGiB = estimateDatabaseGiB(
    input.total,
    CAPACITY_GATE_VERSIONS_PER_TICKET,
    fullJson.p95,
  );
  const allocatedHistoryGiB = input.allocatedHistoryGiB ?? 0;
  const exactUtilizationPercent = (
    (allocatedHistoryGiB + exactScopeDatabaseGiB) / input.storageBudgetGiB * 100
  );
  const utilizationPercent = rounded(exactUtilizationPercent, 2);
  const capacityLevel = jiraCapacityLevel(exactUtilizationPercent);
  const attachmentsExcluded = measurements.every((item) => item.attachmentExcluded);
  const attachmentFieldExclusionHonored = measurements.every(
    (item) => item.attachmentFieldExclusionHonored,
  );
  const attachmentReferencesStripped = measurements.reduce(
    (total, item) => total + item.attachmentReferencesStripped,
    0,
  );
  const allowedMethodsObserved = input.requests.every((request) =>
    request.method === 'GET' || request.method === 'POST');
  const capacityReasons: string[] = [];
  const capacityWarnings: string[] = [];
  if (measurements.length === 0) capacityReasons.push('В выборке нет тикетов для измерения.');
  if (percent(measurements.map((item) => item.changelogComplete)) < 100) {
    capacityReasons.push('Не для всех тикетов получена полная история изменений.');
  }
  if (measurements.some((item) => item.comments > 0 && item.commentsIncluded === 0)) {
    capacityReasons.push('Jira не вернула ни одного комментария для экстраполяции объёма.');
  }
  if (measurements.some((item) => item.worklogs > 0 && item.worklogsIncluded === 0)) {
    capacityReasons.push('Jira не вернула ни одного worklog для экстраполяции объёма.');
  }
  if (capacityLevel === 'EXCEEDED') {
    capacityReasons.push(
      `Общий прогноз с учётом ${CAPACITY_GATE_VERSIONS_PER_TICKET} версий на тикет превышает бюджет истории Jira.`,
    );
  } else if (capacityLevel === 'CRITICAL') {
    capacityReasons.push(
      `Общий прогноз с учётом ${CAPACITY_GATE_VERSIONS_PER_TICKET} версий на тикет использует не менее 95% бюджета истории Jira.`,
    );
  } else if (capacityLevel === 'HIGH') {
    capacityWarnings.push('Общий прогноз использует не менее 85% бюджета истории Jira.');
  } else if (capacityLevel === 'WARNING') {
    capacityWarnings.push('Общий прогноз использует не менее 70% бюджета истории Jira.');
  }
  if (!attachmentsExcluded) {
    capacityReasons.push('После очистки снимка обнаружены структурированные данные вложений.');
  }
  if (!attachmentFieldExclusionHonored) {
    capacityReasons.push('Jira вернула поле attachment вопреки явному исключению в запросе.');
  }

  const byOperation = input.requests.reduce<Record<string, number>>((result, request) => {
    const operation = requestOperation(request.path);
    result[operation] = (result[operation] ?? 0) + 1;
    return result;
  }, {});

  return {
    reportVersion: 2,
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    persisted: false,
    provenance: 'OBSERVED',
    scope: {
      type: input.scopeType,
      value: input.scopeValue,
      tickets: input.total,
      requestedSample: input.sampleSize,
      observedSample: measurements.length,
      strategy: 'OLDEST_AND_NEWEST',
    },
    security: {
      status: attachmentsExcluded && attachmentFieldExclusionHonored && allowedMethodsObserved
        ? 'PASS'
        : 'BLOCKED',
      jiraWrites: false,
      databaseWrites: false,
      issueContentInReport: false,
      attachmentsExcluded,
      attachmentFieldExclusionHonored,
      attachmentReferencesStripped,
      allowedMethodsObserved,
    },
    collection: {
      elapsedMs: input.elapsedMs,
      requests: input.requests.length,
      failedRequests: input.requests.filter((request) => request.status === 0 || request.status >= 400).length,
      requestDurationMs: metricDistribution(input.requests.map((request) => request.durationMs)),
      byOperation,
    },
    sample: {
      jsonBytes: metricDistribution(measurements.map((item) => item.currentJsonBytes)),
      estimatedFullJsonBytes: fullJson,
      estimatedFullGzipBytes: gzip,
      fields: metricDistribution(measurements.map((item) => item.fieldCount)),
      changelogHistories: metricDistribution(measurements.map((item) => item.changelogHistories)),
      changelogItems: metricDistribution(measurements.map((item) => item.changelogItems)),
      comments: metricDistribution(measurements.map((item) => item.comments)),
      worklogs: metricDistribution(measurements.map((item) => item.worklogs)),
      developmentLinks: metricDistribution(measurements.map((item) => item.developmentLinks)),
      completeChangelogPercent: percent(measurements.map((item) => item.changelogComplete)),
      completeCommentsPercent: percent(measurements.map((item) => item.commentsComplete)),
      completeWorklogsPercent: percent(measurements.map((item) => item.worklogsComplete)),
    },
    projections,
    assumptions: {
      projectionUses: 'SAMPLE_P95',
      databaseOverheadMultiplier: DATABASE_OVERHEAD_MULTIPLIER,
      referenceDatabaseCopies: 3,
      capacityGateVersionsPerTicket: CAPACITY_GATE_VERSIONS_PER_TICKET,
      storageBudgetGiB: input.storageBudgetGiB,
      allocatedHistoryGiB,
      embeddedCommentsAndWorklogs: 'EXTRAPOLATED_WHEN_PAGED',
    },
    capacityGate: {
      status: capacityReasons.length === 0 ? 'PASS' : 'REVIEW_REQUIRED',
      level: capacityLevel,
      versionsPerTicket: CAPACITY_GATE_VERSIONS_PER_TICKET,
      estimatedDatabaseGiB: gateProjection.estimatedDatabaseGiB,
      projectedTotalDatabaseGiB: rounded(allocatedHistoryGiB + exactScopeDatabaseGiB, 3),
      allocatedHistoryGiB,
      storageBudgetGiB: input.storageBudgetGiB,
      utilizationPercent,
      thresholdsPercent: CAPACITY_THRESHOLDS,
      reasons: capacityReasons,
      warnings: capacityWarnings,
    },
  };
}

export async function sampleJiraCapacity(
  input: JiraCapacitySampleInput,
  fetcher: JiraCapacityFetcher = fetchJiraIssuesWithMeta,
) {
  const scopeJql = jiraCapacityScopeJql(input.scopeType, input.scopeValue);
  const oldestSize = Math.ceil(input.sampleSize / 2);
  const newestSize = Math.max(1, input.sampleSize - oldestSize);
  const startedAt = performance.now();
  const { result, requests } = await captureJiraReadOnlyRequestMetrics(async () => {
    const oldest = await fetcher(orderedJql(scopeJql, 'ASC'), {
      baseUrl: input.baseUrl,
      includeAnalyticsFields: true,
      includeChangelog: true,
      includeRemoteDevelopment: true,
      capacitySample: true,
      pageSize: oldestSize,
    });
    const newest = await fetcher(orderedJql(scopeJql, 'DESC'), {
      baseUrl: input.baseUrl,
      includeAnalyticsFields: true,
      includeChangelog: true,
      includeRemoteDevelopment: true,
      capacitySample: true,
      pageSize: newestSize,
    });
    return { oldest, newest };
  });

  return buildJiraCapacityReport({
    scopeType: input.scopeType,
    scopeValue: input.scopeValue,
    sampleSize: input.sampleSize,
    storageBudgetGiB: input.storageBudgetGiB,
    allocatedHistoryGiB: input.allocatedHistoryGiB,
    total: Math.max(result.oldest.total, result.newest.total),
    measurements: [
      ...(result.oldest.capacityMeasurements ?? []),
      ...(result.newest.capacityMeasurements ?? []),
    ],
    requests,
    elapsedMs: Math.max(0, Math.round(performance.now() - startedAt)),
  });
}
