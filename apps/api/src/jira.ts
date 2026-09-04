import {
  JiraReadOnlyRequestError,
  JiraSearchFailureError,
  JiraSyncDeadlineError,
  cleanJiraErrorBody,
  expectedJiraIdentities,
  fetchJiraFilterJql,
  fetchJiraSessionCookie,
  fetchJiraWebLoginCookie,
  isAnonymousFieldVisibilityError,
  isJiraAuthVerificationFailure,
  jiraAuthAttempts,
  jiraLoginCandidates,
  nonEmpty,
  normalizedBaseUrl,
  resolveJiraConfig,
} from "./jira-client.js";
import {
  jiraAnalyticsFieldIds,
  jiraCriticalPriorityAt,
  jiraDevelopmentFromFields,
  jiraDevelopmentFromRemoteLinks,
  jiraEpicKey,
  jiraJqlWithAnalyticsScope,
  jiraLabelChanges,
  jiraObjectString,
  jiraPriorityAtResolution,
  jiraSearchBody,
  jiraSprintAvailable,
  jiraSprintFromFields,
  jiraSprintIdsFromFields,
  jiraStatusTransitions,
  jiraStringArray,
  jiraTransitionHistoryComplete,
  measureJiraIssueCapacity,
  parseJiraDate,
  savedFilterIdFromJql,
  selectJiraDevelopment,
} from "./jira-data.js";
import { jiraChangelogPageComplete } from "./jira-changelog.js";
import {
  jiraIssueKeySearchResponseSchema,
  jiraSearchResponseSchema,
  normalizedJiraIssueKey,
  type JiraConfig,
  type JiraConfigOptions,
  type JiraIssue,
  type JiraIssueFetchResult,
  type JiraIssueKeyFetchResult,
  type JiraIssueKeySearchResponse,
  type JiraSearchPage,
  type JiraSearchResponse,
} from "./jira-model.js";
import {
  JIRA_CHANGELOG_CONCURRENCY,
  JIRA_SEARCH_MAX_ATTEMPTS,
  fetchCompleteJiraIssueKeySearch,
  fetchCompleteJiraSearch,
  fetchJiraRemoteDevelopment,
  fetchJiraRemoteLinks,
  fetchJiraSearchWithVerifiedEmptyResult,
  hydrateJiraCollection,
  hydrateJiraIssueChangelog,
  mapWithConcurrency,
} from "./jira-search.js";
import { sanitizeJiraVersionPayload } from "./services/jira-version-canonical.js";

export * from "./jira-client.js";
export * from "./jira-data.js";
export * from "./jira-model.js";
export * from "./jira-search.js";

async function jiraHistoryRequestOrFallback<Result>(
  request: Promise<Result>,
  fallback: Result,
) {
  try {
    return await request;
  } catch (error) {
    if (error instanceof JiraReadOnlyRequestError || error instanceof JiraSyncDeadlineError) {
      throw error;
    }
    return fallback;
  }
}

async function hydrateJiraSearchIssues(
  baseUrl: string,
  parsed: JiraSearchResponse,
  authHeaders: Record<string, string>,
  includeChangelog: boolean,
  includeRemoteDevelopment: boolean,
  includeHistoryDocument: boolean,
  remoteDevelopmentCache?: Map<string, JiraIssue['development']>,
  deadlineAt?: number,
) {
  const hydrated = await mapWithConcurrency(
    parsed.issues,
    JIRA_CHANGELOG_CONCURRENCY,
    async (issue) => {
      const cachedDevelopment = remoteDevelopmentCache?.get(issue.key);
      const fields = issue.fields as Record<string, unknown> & typeof issue.fields;
      const [hydratedIssue, remoteLinks, comments, worklogs] = await Promise.all([
        includeChangelog
          ? includeHistoryDocument
            ? jiraHistoryRequestOrFallback(
                hydrateJiraIssueChangelog(baseUrl, issue, authHeaders, deadlineAt),
                issue,
              )
            : hydrateJiraIssueChangelog(baseUrl, issue, authHeaders, deadlineAt)
          : Promise.resolve(issue),
        includeRemoteDevelopment || includeHistoryDocument
          ? includeHistoryDocument
            ? jiraHistoryRequestOrFallback(
                fetchJiraRemoteLinks(baseUrl, issue.key, authHeaders, deadlineAt),
                null,
              )
            : Promise.resolve(null)
          : Promise.resolve(null),
        includeHistoryDocument
          ? jiraHistoryRequestOrFallback(
              hydrateJiraCollection(
                baseUrl,
                issue.key,
                fields.comment,
                'comment',
                authHeaders,
                deadlineAt,
              ),
              { entries: [], complete: false },
            )
          : Promise.resolve({ entries: [], complete: false }),
        includeHistoryDocument
          ? jiraHistoryRequestOrFallback(
              hydrateJiraCollection(
                baseUrl,
                issue.key,
                fields.worklog,
                'worklog',
                authHeaders,
                deadlineAt,
              ),
              { entries: [], complete: false },
            )
          : Promise.resolve({ entries: [], complete: false }),
      ]);
      const fetchedRemoteDevelopment = remoteLinks
        ? jiraDevelopmentFromRemoteLinks(remoteLinks)
        : includeRemoteDevelopment && !includeHistoryDocument
          ? cachedDevelopment ?? await fetchJiraRemoteDevelopment(
              baseUrl,
              issue.key,
              authHeaders,
              deadlineAt,
            )
          : null;
      const remoteDevelopment = includeRemoteDevelopment
        ? fetchedRemoteDevelopment ?? {
            commitCount: 0,
            mergeRequestCount: 0,
            updatedAt: null,
            available: false,
          }
        : null;
      if (includeRemoteDevelopment && !cachedDevelopment && remoteDevelopment) {
        remoteDevelopmentCache?.set(issue.key, remoteDevelopment);
      }
      const history = includeHistoryDocument
        ? sanitizeJiraVersionPayload({
            issue: {
              ...hydratedIssue,
              fields: {
                ...(hydratedIssue.fields as Record<string, unknown>),
                comment: undefined,
                worklog: undefined,
              },
              changelog: undefined,
            },
            changelog: hydratedIssue.changelog?.histories ?? [],
            comments: comments.entries,
            worklogs: worklogs.entries,
            remoteLinks: remoteLinks ?? [],
          })
        : null;
      return {
        issue: hydratedIssue,
        remoteDevelopment,
        history: history
          ? {
              ...history,
              changelogComplete: jiraChangelogPageComplete(hydratedIssue.changelog),
              commentsComplete: comments.complete,
              worklogsComplete: worklogs.complete,
              remoteLinksComplete: remoteLinks !== null,
            }
          : null,
      };
    },
  );
  return {
    search: { ...parsed, issues: hydrated.map((entry) => entry.issue) },
    remoteDevelopmentByKey: new Map(
      hydrated.map((entry) => [entry.issue.key, entry.remoteDevelopment]),
    ),
    historyByKey: new Map(hydrated.map((entry) => [entry.issue.key, entry.history])),
  };
}


export async function fetchJiraIssues(
  jql: string,
  options: JiraConfigOptions = {},
): Promise<JiraIssue[]> {
  return (await fetchJiraIssuesWithMeta(jql, options)).issues;
}

export async function fetchJiraIssuesWithMeta(
  jql: string,
  options: JiraConfigOptions = {},
): Promise<JiraIssueFetchResult> {
  return fetchJiraDataWithMeta(jql, options, false) as Promise<JiraIssueFetchResult>;
}

export async function fetchJiraIssueKeys(
  jql: string,
  options: JiraConfigOptions = {},
) {
  return (await fetchJiraIssueKeysWithMeta(jql, options)).issueKeys;
}

export async function fetchJiraIssueKeysWithMeta(
  jql: string,
  options: JiraConfigOptions = {},
): Promise<JiraIssueKeyFetchResult> {
  const result = await fetchJiraDataWithMeta(
    jql,
    options,
    true,
  ) as JiraIssueKeyFetchResult;
  const issueKeys = [...new Set(result.issueKeys.map((issueKey) => {
    const normalized = normalizedJiraIssueKey(issueKey);
    if (!normalized) throw new Error(`Jira вернула некорректный ключ тикета: ${issueKey}`);
    return normalized;
  }))];
  return { ...result, issueKeys };
}

async function fetchJiraDataWithMeta(
  jql: string,
  options: JiraConfigOptions,
  keysOnly: boolean,
): Promise<JiraIssueFetchResult | JiraIssueKeyFetchResult> {
  const { enabled, baseUrl, email, token, maxResults } = resolveJiraConfig(process.env, options);

  if (!enabled || !baseUrl || !token) {
    throw new Error('Jira is not configured');
  }

  const savedFilterId = savedFilterIdFromJql(jql);
  let lastErrorBody = '';
  let lastStatus = 0;
  const authAttempts = jiraAuthAttempts(email, token);
  const attemptedMethods: string[] = [];
  let lastFailure: 'auth' | 'filter' = 'auth';
  let sawAnonymousSearch = false;
  let authVerificationBody = '';
  let parsed: JiraSearchPage | null = null;
  let successfulAuthHeaders: Record<string, string> | null = null;
  let successfulJql = jql;
  let successfulAnalyticsFieldIds: string[] | null = null;
  let jiraUser: string | null = null;
  const expectedIdentities = expectedJiraIdentities(email);
  const searchRetryBudget = { remaining: JIRA_SEARCH_MAX_ATTEMPTS - 1 };
  const searchSchema = keysOnly
    ? jiraIssueKeySearchResponseSchema
    : jiraSearchResponseSchema;
  const includeChangelog = options.includeChangelog !== false;
  const includeRemoteDevelopment =
    options.includeRemoteDevelopment ?? Boolean(options.includeAnalyticsFields);
  const buildSearchBody = (effectiveJql: string, startAt: number) =>
    jiraSearchBody(effectiveJql, maxResults, startAt, {
      analyticsFieldIds: !keysOnly && options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null,
      includeChangelog,
      keysOnly,
      capacitySample: !keysOnly && options.capacitySample === true,
      fullHistory: !keysOnly && options.includeHistoryDocument === true,
    });
  const analyticsScope = options.analyticsScope ?? (
    options.labelScope ? { type: 'LABEL' as const, value: options.labelScope } : null
  );
  const applyAnalyticsScope = (effectiveJql: string) =>
    analyticsScope
      ? jiraJqlWithAnalyticsScope(effectiveJql, analyticsScope)
      : effectiveJql;

  for (const authAttempt of authAttempts) {
    attemptedMethods.push(authAttempt.label);
    let effectiveJql = jql;
    if (savedFilterId) {
      const filter = await fetchJiraFilterJql(baseUrl, savedFilterId, authAttempt.headers);
      lastStatus = filter.status;
      lastErrorBody = filter.body;
      if (!filter.jql) {
        lastFailure = 'filter';
        continue;
      }
      effectiveJql = filter.jql;
    }

    effectiveJql = applyAnalyticsScope(effectiveJql);
    const analyticsFieldIds = !keysOnly && options.includeAnalyticsFields
      ? jiraAnalyticsFieldIds()
      : null;
    const result = await fetchJiraSearchWithVerifiedEmptyResult(
      baseUrl,
      buildSearchBody(effectiveJql, 0),
      authAttempt.headers,
      expectedIdentities,
      searchSchema,
      options.deadlineAt,
      searchRetryBudget,
    );
    parsed = result.parsed;
    jiraUser = result.jiraUser ?? jiraUser;
    lastStatus = result.status;
    lastErrorBody = result.body;
    if (isJiraAuthVerificationFailure(result.body)) {
      authVerificationBody = result.body;
    }
    sawAnonymousSearch ||=
      isAnonymousFieldVisibilityError(result.body) || isJiraAuthVerificationFailure(result.body);
    if (parsed) {
      successfulAuthHeaders = authAttempt.headers;
      successfulJql = effectiveJql;
      successfulAnalyticsFieldIds = analyticsFieldIds;
      break;
    }
  }

  if (!parsed) {
    for (const candidate of jiraLoginCandidates(email)) {
      attemptedMethods.push(`session:${candidate.label}`);
      const session = await fetchJiraSessionCookie(baseUrl, candidate.login, token);
      lastStatus = session.status;
      lastErrorBody = session.body;
      if (!session.cookie) continue;

      let effectiveJql = jql;
      if (savedFilterId) {
        const filter = await fetchJiraFilterJql(baseUrl, savedFilterId, {
          Cookie: session.cookie,
        });
        lastStatus = filter.status;
        lastErrorBody = filter.body;
        if (!filter.jql) {
          lastFailure = 'filter';
          continue;
        }
        effectiveJql = filter.jql;
      }

      const authHeaders = { Cookie: session.cookie };
      effectiveJql = applyAnalyticsScope(effectiveJql);
      const analyticsFieldIds = !keysOnly && options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null;
      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        buildSearchBody(effectiveJql, 0),
        authHeaders,
        expectedIdentities,
        searchSchema,
        options.deadlineAt,
        searchRetryBudget,
      );
      parsed = result.parsed;
      jiraUser = result.jiraUser ?? jiraUser;
      lastStatus = result.status;
      lastErrorBody = result.body;
      if (isJiraAuthVerificationFailure(result.body)) {
        authVerificationBody = result.body;
      }
      sawAnonymousSearch ||=
        isAnonymousFieldVisibilityError(result.body) || isJiraAuthVerificationFailure(result.body);
      if (parsed) {
        successfulAuthHeaders = authHeaders;
        successfulJql = effectiveJql;
        successfulAnalyticsFieldIds = analyticsFieldIds;
        break;
      }
    }
  }

  if (!parsed) {
    for (const candidate of jiraLoginCandidates(email)) {
      attemptedMethods.push(`web-login:${candidate.label}`);
      const login = await fetchJiraWebLoginCookie(baseUrl, candidate.login, token);
      lastStatus = login.status;
      lastErrorBody = login.body;
      if (!login.cookie) continue;

      let effectiveJql = jql;
      if (savedFilterId) {
        const filter = await fetchJiraFilterJql(baseUrl, savedFilterId, {
          Cookie: login.cookie,
        });
        lastStatus = filter.status;
        lastErrorBody = filter.body;
        if (!filter.jql) {
          lastFailure = 'filter';
          continue;
        }
        effectiveJql = filter.jql;
      }

      const authHeaders = { Cookie: login.cookie };
      effectiveJql = applyAnalyticsScope(effectiveJql);
      const analyticsFieldIds = !keysOnly && options.includeAnalyticsFields
        ? jiraAnalyticsFieldIds()
        : null;
      const result = await fetchJiraSearchWithVerifiedEmptyResult(
        baseUrl,
        buildSearchBody(effectiveJql, 0),
        authHeaders,
        expectedIdentities,
        searchSchema,
        options.deadlineAt,
        searchRetryBudget,
      );
      parsed = result.parsed;
      jiraUser = result.jiraUser ?? jiraUser;
      lastStatus = result.status;
      lastErrorBody = result.body;
      if (isJiraAuthVerificationFailure(result.body)) {
        authVerificationBody = result.body;
      }
      sawAnonymousSearch ||=
        isAnonymousFieldVisibilityError(result.body) || isJiraAuthVerificationFailure(result.body);
      if (parsed) {
        successfulAuthHeaders = authHeaders;
        successfulJql = effectiveJql;
        successfulAnalyticsFieldIds = analyticsFieldIds;
        break;
      }
    }
  }

  if (!parsed) {
    if (
      sawAnonymousSearch ||
      isAnonymousFieldVisibilityError(lastErrorBody) ||
      isJiraAuthVerificationFailure(lastErrorBody)
    ) {
      const detailBody = authVerificationBody || lastErrorBody;
      const detail = detailBody ? `: ${cleanJiraErrorBody(detailBody)}` : '';
      throw new Error(
        `Jira did not authenticate ${email}${detail}; requests are anonymous or use an unexpected Jira user after auth methods: ${attemptedMethods.join(
          ', ',
        )}. Check JIRA_API_TOKEN for this service account.`,
      );
    }

    if (lastFailure === 'filter' && savedFilterId) {
      throw new Error(
        `Jira saved filter ${savedFilterId} is unavailable for ${email}: ${
          lastStatus || 'unknown'
        } ${lastErrorBody ? cleanJiraErrorBody(lastErrorBody) : ''}; auth methods tried: ${attemptedMethods.join(
          ', ',
        )}`.trim(),
      );
    }

    throw new JiraSearchFailureError(
      lastStatus || null,
      `Jira authentication failed: ${lastStatus || 'unknown'} ${
        lastErrorBody ? cleanJiraErrorBody(lastErrorBody) : ''
      }; auth methods tried: ${attemptedMethods.join(', ')}`.trim(),
    );
  }

  if (keysOnly) {
    const keySearch = parsed as JiraIssueKeySearchResponse;
    const issueKeys = options.fetchAllPages && successfulAuthHeaders
      ? await fetchCompleteJiraIssueKeySearch(
          baseUrl,
          successfulJql,
          maxResults,
          keySearch,
          successfulAuthHeaders,
          options.deadlineAt,
          searchRetryBudget,
        )
      : keySearch.issues.map((issue) => issue.key);
    return { issueKeys, jiraUser };
  }

  const fullSearch = parsed as JiraSearchResponse;
  const completeSearch = options.fetchAllPages && successfulAuthHeaders
    ? await fetchCompleteJiraSearch(
        baseUrl,
        successfulJql,
        maxResults,
        fullSearch,
        successfulAuthHeaders,
        successfulAnalyticsFieldIds,
        includeChangelog,
        Boolean(options.capacitySample),
        Boolean(options.includeHistoryDocument),
        options.deadlineAt,
        searchRetryBudget,
      )
    : fullSearch;
  const hydratedData = successfulAuthHeaders
    ? await hydrateJiraSearchIssues(
        baseUrl,
        completeSearch,
        successfulAuthHeaders,
        includeChangelog,
        includeRemoteDevelopment,
        Boolean(options.includeHistoryDocument),
        options.remoteDevelopmentCache,
        options.deadlineAt,
      )
    : {
        search: completeSearch,
        remoteDevelopmentByKey: new Map(),
        historyByKey: new Map(),
      };
  const hydrated = hydratedData.search;
  const names = hydrated.names ?? {};
  const capacityMeasurements = options.capacitySample
    ? hydrated.issues.map((issue) =>
        measureJiraIssueCapacity(
          issue,
          hydratedData.remoteDevelopmentByKey.get(issue.key) ?? null,
        ))
    : undefined;
  return {
    issues: hydrated.issues.map((issue) => {
      const fields = issue.fields as Record<string, unknown> & typeof issue.fields;
      const status = issue.fields.status as (typeof issue.fields.status & {
        statusCategory?: { name?: unknown; key?: unknown };
      });
      const history = hydratedData.historyByKey.get(issue.key);
      return {
        jiraId: issue.id ?? null,
        key: issue.key,
        url: `${baseUrl}/browse/${issue.key}`,
        summary: issue.fields.summary ?? issue.key,
        status: issue.fields.status?.name ?? 'Unknown',
        priority: issue.fields.priority?.name ?? 'None',
        assignee: issue.fields.assignee?.displayName ?? null,
        reporter: issue.fields.reporter?.displayName ?? null,
        issueType: issue.fields.issuetype?.name ?? 'Issue',
        labels: jiraStringArray(fields.labels),
        sprintIds: jiraSprintIdsFromFields(fields),
        resolution: issue.fields.resolution?.name ?? 'Unresolved',
        resolutionAt: parseJiraDate(issue.fields.resolutiondate),
        sprint: jiraSprintFromFields(fields),
        sprintAvailable: jiraSprintAvailable(fields),
        createdAt: parseJiraDate(issue.fields.created),
        criticalPriorityAt: jiraCriticalPriorityAt(issue),
        criticalEndPriority: parseJiraDate(issue.fields.resolutiondate)
          ? jiraPriorityAtResolution(issue)
          : issue.fields.priority?.name?.trim() || null,
        updatedAt: new Date(issue.fields.updated),
        transitions: jiraStatusTransitions(issue),
        transitionHistoryComplete: jiraTransitionHistoryComplete(issue),
        labelChanges: jiraLabelChanges(issue),
        development: selectJiraDevelopment(
          jiraDevelopmentFromFields(fields, names),
          hydratedData.remoteDevelopmentByKey.get(issue.key) ?? null,
          includeRemoteDevelopment,
        ),
        ...(history
          ? {
              statusCategory: jiraObjectString(status?.statusCategory, 'name')
                ?? jiraObjectString(status?.statusCategory, 'key'),
              parentKey: jiraObjectString(fields.parent, 'key'),
              epicKey: jiraEpicKey(fields, names),
              history: {
              document: history.payload,
              changelogComplete: history.changelogComplete,
              commentsComplete: history.commentsComplete,
              worklogsComplete: history.worklogsComplete,
              remoteLinksComplete: history.remoteLinksComplete,
              attachmentReferencesStripped: history.attachmentReferencesStripped,
              },
            }
          : {}),
      };
    }),
    jiraUser,
    total: completeSearch.total ?? completeSearch.issues.length,
    capacityMeasurements,
  };
}
