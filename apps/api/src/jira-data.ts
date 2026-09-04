import {
  isJiraCriticalPriority,
  jiraAnalyticsLabels,
  normalizeJiraAnalyticsScopeValue,
} from "@pms/shared";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";

import {
  jiraRemoteIssueLinkSchema,
  jiraRemoteIssueLinksSchema,
  type JiraAnalyticsScope,
  type JiraCapacityIssueMeasurement,
  type JiraIssue,
  type JiraSearchResponse,
  normalizedJiraIssueKey,
} from "./jira-model.js";
import { jiraChangelogPageComplete } from "./jira-changelog.js";
import { sanitizeJiraVersionPayload } from "./services/jira-version-canonical.js";

export function savedFilterIdFromJql(jql: string) {
  return jql.trim().match(/^filter\s*=\s*"?(\d+)"?$/i)?.[1] ?? null;
}

export type JiraSearchBodyOptions = {
  analyticsFieldIds?: readonly string[] | null;
  includeChangelog?: boolean;
  keysOnly?: boolean;
  capacitySample?: boolean;
  fullHistory?: boolean;
};

export function jiraSearchBody(
  jql: string,
  maxResults: number,
  startAt = 0,
  options: JiraSearchBodyOptions = {},
) {
  const analyticsFieldIds = options.analyticsFieldIds ?? null;
  const keysOnly = options.keysOnly === true;
  return JSON.stringify({
    jql,
    fields: keysOnly
      ? []
      : [
          ...(options.capacitySample || options.fullHistory
            ? ['*all', '-attachment']
            : analyticsFieldIds ? analyticsFieldIds : ['*navigable']),
          'summary',
          'status',
          'priority',
          'assignee',
          'reporter',
          'issuetype',
          'resolution',
          'resolutiondate',
          'created',
          'updated',
        ],
    ...(!keysOnly
      ? {
          expand: [
            'names',
            'schema',
            ...(options.includeChangelog === false ? [] : ['changelog']),
          ],
        }
      : {}),
    startAt,
    maxResults,
  });
}

export function splitTopLevelJiraOrderBy(jql: string) {
  let quote: '"' | "'" | null = null;
  let escaped = false;
  let depth = 0;
  let orderByIndex = -1;
  for (let index = 0; index < jql.length; index += 1) {
    const character = jql[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === '\\') {
      escaped = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = quote === character ? null : quote ?? character;
      continue;
    }
    if (quote) continue;
    if (character === '(') depth += 1;
    if (character === ')') {
      depth -= 1;
      if (depth < 0) throw new Error('Некорректные скобки в Jira JQL');
      continue;
    }
    if (
      depth === 0 &&
      /^order\s+by\b/i.test(jql.slice(index)) &&
      (index === 0 || /\s/.test(jql[index - 1] ?? ''))
    ) {
      orderByIndex = index;
    }
  }
  if (quote || depth !== 0) throw new Error('Некорректный Jira JQL: незакрытая строка или скобка');
  if (orderByIndex < 0) return { filter: jql.trim(), orderBy: '' };
  return {
    filter: jql.slice(0, orderByIndex).trim(),
    orderBy: jql.slice(orderByIndex).trim(),
  };
}

export function jiraJqlWithLabelScope(jql: string, label: string) {
  const labels = jiraAnalyticsLabels(normalizeJiraAnalyticsScopeValue('LABEL', label));
  const filter = labels.length === 1
    ? `labels = "${labels[0]}"`
    : `labels IN (${labels.map((value) => `"${value}"`).join(', ')})`;
  return jiraJqlWithScopeFilter(jql, filter);
}

export function jiraJqlWithScopeFilter(jql: string, scopeFilter: string) {
  const { filter, orderBy } = splitTopLevelJiraOrderBy(jql);
  const scopedFilter = filter
    ? `(${filter}) AND ${scopeFilter}`
    : scopeFilter;
  return `${scopedFilter}${orderBy ? ` ${orderBy}` : ''}`;
}

export function jiraJqlWithAnalyticsScope(jql: string, scope: JiraAnalyticsScope) {
  if (scope.type === 'LABEL') return jiraJqlWithLabelScope(jql, scope.value);
  const epicKey = normalizedJiraIssueKey(normalizeJiraAnalyticsScopeValue('EPIC', scope.value));
  if (!epicKey) throw new Error('Укажите корректный код эпика Jira');
  return jiraJqlWithScopeFilter(
    jql,
    `("Epic Link" = "${epicKey}" OR key = "${epicKey}")`,
  );
}

export function jiraJqlWithIssueKeys(jql: string, issueKeys: readonly string[]) {
  const normalizedIssueKeys = [...new Set(issueKeys.map((issueKey) => {
    const normalized = normalizedJiraIssueKey(issueKey);
    if (!normalized) throw new Error(`Некорректный ключ тикета Jira: ${issueKey}`);
    return normalized;
  }))].sort((left, right) => left.localeCompare(right));
  if (normalizedIssueKeys.length === 0) throw new Error('Пустой список тикетов Jira');
  return jiraJqlWithScopeFilter(
    jql,
    `issuekey IN (${normalizedIssueKeys.map((issueKey) => `"${issueKey}"`).join(', ')})`,
  );
}

export function jiraSprintFieldId() {
  return process.env.JIRA_SPRINT_FIELD_ID?.trim() || 'customfield_10004';
}

export function jiraSprintIdsFromFields(fields: Record<string, unknown>) {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.id === 'string' || typeof record.id === 'number') {
        ids.add(String(record.id));
      }
      Object.values(record).forEach(visit);
      return;
    }
    if (typeof value !== 'string') return;
    for (const match of value.matchAll(/(?:^|,|\[)id=(\d+)(?:,|\])/gi)) {
      if (match[1]) ids.add(match[1]);
    }
  };
  visit(fields[jiraSprintFieldId()]);
  return [...ids].sort((left, right) => {
    if (/^\d+$/.test(left) && /^\d+$/.test(right)) {
      const difference = BigInt(left) - BigInt(right);
      if (difference !== 0n) return difference < 0n ? -1 : 1;
    }
    return left < right ? -1 : left > right ? 1 : 0;
  });
}

export function jiraStringArray(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.normalize('NFKC').trim())
    .filter(Boolean))]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
}

export function jiraObjectString(value: unknown, key: string) {
  if (typeof value === 'string') return value.trim() || null;
  if (!value || typeof value !== 'object') return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' ? candidate.trim() || null : null;
}

export function jiraEpicKey(fields: Record<string, unknown>, names: Record<string, string>) {
  const epicField = Object.entries(names).find(([, name]) =>
    ['epic link', 'epic'].includes(name.trim().toLowerCase())
  )?.[0];
  return epicField ? jiraObjectString(fields[epicField], 'key') : null;
}

export function jiraAnalyticsFieldIds() {
  return [jiraSprintFieldId(), 'labels'];
}

export function parseJiraDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export type SprintCandidate = {
  name: string;
  state: string;
};

export function sprintCandidates(value: unknown): SprintCandidate[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => sprintCandidates(entry));
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const directName = typeof record.name === 'string' ? record.name.trim() : '';
    const direct = directName
      ? [{ name: directName, state: typeof record.state === 'string' ? record.state : '' }]
      : [];
    return [
      ...direct,
      ...Object.entries(record)
        .filter(([key]) => key !== 'name' && key !== 'state')
        .flatMap(([, entry]) => sprintCandidates(entry)),
    ];
  }
  if (typeof value !== 'string' || !value.trim()) return [];

  const names = [...value.matchAll(/name=([^,\]]+)/gi)];
  if (names.length > 0) {
    const state = value.match(/state=([^,\]]+)/i)?.[1]?.trim() ?? '';
    return names.map((match) => ({
      name: match[1]?.trim() ?? '',
      state,
    }));
  }
  return [{ name: value.trim(), state: '' }];
}

export function jiraSprintFromFields(
  fields: Record<string, unknown>,
) {
  const candidates = sprintCandidates(fields[jiraSprintFieldId()]);
  const selected =
    candidates.find((candidate) => candidate.state.toUpperCase() === 'ACTIVE') ??
    candidates.find((candidate) => candidate.state.toUpperCase() === 'FUTURE') ??
    candidates.at(-1);
  return selected?.name || null;
}

export function jiraSprintAvailable(fields: Record<string, unknown>) {
  return Object.hasOwn(fields, jiraSprintFieldId());
}

export function embeddedJson(value: string) {
  const normalized = value
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('\\"', '"');
  const candidates = [normalized];
  const jsonMarker = normalized.indexOf("json='");
  if (jsonMarker >= 0) {
    const start = jsonMarker + 6;
    const end = normalized.lastIndexOf("'");
    if (end > start) candidates.unshift(normalized.slice(start, end));
  }
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as unknown;
    } catch {
      // Jira Server may wrap the JSON payload in a Java object string.
    }
  }
  return null;
}

export function developmentCount(value: unknown) {
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const overall = record.overall;
  if (overall && typeof overall === 'object') {
    const count = (overall as Record<string, unknown>).count;
    if (typeof count === 'number' && Number.isFinite(count)) return Math.max(0, count);
  }
  if (typeof record.count === 'number' && Number.isFinite(record.count)) {
    return Math.max(0, record.count);
  }
  return 0;
}

export function scanDevelopment(value: unknown, key = ''): {
  commitCount: number;
  mergeRequestCount: number;
  updatedAt: Date | null;
  recognized: boolean;
} {
  if (typeof value === 'string') {
    const parsed = embeddedJson(value);
    return parsed
      ? scanDevelopment(parsed, key)
      : {
          commitCount: 0,
          mergeRequestCount: 0,
          updatedAt: parseJiraDate(value),
          recognized: false,
        };
  }
  if (Array.isArray(value)) {
    return value.reduce(
      (result, entry) => {
        const next = scanDevelopment(entry, key);
        return {
          commitCount: Math.max(result.commitCount, next.commitCount),
          mergeRequestCount: Math.max(result.mergeRequestCount, next.mergeRequestCount),
          recognized: result.recognized || next.recognized,
          updatedAt:
            !result.updatedAt || (next.updatedAt && next.updatedAt > result.updatedAt)
              ? next.updatedAt
              : result.updatedAt,
        };
      },
      { commitCount: 0, mergeRequestCount: 0, updatedAt: null, recognized: false } as {
        commitCount: number;
        mergeRequestCount: number;
        updatedAt: Date | null;
        recognized: boolean;
      },
    );
  }
  if (!value || typeof value !== 'object') {
    return { commitCount: 0, mergeRequestCount: 0, updatedAt: null, recognized: false };
  }

  const record = value as Record<string, unknown>;
  const normalizedKey = key.toLowerCase().replaceAll('_', '');
  const isCommitGroup = /^(repository|commit|commits)$/.test(normalizedKey);
  const isMergeRequestGroup = /(pullrequest|mergerequest)/.test(normalizedKey);
  let commitCount = isCommitGroup
    ? developmentCount(record)
    : 0;
  let mergeRequestCount = isMergeRequestGroup
    ? developmentCount(record)
    : 0;
  let recognized = isCommitGroup || isMergeRequestGroup;
  let updatedAt = parseJiraDate(record.lastUpdated ?? record.updatedAt);
  for (const [childKey, childValue] of Object.entries(record)) {
    const next = scanDevelopment(childValue, childKey);
    commitCount = Math.max(commitCount, next.commitCount);
    mergeRequestCount = Math.max(mergeRequestCount, next.mergeRequestCount);
    recognized ||= next.recognized;
    if (!updatedAt || (next.updatedAt && next.updatedAt > updatedAt)) {
      updatedAt = next.updatedAt;
    }
  }
  return { commitCount, mergeRequestCount, updatedAt, recognized };
}

export function jiraDevelopmentFromFields(
  fields: Record<string, unknown>,
  names: Record<string, string> = {},
) {
  const developmentFieldKeys = new Set(
    Object.entries(names)
      .filter(([, name]) => {
        const normalized = name.trim().toLowerCase();
        return normalized.includes('development') || normalized.includes('разработ');
      })
      .map(([key]) => key),
  );
  if ('development' in fields) developmentFieldKeys.add('development');
  const values = [...developmentFieldKeys]
    .filter((key) => fields[key] !== null && fields[key] !== undefined)
    .map((key) => fields[key]);
  const scanned = scanDevelopment(values);
  return {
    commitCount: scanned.commitCount,
    mergeRequestCount: scanned.mergeRequestCount,
    updatedAt: scanned.updatedAt,
    available: values.length > 0 && scanned.recognized,
  };
}

export function jiraDevelopmentFromRemoteLinks(value: unknown): JiraIssue['development'] | null {
  const parsed = jiraRemoteIssueLinksSchema.safeParse(value);
  if (!parsed.success) return null;

  const commits = new Set<string>();
  const mergeRequests = new Set<string>();
  for (const rawLink of parsed.data) {
    const parsedLink = jiraRemoteIssueLinkSchema.safeParse(rawLink);
    if (!parsedLink.success) continue;
    const link = parsedLink.data;
    const relationship = link.relationship?.trim().toLowerCase().replaceAll(/\s+/g, ' ') ?? '';
    if (!/\bmentioned on\b/.test(relationship)) continue;
    const title = link.object?.title?.trim() ?? '';
    const url = link.object?.url?.trim() ?? '';
    const normalizedTitle = title.toLowerCase();
    const developmentLink = jiraDevelopmentLink(url);
    const fallbackIdentity =
      developmentLink?.identity ||
      normalizedRemoteUrl(url) ||
      link.globalId?.trim() ||
      String(link.id ?? '');
    if (!fallbackIdentity) continue;
    if (developmentLink?.kind === 'merge-request') {
      mergeRequests.add(developmentLink.identity);
    } else if (developmentLink?.kind === 'commit') {
      commits.add(developmentLink.identity);
    } else if (/^merge[\s_-]?request\b/.test(normalizedTitle)) {
      mergeRequests.add(fallbackIdentity);
    } else if (/^commit\b/.test(normalizedTitle)) {
      commits.add(fallbackIdentity);
    }
  }

  return {
    commitCount: commits.size,
    mergeRequestCount: mergeRequests.size,
    updatedAt: null,
    available: true,
  };
}

export function normalizedRemoteUrl(value: string) {
  if (!value) return '';
  try {
    const url = new URL(value);
    return `${url.origin.toLowerCase()}${url.pathname.replace(/\/+$/, '').toLowerCase()}`;
  } catch {
    return value.split(/[?#]/, 1)[0]?.replace(/\/+$/, '').toLowerCase() ?? '';
  }
}

export function jiraDevelopmentLink(value: string) {
  const normalized = normalizedRemoteUrl(value);
  if (!normalized) return null;
  const mergeRequest = normalized.match(/^(.*\/merge_requests\/[^/]+)(?:\/.*)?$/);
  if (mergeRequest?.[1]) {
    return { kind: 'merge-request' as const, identity: mergeRequest[1] };
  }
  const commit = normalized.match(/^(.*\/commits?\/[^/]+)(?:\/.*)?$/);
  if (commit?.[1]) return { kind: 'commit' as const, identity: commit[1] };
  return null;
}

export function selectJiraDevelopment(
  fieldDevelopment: JiraIssue['development'],
  remoteDevelopment: JiraIssue['development'] | null,
  remoteDevelopmentRequested: boolean,
) {
  if (!remoteDevelopmentRequested) return fieldDevelopment;
  return remoteDevelopment ?? {
    commitCount: 0,
    mergeRequestCount: 0,
    updatedAt: null,
    available: false,
  };
}

export function jiraStatusTransitions(issue: JiraSearchResponse['issues'][number]) {
  return (issue.changelog?.histories ?? []).flatMap((history, historyIndex) => {
    const transitionedAt = parseJiraDate(history.created);
    if (!transitionedAt) return [];
    return history.items.flatMap((item, itemIndex) => {
      if ((item.fieldId ?? item.field)?.toLowerCase() !== 'status' || !item.toString) return [];
      return [
        {
          key: `${history.id ?? `${history.created}:${historyIndex}`}:${itemIndex}`,
          fromStatus: item.fromString?.trim() || null,
          toStatus: item.toString.trim(),
          transitionedAt,
          actor: history.author?.displayName?.trim() || history.author?.name?.trim() || null,
        },
      ];
    });
  });
}

export function normalizedJiraLabels(value: string | null | undefined) {
  const normalized = value?.normalize('NFKC').trim() ?? '';
  if (!normalized) return [];
  return jiraStringArray(normalized.split(/\s+/u));
}

export function jiraLabelChanges(issue: JiraSearchResponse['issues'][number]) {
  return (issue.changelog?.histories ?? []).flatMap((history) => {
    const changedAt = parseJiraDate(history.created);
    if (!changedAt) return [];
    return history.items.flatMap((item, itemIndex) => {
      if ((item.fieldId ?? item.field)?.trim().toLowerCase() !== 'labels') return [];
      return [{
        key: history.id
          ? `${history.id}:${itemIndex}`
          : `derived:${createHash('sha256').update(JSON.stringify([
              history.created,
              item.fieldId ?? item.field ?? 'labels',
              item.fromString ?? null,
              item.toString ?? null,
            ])).digest('hex')}`,
        changedAt,
        fromLabels: normalizedJiraLabels(item.fromString),
        toLabels: normalizedJiraLabels(item.toString),
        actor: history.author?.displayName?.trim() || history.author?.name?.trim() || null,
      }];
    });
  });
}

export function jiraTransitionHistoryComplete(issue: JiraSearchResponse['issues'][number]) {
  return jiraChangelogPageComplete(issue.changelog);
}

export function isJiraAttachmentKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return normalized === 'attachment' || normalized === 'attachments';
}

export function isJiraAttachmentRecord(value: Record<string, unknown>) {
  const adfType = typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
  if (
    adfType === 'media'
    || adfType === 'mediagroup'
    || adfType === 'mediasingle'
    || adfType === 'mediainline'
  ) return true;
  const changelogField = typeof (value.fieldId ?? value.field) === 'string'
    ? String(value.fieldId ?? value.field).trim().toLowerCase()
    : '';
  if (changelogField === 'attachment' || changelogField === 'attachments') return true;
  return typeof value.filename === 'string'
    && ['mimeType', 'content', 'thumbnail'].some((key) => key in value);
}

export function containsJiraAttachmentMetadata(value: unknown): boolean {
  if (Array.isArray(value)) return value.some((entry) => containsJiraAttachmentMetadata(entry));
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  if (isJiraAttachmentRecord(record)) return true;
  return Object.entries(record).some(
    ([key, entry]) => isJiraAttachmentKey(key) || containsJiraAttachmentMetadata(entry),
  );
}

export function countJiraAttachmentMetadata(value: unknown): number {
  if (Array.isArray(value)) {
    return value.reduce((total, entry) => total + countJiraAttachmentMetadata(entry), 0);
  }
  if (!value || typeof value !== 'object') return 0;
  const record = value as Record<string, unknown>;
  const adfType = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
  const recordMatch = ['mediagroup', 'mediasingle', 'mediainline'].includes(adfType)
    ? 0
    : isJiraAttachmentRecord(record) ? 1 : 0;
  return Object.entries(record).reduce(
    (total, [key, entry]) => {
      const nested = countJiraAttachmentMetadata(entry);
      return total + (isJiraAttachmentKey(key) ? Math.max(1, nested) : nested);
    },
    recordMatch,
  );
}

export function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => {
      const sorted = sortedJsonValue(entry);
      return sorted === undefined ? [] : [sorted];
    });
  }
  if (!value || typeof value !== 'object') return value;
  if (isJiraAttachmentRecord(value as Record<string, unknown>)) return undefined;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !isJiraAttachmentKey(key))
      .sort(([left], [right]) => left.localeCompare(right))
      .flatMap(([key, entry]) => {
        const sorted = sortedJsonValue(entry);
        return sorted === undefined ? [] : [[key, sorted] as const];
      }),
  );
}

export function sanitizeJiraCapacityPayload(value: unknown) {
  const payload = sortedJsonValue(value);
  return {
    payload,
    attachmentExcluded: !containsJiraAttachmentMetadata(payload),
    attachmentReferencesStripped: countJiraAttachmentMetadata(value),
  };
}

export function jiraEmbeddedCollection(value: unknown, arrayKey: string) {
  if (!value || typeof value !== 'object') {
    return { total: 0, included: 0, complete: true, currentBytes: 0, estimatedBytes: 0 };
  }
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record[arrayKey]) ? record[arrayKey] : [];
  const included = entries.length;
  const totalValue = typeof record.total === 'number' ? record.total : included;
  const total = Math.max(included, Math.max(0, Math.floor(totalValue)));
  const currentBytes = Buffer.byteLength(JSON.stringify(sortedJsonValue(value)));
  const entriesBytes = Buffer.byteLength(JSON.stringify(sortedJsonValue(entries)));
  const fixedBytes = Math.max(0, currentBytes - entriesBytes);
  const averageEntryBytes = included > 0 ? Math.max(0, entriesBytes - 2) / included : 0;
  const estimatedBytes = total > included && included > 0
    ? Math.ceil(fixedBytes + 2 + averageEntryBytes * total)
    : currentBytes;
  return {
    total,
    included,
    complete: total <= included,
    currentBytes,
    estimatedBytes,
  };
}

export function measureJiraIssueCapacity(
  issue: JiraSearchResponse['issues'][number],
  development: JiraIssue['development'] | null,
): JiraCapacityIssueMeasurement {
  const rawFields = issue.fields as Record<string, unknown>;
  const attachmentFieldExclusionHonored = !Object.keys(rawFields).some(isJiraAttachmentKey);
  const rawPayload = {
    jiraId: issue.id ?? null,
    fields: rawFields,
    changelog: issue.changelog ?? null,
  };
  const sanitized = sanitizeJiraCapacityPayload(rawPayload);
  const fields = sortedJsonValue(rawFields) as Record<string, unknown>;
  const comment = jiraEmbeddedCollection(fields.comment, 'comments');
  const worklog = jiraEmbeddedCollection(fields.worklog, 'worklogs');
  const payload = sanitized.payload;
  const serialized = JSON.stringify(payload);
  const currentJsonBytes = Buffer.byteLength(serialized);
  const estimatedFullJsonBytes = Math.max(
    currentJsonBytes,
    currentJsonBytes
      - comment.currentBytes
      - worklog.currentBytes
      + comment.estimatedBytes
      + worklog.estimatedBytes,
  );
  const compressionRatio = serialized.length > 0
    ? gzipSync(serialized).byteLength / currentJsonBytes
    : 1;

  return {
    identity: issue.id ?? issue.key,
    currentJsonBytes,
    estimatedFullJsonBytes,
    estimatedFullGzipBytes: Math.ceil(estimatedFullJsonBytes * compressionRatio),
    fieldCount: Object.keys(fields).length,
    changelogHistories: issue.changelog?.histories.length ?? 0,
    changelogItems: issue.changelog?.histories.reduce(
      (total, history) => total + history.items.length,
      0,
    ) ?? 0,
    changelogComplete: jiraChangelogPageComplete(issue.changelog),
    comments: comment.total,
    commentsIncluded: comment.included,
    commentsComplete: comment.complete,
    worklogs: worklog.total,
    worklogsIncluded: worklog.included,
    worklogsComplete: worklog.complete,
    developmentLinks: (development?.commitCount ?? 0) + (development?.mergeRequestCount ?? 0),
    attachmentExcluded: sanitized.attachmentExcluded,
    attachmentFieldExclusionHonored,
    attachmentReferencesStripped: sanitized.attachmentReferencesStripped,
  };
}

export function jiraCriticalPriorityAt(
  issue: JiraSearchResponse['issues'][number],
) {
  const historyComplete = jiraChangelogPageComplete(issue.changelog);
  const createdAt = parseJiraDate(issue.fields.created);
  const changes = jiraPriorityChanges(issue);

  if (changes.length === 0) {
    return historyComplete && isJiraCriticalPriority(issue.fields.priority?.name)
      ? createdAt
      : null;
  }
  if (historyComplete && isJiraCriticalPriority(changes[0]?.fromPriority)) {
    return createdAt;
  }

  return changes.find((change) => isJiraCriticalPriority(change.toPriority))?.changedAt ?? null;
}

export function jiraPriorityChanges(
  issue: JiraSearchResponse['issues'][number],
) {
  return (issue.changelog?.histories ?? [])
    .flatMap((history) => {
      const changedAt = parseJiraDate(history.created);
      if (!changedAt) return [];
      return history.items.flatMap((item) => {
        const field = (item.fieldId ?? item.field)?.trim().toLowerCase();
        if (field !== 'priority' && field !== 'приоритет') return [];
        return [{
          changedAt,
          fromPriority: item.fromString?.trim() || null,
          toPriority: item.toString?.trim() || null,
        }];
      });
    })
    .sort((left, right) => left.changedAt.getTime() - right.changedAt.getTime());
}

export function jiraPriorityAtResolution(
  issue: JiraSearchResponse['issues'][number],
) {
  const resolutionAt = parseJiraDate(issue.fields.resolutiondate);
  if (!resolutionAt || !jiraChangelogPageComplete(issue.changelog)) return null;

  const changes = jiraPriorityChanges(issue);
  let priorityAtResolution = changes.length > 0
    ? changes[0]?.fromPriority ?? null
    : issue.fields.priority?.name?.trim() || null;
  for (const change of changes) {
    if (change.changedAt > resolutionAt) break;
    priorityAtResolution = change.toPriority;
  }
  return priorityAtResolution;
}
