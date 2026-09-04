import { z } from "zod";

import {
  JiraReadOnlyRequestError,
  JiraSyncDeadlineError,
  cleanJiraErrorBody,
  fetchJiraCurrentUser,
  fetchJiraReadOnly,
  isAnonymousFieldVisibilityError,
  isJsonResponse,
  jiraSearchPaths,
} from "./jira-client.js";
import {
  jiraDevelopmentFromRemoteLinks,
  jiraSearchBody,
} from "./jira-data.js";
import { jiraChangelogPageComplete } from "./jira-changelog.js";
import {
  jiraChangelogHistorySchema,
  jiraChangelogPageSchema,
  jiraChangelogValuesPageSchema,
  jiraIssueChangelogResponseSchema,
  jiraIssueKeySearchResponseSchema,
  jiraRemoteIssueLinksSchema,
  jiraSearchResponseSchema,
  type JiraChangelogPage,
  type JiraIssueKeySearchResponse,
  type JiraSearchPage,
  type JiraSearchResponse,
  type JiraSearchResult,
  type JiraSearchRetryBudget,
} from "./jira-model.js";
import { logEvent } from "./server/logger.js";

export const JIRA_SEARCH_TIMEOUT_MS = 60_000;
export const JIRA_CHANGELOG_TIMEOUT_MS = 30_000;
export const JIRA_SEARCH_MAX_ATTEMPTS = 3;
export const JIRA_SEARCH_RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
export const JIRA_SEARCH_RETRY_DELAYS_MS = [250, 750] as const;
export const JIRA_SEARCH_MAX_RETRY_AFTER_MS = 5_000;

export function jiraRequestTimeout(deadlineAt: number | undefined, requestTimeoutMs: number) {
  const remainingMs = deadlineAt === undefined ? requestTimeoutMs : deadlineAt - Date.now();
  if (remainingMs <= 0) {
    throw new JiraSyncDeadlineError('Превышен общий лимит времени синхронизации Jira');
  }
  return AbortSignal.timeout(Math.max(1, Math.min(requestTimeoutMs, remainingMs)));
}

export function jiraTimeoutError(error: unknown, operation: string) {
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
    return new Error(`${operation}: превышен лимит времени ожидания Jira`);
  }
  return error;
}

export function jiraSearchRetryDelay(response: Response, attempt: number) {
  const retryAfter = response.headers.get('retry-after')?.trim();
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1_000, JIRA_SEARCH_MAX_RETRY_AFTER_MS);
    }
    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.min(Math.max(0, retryAt - Date.now()), JIRA_SEARCH_MAX_RETRY_AFTER_MS);
    }
  }
  return JIRA_SEARCH_RETRY_DELAYS_MS[attempt] ?? 0;
}

export async function fetchJiraSearch<SearchPage extends JiraSearchPage = JiraSearchResponse>(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
  schema: z.ZodType<SearchPage> = jiraSearchResponseSchema as unknown as z.ZodType<SearchPage>,
  deadlineAt?: number,
  retryBudget: JiraSearchRetryBudget = { remaining: JIRA_SEARCH_MAX_ATTEMPTS - 1 },
): Promise<JiraSearchResult<SearchPage>> {
  let lastErrorBody = '';
  let lastStatus = 0;
  const paths = jiraSearchPaths();

  for (const [index, path] of paths.entries()) {
    const isLastPath = index === paths.length - 1;
    for (let attempt = 0; attempt < JIRA_SEARCH_MAX_ATTEMPTS; attempt += 1) {
      const startedAt = Date.now();
      let response: Response;
      try {
        response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
          method: 'POST',
          redirect: 'manual',
          headers: {
            ...authHeaders,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: searchBody,
          signal: jiraRequestTimeout(deadlineAt, JIRA_SEARCH_TIMEOUT_MS),
        });
      } catch (error) {
        logEvent('warn', 'jira.search.failed', {
          path,
          attempt: attempt + 1,
          durationMs: Date.now() - startedAt,
          reason: error instanceof Error ? error.name : 'unknown',
        });
        throw jiraTimeoutError(error, 'Поиск Jira');
      }
      logEvent(response.ok ? 'info' : 'warn', 'jira.search.completed', {
        path,
        attempt: attempt + 1,
        status: response.status,
        durationMs: Date.now() - startedAt,
      });

      if (response.ok) {
        if (!isJsonResponse(response)) {
          return { parsed: null, status: response.status, body: await response.text() };
        }

        try {
          return {
            parsed: schema.parse(await response.json()),
            status: response.status,
            body: '',
          };
        } catch (error) {
          return {
            parsed: null,
            status: response.status,
            body: error instanceof Error ? error.message : 'Jira response is not valid JSON',
          };
        }
      }

      lastStatus = response.status;
      lastErrorBody =
        response.status >= 300 && response.status < 400
          ? `Redirected to ${response.headers.get('location') ?? 'unknown location'}`
          : await response.text();
      if (response.status === 400 && isAnonymousFieldVisibilityError(lastErrorBody)) {
        return { parsed: null, status: lastStatus, body: lastErrorBody };
      }
      if (
        [401, 403].includes(response.status) ||
        (response.status >= 300 && response.status < 400)
      ) {
        return { parsed: null, status: lastStatus, body: lastErrorBody };
      }
      if (
        JIRA_SEARCH_RETRYABLE_STATUSES.has(response.status) &&
        attempt < JIRA_SEARCH_MAX_ATTEMPTS - 1 &&
        retryBudget.remaining > 0
      ) {
        const delayMs = jiraSearchRetryDelay(response, attempt);
        if (deadlineAt !== undefined && Date.now() + delayMs >= deadlineAt) {
          logEvent('warn', 'jira.search.retry_skipped', {
            path,
            attempt: attempt + 1,
            status: response.status,
            reason: 'deadline',
          });
          throw new JiraSyncDeadlineError(
            `Превышен общий лимит времени синхронизации Jira после ответа ${response.status}`,
          );
        }
        retryBudget.remaining -= 1;
        logEvent('warn', 'jira.search.retry_scheduled', {
          path,
          attempt: attempt + 1,
          status: response.status,
          delayMs,
          retriesRemaining: retryBudget.remaining,
        });
        if (delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
        continue;
      }
      if (JIRA_SEARCH_RETRYABLE_STATUSES.has(response.status)) {
        logEvent('warn', 'jira.search.retry_exhausted', {
          path,
          attempt: attempt + 1,
          status: response.status,
          retriesRemaining: retryBudget.remaining,
        });
      }
      if ([404, 405, 410].includes(response.status) && !isLastPath) {
        break;
      }
      throw new Error(
        `Jira request failed: ${response.status} ${cleanJiraErrorBody(lastErrorBody)}`,
      );
    }
  }

  return { parsed: null, status: lastStatus, body: lastErrorBody };
}

export const JIRA_SEARCH_MAX_PAGES = 1_000;
export const JIRA_CHANGELOG_CONCURRENCY = 5;

export async function mapWithConcurrency<T, Result>(
  values: readonly T[],
  concurrency: number,
  callback: (value: T) => Promise<Result>,
) {
  const results = new Array<Result>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await callback(values[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, values.length) },
      () => worker(),
    ),
  );
  return results;
}

export async function fetchCompleteJiraSearch(
  baseUrl: string,
  jql: string,
  requestedPageSize: number,
  firstPage: JiraSearchResponse,
  authHeaders: Record<string, string>,
  analyticsFieldIds: readonly string[] | null,
  includeChangelog: boolean,
  capacitySample: boolean,
  fullHistory: boolean,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
) {
  const issuesByKey = new Map(firstPage.issues.map((issue) => [issue.key, issue]));
  if (issuesByKey.size !== firstPage.issues.length) {
    throw new Error('Jira search first page contains duplicate issue keys');
  }
  let names = firstPage.names;
  let schema = firstPage.schema;
  let page = firstPage;
  let total = firstPage.total;

  for (let pageIndex = 0; pageIndex < JIRA_SEARCH_MAX_PAGES; pageIndex += 1) {
    const pageStartAt = page.startAt ?? (pageIndex === 0 ? 0 : undefined);
    if (pageStartAt === undefined) {
      throw new Error('Jira search pagination failed: response does not contain startAt');
    }
    const pageEnd = pageStartAt + page.issues.length;
    const pageSize = Math.max(1, page.maxResults ?? requestedPageSize);
    const reachedEnd =
      total !== undefined ? pageEnd >= total : page.issues.length < pageSize;
    if (reachedEnd) {
      if (total !== undefined && issuesByKey.size !== total) {
        throw new Error(
          `Jira search pagination returned ${issuesByKey.size} unique issues, expected ${total}`,
        );
      }
      return {
        ...firstPage,
        startAt: 0,
        maxResults: issuesByKey.size,
        total: total ?? issuesByKey.size,
        names,
        schema,
        issues: Array.from(issuesByKey.values()),
      } satisfies JiraSearchResponse;
    }
    if (page.issues.length === 0) {
      throw new Error(
        `Jira search pagination stopped at ${pageStartAt} before total ${total ?? 'unknown'}`,
      );
    }

    const result = await fetchJiraSearch(
      baseUrl,
      jiraSearchBody(jql, requestedPageSize, pageEnd, {
        analyticsFieldIds,
        includeChangelog,
        capacitySample,
        fullHistory,
      }),
      authHeaders,
      jiraSearchResponseSchema,
      deadlineAt,
      retryBudget,
    );
    if (!result.parsed) {
      throw new Error(
        `Jira search pagination failed at ${pageEnd}: ${result.status || 'unknown'} ${
          result.body ? cleanJiraErrorBody(result.body) : ''
        }`.trim(),
      );
    }

    const returnedStartAt = result.parsed.startAt ?? pageEnd;
    if (returnedStartAt !== pageEnd) {
      throw new Error(
        `Jira search pagination returned startAt ${returnedStartAt}, expected ${pageEnd}`,
      );
    }
    if (
      total !== undefined &&
      result.parsed.total !== undefined &&
      result.parsed.total !== total
    ) {
      throw new Error(
        `Jira search total changed from ${total} to ${result.parsed.total} during pagination`,
      );
    }
    page = { ...result.parsed, startAt: returnedStartAt };
    const uniqueIssueCount = issuesByKey.size;
    for (const issue of page.issues) issuesByKey.set(issue.key, issue);
    if (issuesByKey.size - uniqueIssueCount !== page.issues.length) {
      throw new Error(`Jira search pages overlap at startAt ${returnedStartAt}`);
    }
    names = { ...names, ...page.names };
    schema = { ...schema, ...page.schema };
    total = page.total ?? total;
  }

  throw new Error(`Jira search pagination exceeded ${JIRA_SEARCH_MAX_PAGES} pages`);
}

export const JIRA_LABEL_SCOPE_MAX_ISSUES = 10_000;

export class JiraIssueKeyPaginationConsistencyError extends Error {}

export async function fetchCompleteJiraIssueKeySearchPass(
  baseUrl: string,
  jql: string,
  requestedPageSize: number,
  firstPage: JiraIssueKeySearchResponse,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
) {
  const issueKeys = new Set(firstPage.issues.map((issue) => issue.key));
  if (issueKeys.size !== firstPage.issues.length) {
    throw new JiraIssueKeyPaginationConsistencyError(
      'Jira key discovery first page contains duplicate issue keys',
    );
  }
  let page = firstPage;
  let observedTotal = firstPage.total;

  for (let pageIndex = 0; pageIndex < JIRA_SEARCH_MAX_PAGES; pageIndex += 1) {
    if (issueKeys.size > JIRA_LABEL_SCOPE_MAX_ISSUES) {
      throw new Error(
        `Лейбл Jira охватывает больше ${JIRA_LABEL_SCOPE_MAX_ISSUES} тикетов; уточните лейбл`,
      );
    }
    const pageStartAt = page.startAt ?? (pageIndex === 0 ? 0 : undefined);
    if (pageStartAt === undefined) {
      throw new Error('Jira key discovery pagination does not contain startAt');
    }
    const pageEnd = pageStartAt + page.issues.length;
    const pageSize = Math.max(1, page.maxResults ?? requestedPageSize);
    const currentTotal = page.total ?? observedTotal;
    const reachedEnd =
      currentTotal !== undefined ? pageEnd >= currentTotal : page.issues.length < pageSize;
    if (reachedEnd || page.issues.length === 0) {
      if (currentTotal !== undefined && issueKeys.size !== currentTotal) {
        throw new JiraIssueKeyPaginationConsistencyError(
          `Jira key discovery returned ${issueKeys.size} unique issues, expected ${currentTotal}`,
        );
      }
      return [...issueKeys];
    }

    const result = await fetchJiraSearch(
      baseUrl,
      jiraSearchBody(jql, requestedPageSize, pageEnd, { keysOnly: true }),
      authHeaders,
      jiraIssueKeySearchResponseSchema,
      deadlineAt,
      retryBudget,
    );
    if (!result.parsed) {
      throw new Error(
        `Jira key discovery pagination failed at ${pageEnd}: ${result.status || 'unknown'} ${
          result.body ? cleanJiraErrorBody(result.body) : ''
        }`.trim(),
      );
    }
    const returnedStartAt = result.parsed.startAt ?? pageEnd;
    if (returnedStartAt !== pageEnd) {
      throw new JiraIssueKeyPaginationConsistencyError(
        `Jira key discovery returned startAt ${returnedStartAt}, expected ${pageEnd}`,
      );
    }
    if (
      observedTotal !== undefined &&
      result.parsed.total !== undefined &&
      result.parsed.total !== observedTotal
    ) {
      throw new JiraIssueKeyPaginationConsistencyError(
        `Jira key discovery total changed from ${observedTotal} to ${result.parsed.total}`,
      );
    }
    page = { ...result.parsed, startAt: returnedStartAt };
    const sizeBefore = issueKeys.size;
    page.issues.forEach((issue) => issueKeys.add(issue.key));
    if (issueKeys.size - sizeBefore !== page.issues.length) {
      throw new JiraIssueKeyPaginationConsistencyError(
        `Jira key discovery pages overlap at startAt ${returnedStartAt}`,
      );
    }
    observedTotal = page.total ?? observedTotal;
  }

  throw new Error(`Jira key discovery exceeded ${JIRA_SEARCH_MAX_PAGES} pages`);
}

export async function fetchCompleteJiraIssueKeySearch(
  baseUrl: string,
  jql: string,
  requestedPageSize: number,
  firstPage: JiraIssueKeySearchResponse,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
) {
  try {
    return await fetchCompleteJiraIssueKeySearchPass(
      baseUrl,
      jql,
      requestedPageSize,
      firstPage,
      authHeaders,
      deadlineAt,
      retryBudget,
    );
  } catch (error) {
    if (!(error instanceof JiraIssueKeyPaginationConsistencyError)) throw error;
    logEvent('warn', 'jira.search.discovery_restarted', {
      reason: error.message,
    });
  }

  const restarted = await fetchJiraSearch(
    baseUrl,
    jiraSearchBody(jql, requestedPageSize, 0, { keysOnly: true }),
    authHeaders,
    jiraIssueKeySearchResponseSchema,
    deadlineAt,
    retryBudget,
  );
  if (!restarted.parsed) {
    throw new Error(
      `Jira key discovery restart failed: ${restarted.status || 'unknown'} ${
        restarted.body ? cleanJiraErrorBody(restarted.body) : ''
      }`.trim(),
    );
  }
  if (
    ((firstPage.total ?? firstPage.issues.length) > 0 || firstPage.issues.length > 0) &&
    restarted.parsed.issues.length === 0
  ) {
    throw new Error(
      'Jira key discovery restart unexpectedly returned an empty scope after a non-empty first pass',
    );
  }
  return fetchCompleteJiraIssueKeySearchPass(
    baseUrl,
    jql,
    requestedPageSize,
    restarted.parsed,
    authHeaders,
    deadlineAt,
    retryBudget,
  );
}

export const JIRA_CHANGELOG_PAGE_SIZE = 100;
export const JIRA_CHANGELOG_MAX_PAGES = 100;

export function jiraChangelogHistoryKey(
  history: z.infer<typeof jiraChangelogHistorySchema>,
) {
  return history.id ?? `${history.created}:${JSON.stringify(history.items)}`;
}

export async function fetchJiraChangelogPage(
  baseUrl: string,
  issueKey: string,
  startAt: number,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
): Promise<JiraChangelogPage | null> {
  const encodedKey = encodeURIComponent(issueKey);
  const query = `startAt=${startAt}&maxResults=${JIRA_CHANGELOG_PAGE_SIZE}`;
  const paths = [
    `/rest/api/2/issue/${encodedKey}/changelog?${query}`,
    `/rest/api/3/issue/${encodedKey}/changelog?${query}`,
  ];

  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, JIRA_CHANGELOG_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraTimeoutError(error, `Загрузка changelog Jira для ${issueKey}`);
    }
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) continue;
    if (!response.ok) {
      throw new Error(
        `Jira changelog request failed for ${issueKey}: ${response.status} ${cleanJiraErrorBody(
          await response.text(),
        )}`,
      );
    }
    if (!isJsonResponse(response)) continue;

    const payload = await response.json();
    const valuesPage = jiraChangelogValuesPageSchema.safeParse(payload);
    if (valuesPage.success) {
      return {
        startAt: valuesPage.data.startAt,
        maxResults: valuesPage.data.maxResults,
        total: valuesPage.data.total,
        histories: valuesPage.data.values,
      };
    }
    const historiesPage = jiraChangelogPageSchema.safeParse(payload);
    if (historiesPage.success) return historiesPage.data;
  }

  return null;
}

export async function fetchJiraExpandedChangelog(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
): Promise<JiraChangelogPage | null> {
  const encodedKey = encodeURIComponent(issueKey);
  const paths = [
    `/rest/api/2/issue/${encodedKey}?fields=updated&expand=changelog`,
    `/rest/api/3/issue/${encodedKey}?fields=updated&expand=changelog`,
  ];

  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, JIRA_CHANGELOG_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraTimeoutError(error, `Загрузка changelog Jira для ${issueKey}`);
    }
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) continue;
    if (!response.ok) {
      throw new Error(
        `Jira issue changelog request failed for ${issueKey}: ${response.status} ${cleanJiraErrorBody(
          await response.text(),
        )}`,
      );
    }
    if (!isJsonResponse(response)) continue;
    const parsed = jiraIssueChangelogResponseSchema.safeParse(await response.json());
    if (parsed.success) return parsed.data.changelog;
  }

  return null;
}

export async function hydrateJiraIssueChangelog(
  baseUrl: string,
  issue: JiraSearchResponse['issues'][number],
  authHeaders: Record<string, string>,
  deadlineAt?: number,
) {
  if (jiraChangelogPageComplete(issue.changelog)) return issue;

  const histories = [...(issue.changelog?.histories ?? [])];
  const historyKeys = new Set(histories.map(jiraChangelogHistoryKey));
  let total = issue.changelog?.total;
  let nextStartAt = (issue.changelog?.startAt ?? 0) + histories.length;
  let complete = false;
  let dedicatedEndpointAvailable = true;

  for (let pageIndex = 0; pageIndex < JIRA_CHANGELOG_MAX_PAGES; pageIndex += 1) {
    const page = await fetchJiraChangelogPage(
      baseUrl,
      issue.key,
      nextStartAt,
      authHeaders,
      deadlineAt,
    );
    if (!page) {
      dedicatedEndpointAvailable = false;
      break;
    }

    let added = 0;
    for (const history of page.histories) {
      const key = jiraChangelogHistoryKey(history);
      if (historyKeys.has(key)) continue;
      historyKeys.add(key);
      histories.push(history);
      added += 1;
    }
    total = page.total ?? total;
    const pageStartAt = page.startAt ?? nextStartAt;
    const pageEnd = pageStartAt + page.histories.length;
    if (
      page.histories.length === 0 ||
      (total !== undefined && pageEnd >= total) ||
      (total === undefined && page.histories.length < (page.maxResults ?? JIRA_CHANGELOG_PAGE_SIZE))
    ) {
      complete = total === undefined || histories.length >= total;
      break;
    }
    if (pageEnd <= nextStartAt || added === 0) break;
    nextStartAt = pageEnd;
  }

  if (complete) {
    return {
      ...issue,
      changelog: {
        startAt: 0,
        maxResults: histories.length,
        total: total ?? histories.length,
        histories,
      },
    };
  }

  const expanded = await fetchJiraExpandedChangelog(
    baseUrl,
    issue.key,
    authHeaders,
    deadlineAt,
  );
  if (!expanded) return issue;
  const useExpanded =
    jiraChangelogPageComplete(expanded) ||
    !dedicatedEndpointAvailable ||
    expanded.histories.length > histories.length;
  return useExpanded ? { ...issue, changelog: expanded } : issue;
}

export const JIRA_EMBEDDED_COLLECTION_PAGE_SIZE = 100;
export const JIRA_EMBEDDED_COLLECTION_MAX_PAGES = 100;

export type JiraHydratedCollection = {
  entries: unknown[];
  complete: boolean;
};

export function embeddedJiraCollection(value: unknown, key: 'comments' | 'worklogs') {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const entries = Array.isArray(record[key]) ? record[key] : [];
  const startAt = typeof record.startAt === 'number' ? record.startAt : 0;
  const maxResults = typeof record.maxResults === 'number' ? record.maxResults : entries.length;
  const total = typeof record.total === 'number' ? record.total : entries.length;
  return { entries, startAt, maxResults, total };
}

export function jiraCollectionEntryKey(value: unknown, index: number) {
  if (value && typeof value === 'object') {
    const id = (value as Record<string, unknown>).id;
    if (typeof id === 'string' || typeof id === 'number') return `id:${id}`;
  }
  return `value:${index}:${JSON.stringify(value)}`;
}

export async function fetchJiraCollectionPage(
  baseUrl: string,
  issueKey: string,
  collection: 'comment' | 'worklog',
  startAt: number,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
) {
  const entryKey = collection === 'comment' ? 'comments' : 'worklogs';
  const encodedKey = encodeURIComponent(issueKey);
  const query = `startAt=${startAt}&maxResults=${JIRA_EMBEDDED_COLLECTION_PAGE_SIZE}`;
  const paths = [
    `/rest/api/2/issue/${encodedKey}/${collection}?${query}`,
    `/rest/api/3/issue/${encodedKey}/${collection}?${query}`,
  ];
  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, JIRA_CHANGELOG_TIMEOUT_MS),
      });
    } catch (error) {
      throw jiraTimeoutError(error, `Загрузка ${collection} Jira для ${issueKey}`);
    }
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) {
      await response.text();
      continue;
    }
    if (!response.ok || !isJsonResponse(response)) {
      await response.text();
      continue;
    }
    const payload = await response.json() as unknown;
    const parsed = embeddedJiraCollection(payload, entryKey);
    if (parsed) return parsed;
  }
  return null;
}

export async function hydrateJiraCollection(
  baseUrl: string,
  issueKey: string,
  embedded: unknown,
  collection: 'comment' | 'worklog',
  authHeaders: Record<string, string>,
  deadlineAt?: number,
): Promise<JiraHydratedCollection> {
  const entryKey = collection === 'comment' ? 'comments' : 'worklogs';
  const initial = embeddedJiraCollection(embedded, entryKey);
  if (initial && initial.startAt === 0 && initial.entries.length >= initial.total) {
    return { entries: initial.entries, complete: true };
  }

  const entries: unknown[] = [];
  const keys = new Set<string>();
  let nextStartAt = 0;
  let expectedTotal: number | undefined;
  for (let pageIndex = 0; pageIndex < JIRA_EMBEDDED_COLLECTION_MAX_PAGES; pageIndex += 1) {
    const page = await fetchJiraCollectionPage(
      baseUrl,
      issueKey,
      collection,
      nextStartAt,
      authHeaders,
      deadlineAt,
    );
    if (!page) return { entries, complete: false };
    if (page.startAt !== nextStartAt) return { entries, complete: false };
    if (expectedTotal !== undefined && page.total !== expectedTotal) {
      return { entries, complete: false };
    }
    expectedTotal = page.total;
    for (const [index, entry] of page.entries.entries()) {
      const key = jiraCollectionEntryKey(entry, nextStartAt + index);
      if (keys.has(key)) return { entries, complete: false };
      keys.add(key);
      entries.push(entry);
    }
    const pageEnd = page.startAt + page.entries.length;
    if (pageEnd >= page.total) {
      return { entries, complete: entries.length === page.total };
    }
    if (page.entries.length === 0 || pageEnd <= nextStartAt) {
      return { entries, complete: false };
    }
    nextStartAt = pageEnd;
  }
  return { entries, complete: false };
}

export async function fetchJiraRemoteLinks(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
) {
  const encodedKey = encodeURIComponent(issueKey);
  const paths = [
    `/rest/api/2/issue/${encodedKey}/remotelink`,
    `/rest/api/3/issue/${encodedKey}/remotelink`,
  ];
  for (const path of paths) {
    let response: Response;
    try {
      response = await fetchJiraReadOnly(`${baseUrl}${path}`, {
        method: 'GET',
        redirect: 'manual',
        headers: { ...authHeaders, Accept: 'application/json' },
        signal: jiraRequestTimeout(deadlineAt, 15_000),
      });
    } catch (error) {
      if (error instanceof JiraReadOnlyRequestError || error instanceof JiraSyncDeadlineError) {
        throw error;
      }
      if (deadlineAt !== undefined && deadlineAt <= Date.now()) {
        throw new JiraSyncDeadlineError('Превышен общий лимит времени синхронизации Jira');
      }
      return null;
    }
    if ([400, 401, 403, 404, 405, 410].includes(response.status)) {
      await response.text();
      continue;
    }
    if (!response.ok) {
      await response.text();
      return null;
    }
    if (!isJsonResponse(response)) {
      await response.text();
      continue;
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      continue;
    }
    const parsed = jiraRemoteIssueLinksSchema.safeParse(payload);
    if (parsed.success) return parsed.data;
  }
  return null;
}

export async function fetchJiraRemoteDevelopment(
  baseUrl: string,
  issueKey: string,
  authHeaders: Record<string, string>,
  deadlineAt?: number,
) {
  const links = await fetchJiraRemoteLinks(baseUrl, issueKey, authHeaders, deadlineAt);
  return links ? jiraDevelopmentFromRemoteLinks(links) : null;
}

export async function fetchJiraSearchWithVerifiedEmptyResult<
  SearchPage extends JiraSearchPage = JiraSearchResponse,
>(
  baseUrl: string,
  searchBody: string,
  authHeaders: Record<string, string>,
  expectedIdentities: string[],
  schema: z.ZodType<SearchPage> = jiraSearchResponseSchema as unknown as z.ZodType<SearchPage>,
  deadlineAt?: number,
  retryBudget?: JiraSearchRetryBudget,
): Promise<JiraSearchResult<SearchPage>> {
  const result = await fetchJiraSearch(
    baseUrl,
    searchBody,
    authHeaders,
    schema,
    deadlineAt,
    retryBudget,
  );
  if (!result.parsed || result.parsed.issues.length > 0) return result;

  const currentUser = await fetchJiraCurrentUser(baseUrl, authHeaders, expectedIdentities);
  if (currentUser.authenticated) {
    return {
      ...result,
      jiraUser: currentUser.identity,
    };
  }

  return {
    parsed: null,
    status: currentUser.status || result.status,
    body: `Jira authentication verification failed: ${
      currentUser.status || 'unknown'
    } ${currentUser.body ? cleanJiraErrorBody(currentUser.body) : ''}`.trim(),
  };
}
