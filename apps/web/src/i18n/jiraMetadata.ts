import type { Locale } from "./types";
import { intlLocale } from "./locale";
import type { JiraAnalyticsMetric } from "@pms/shared";
const messages = {
  "JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS": {
    "issues": {
      "en": "Tickets",
      "ru": "Тикеты"
    },
    "goalIssues": {
      "en": "Goal tickets",
      "ru": "Тикеты целей"
    },
    "transitions": {
      "en": "Status transitions",
      "ru": "Переходы статусов"
    },
    "development": {
      "en": "Development activity",
      "ru": "Активность разработки"
    },
    "criticalBugs": {
      "en": "Critical/Blocker SLA",
      "ru": "SLA Critical/Blocker"
    },
    "statusIntervals": {
      "en": "Status intervals",
      "ru": "Интервалы статусов"
    },
    "gitlabCommits": {
      "en": "GitLab commits",
      "ru": "Коммиты GitLab"
    }
  },
  "JIRA_ANALYTICS_METRIC_LABELS": {
    "count": {
      "en": "Count",
      "ru": "Количество"
    },
    "averageDuration": {
      "en": "Average duration",
      "ru": "Средняя длительность"
    },
    "p50Duration": {
      "en": "Median duration",
      "ru": "Медиана времени"
    },
    "p85Duration": {
      "en": "85th percentile duration",
      "ru": "85-й перцентиль времени"
    },
    "p95Duration": {
      "en": "95th percentile duration",
      "ru": "95-й перцентиль времени"
    },
    "commits": {
      "en": "Commits",
      "ru": "Коммиты"
    },
    "mergeRequests": {
      "en": "Merge requests",
      "ru": "Merge requests"
    }
  },
  "JIRA_ANALYTICS_GROUP_LABELS": {
    "none": {
      "en": "No grouping",
      "ru": "Без группировки"
    },
    "goal": {
      "en": "Goal",
      "ru": "Цель"
    },
    "project": {
      "en": "Jira project",
      "ru": "Проект Jira"
    },
    "status": {
      "en": "Current status",
      "ru": "Текущий статус"
    },
    "assignee": {
      "en": "Assignee",
      "ru": "Исполнитель"
    },
    "reporter": {
      "en": "Reporter",
      "ru": "Автор"
    },
    "priority": {
      "en": "Priority",
      "ru": "Приоритет"
    },
    "sprint": {
      "en": "Sprint",
      "ru": "Sprint"
    },
    "issueType": {
      "en": "Ticket type",
      "ru": "Тип тикета"
    },
    "resolution": {
      "en": "Resolution",
      "ru": "Решение"
    },
    "fromStatus": {
      "en": "Previous status",
      "ru": "Исходный статус"
    },
    "toStatus": {
      "en": "New status",
      "ru": "Новый статус"
    },
    "week": {
      "en": "Week",
      "ru": "Неделя"
    }
  },
  "JIRA_ANALYTICS_FILTER_LABELS": {
    "goalId": {
      "en": "Goal ID",
      "ru": "ID цели"
    },
    "goalName": {
      "en": "Goal",
      "ru": "Цель"
    },
    "goalStatus": {
      "en": "Goal status",
      "ru": "Статус цели"
    },
    "goalDate": {
      "en": "Goal date",
      "ru": "Дата цели"
    },
    "goalLabels": {
      "en": "Goal labels",
      "ru": "Лейблы цели"
    },
    "matchedLabels": {
      "en": "Matched labels",
      "ru": "Совпавшие лейблы"
    },
    "issueKey": {
      "en": "Ticket key",
      "ru": "Ключ тикета"
    },
    "project": {
      "en": "Jira project",
      "ru": "Проект Jira"
    },
    "summary": {
      "en": "Summary",
      "ru": "Название"
    },
    "status": {
      "en": "Current status",
      "ru": "Текущий статус"
    },
    "assignee": {
      "en": "Assignee",
      "ru": "Исполнитель"
    },
    "reporter": {
      "en": "Reporter",
      "ru": "Автор"
    },
    "priority": {
      "en": "Priority",
      "ru": "Приоритет"
    },
    "sprint": {
      "en": "Sprint",
      "ru": "Sprint"
    },
    "sprintCount": {
      "en": "Sprint entry count",
      "ru": "Количество записей Sprint"
    },
    "labels": {
      "en": "Labels",
      "ru": "Метки"
    },
    "issueType": {
      "en": "Ticket type",
      "ru": "Тип тикета"
    },
    "resolution": {
      "en": "Resolution",
      "ru": "Решение"
    },
    "fromStatus": {
      "en": "Previous status",
      "ru": "Исходный статус"
    },
    "toStatus": {
      "en": "New status",
      "ru": "Новый статус"
    },
    "durationHours": {
      "en": "Duration, hours",
      "ru": "Длительность, часы"
    },
    "commitCount": {
      "en": "Commits",
      "ru": "Коммиты"
    },
    "mergeRequestCount": {
      "en": "Merge requests",
      "ru": "Merge requests"
    },
    "hasDevelopment": {
      "en": "Has development activity",
      "ru": "Есть активность разработки"
    },
    "issueCreatedAt": {
      "en": "Created at",
      "ru": "Дата создания"
    },
    "criticalPriorityAt": {
      "en": "SLA start",
      "ru": "Начало SLA"
    },
    "resolutionAt": {
      "en": "Resolution date",
      "ru": "Дата Resolution"
    },
    "updatedAt": {
      "en": "Last updated",
      "ru": "Последнее изменение"
    },
    "eventAt": {
      "en": "Event date",
      "ru": "Дата события"
    },
    "intervalStartAt": {
      "en": "Interval start",
      "ru": "Начало интервала"
    },
    "intervalEndAt": {
      "en": "Interval end",
      "ru": "Конец интервала"
    },
    "gitlabProjectPath": {
      "en": "GitLab project",
      "ru": "Проект GitLab"
    },
    "gitlabTargetBranch": {
      "en": "GitLab branch",
      "ru": "Ветка GitLab"
    },
    "commitSha": {
      "en": "Commit SHA",
      "ru": "SHA коммита"
    },
    "commitShortSha": {
      "en": "Short SHA",
      "ru": "Короткий SHA"
    },
    "commitTitle": {
      "en": "Commit message",
      "ru": "Сообщение коммита"
    },
    "commitAuthor": {
      "en": "Commit author",
      "ru": "Автор коммита"
    },
    "commitAuthorEmail": {
      "en": "Author email",
      "ru": "Email автора"
    },
    "committedAt": {
      "en": "Commit date",
      "ru": "Дата коммита"
    },
    "commitUrl": {
      "en": "Commit link",
      "ru": "Ссылка на коммит"
    },
    "sourceBranch": {
      "en": "MR source branch",
      "ru": "Исходная ветка MR"
    },
    "mergeRequestIid": {
      "en": "MR",
      "ru": "MR"
    },
    "mergeRequestTitle": {
      "en": "MR title",
      "ru": "Название MR"
    },
    "mergeRequestUrl": {
      "en": "MR link",
      "ru": "Ссылка на MR"
    },
    "jiraKeys": {
      "en": "Referenced Jira tickets",
      "ru": "Упомянутые Jira-тикеты"
    },
    "jiraLinkState": {
      "en": "Jira link",
      "ru": "Связь с Jira"
    }
  },
  "JIRA_ANALYTICS_OPERATOR_LABELS": {
    "equals": {
      "en": "equals",
      "ru": "равно"
    },
    "notEquals": {
      "en": "does not equal",
      "ru": "не равно"
    },
    "oneOf": {
      "en": "one of",
      "ru": "одно из"
    },
    "noneOf": {
      "en": "none of",
      "ru": "ни одно из"
    },
    "contains": {
      "en": "contains",
      "ru": "содержит"
    },
    "empty": {
      "en": "is empty",
      "ru": "пусто"
    },
    "notEmpty": {
      "en": "is not empty",
      "ru": "не пусто"
    },
    "greaterThan": {
      "en": "greater than",
      "ru": "больше"
    },
    "atLeast": {
      "en": "at least",
      "ru": "не меньше"
    },
    "lessThan": {
      "en": "less than",
      "ru": "меньше"
    },
    "atMost": {
      "en": "at most",
      "ru": "не больше"
    },
    "before": {
      "en": "before",
      "ru": "раньше"
    },
    "after": {
      "en": "after",
      "ru": "позже"
    }
  },
  "JIRA_SEMANTIC_FIELD_LABELS": {
    "goalId": {
      "en": "Goal ID",
      "ru": "ID цели"
    },
    "goalName": {
      "en": "Goal",
      "ru": "Цель"
    },
    "goalStatus": {
      "en": "Goal status",
      "ru": "Статус цели"
    },
    "goalDate": {
      "en": "Goal date",
      "ru": "Дата цели"
    },
    "goalLabels": {
      "en": "Goal labels",
      "ru": "Лейблы цели"
    },
    "matchedLabels": {
      "en": "Matched labels",
      "ru": "Совпавшие лейблы"
    },
    "issueKey": {
      "en": "Ticket key",
      "ru": "Ключ тикета"
    },
    "project": {
      "en": "Jira project",
      "ru": "Проект Jira"
    },
    "summary": {
      "en": "Summary",
      "ru": "Название"
    },
    "status": {
      "en": "Current status",
      "ru": "Текущий статус"
    },
    "assignee": {
      "en": "Assignee",
      "ru": "Исполнитель"
    },
    "reporter": {
      "en": "Reporter",
      "ru": "Автор"
    },
    "priority": {
      "en": "Priority",
      "ru": "Приоритет"
    },
    "sprint": {
      "en": "Sprint",
      "ru": "Sprint"
    },
    "sprintCount": {
      "en": "Sprint entry count",
      "ru": "Количество записей Sprint"
    },
    "labels": {
      "en": "Labels",
      "ru": "Метки"
    },
    "issueType": {
      "en": "Ticket type",
      "ru": "Тип тикета"
    },
    "resolution": {
      "en": "Resolution",
      "ru": "Resolution"
    },
    "fromStatus": {
      "en": "Previous status",
      "ru": "Исходный статус"
    },
    "toStatus": {
      "en": "New status",
      "ru": "Новый статус"
    },
    "durationHours": {
      "en": "Duration, hours",
      "ru": "Длительность, часы"
    },
    "commitCount": {
      "en": "Commits",
      "ru": "Коммиты"
    },
    "mergeRequestCount": {
      "en": "Merge requests",
      "ru": "Merge requests"
    },
    "hasDevelopment": {
      "en": "Has development activity",
      "ru": "Есть активность разработки"
    },
    "issueCreatedAt": {
      "en": "Created at",
      "ru": "Дата создания"
    },
    "criticalPriorityAt": {
      "en": "SLA start",
      "ru": "Начало SLA"
    },
    "resolutionAt": {
      "en": "Resolution date",
      "ru": "Дата Resolution"
    },
    "updatedAt": {
      "en": "Last updated",
      "ru": "Последнее изменение"
    },
    "eventAt": {
      "en": "Event date",
      "ru": "Дата события"
    },
    "intervalStartAt": {
      "en": "Interval start",
      "ru": "Начало интервала"
    },
    "intervalEndAt": {
      "en": "Interval end",
      "ru": "Конец интервала"
    },
    "gitlabProjectPath": {
      "en": "GitLab project",
      "ru": "Проект GitLab"
    },
    "gitlabTargetBranch": {
      "en": "GitLab branch",
      "ru": "Ветка GitLab"
    },
    "commitSha": {
      "en": "Commit SHA",
      "ru": "SHA коммита"
    },
    "commitShortSha": {
      "en": "Short SHA",
      "ru": "Короткий SHA"
    },
    "commitTitle": {
      "en": "Commit message",
      "ru": "Сообщение коммита"
    },
    "commitAuthor": {
      "en": "Commit author",
      "ru": "Автор коммита"
    },
    "commitAuthorEmail": {
      "en": "Author email",
      "ru": "Email автора"
    },
    "committedAt": {
      "en": "Commit date",
      "ru": "Дата коммита"
    },
    "commitUrl": {
      "en": "Commit link",
      "ru": "Ссылка на коммит"
    },
    "sourceBranch": {
      "en": "MR source branch",
      "ru": "Исходная ветка MR"
    },
    "mergeRequestIid": {
      "en": "MR",
      "ru": "MR"
    },
    "mergeRequestTitle": {
      "en": "MR title",
      "ru": "Название MR"
    },
    "mergeRequestUrl": {
      "en": "MR link",
      "ru": "Ссылка на MR"
    },
    "jiraKeys": {
      "en": "Referenced Jira tickets",
      "ru": "Упомянутые Jira-тикеты"
    },
    "jiraLinkState": {
      "en": "Jira link",
      "ru": "Связь с Jira"
    }
  }
} as const;
function localize<T extends Record<string, { en: string; ru: string }>>(group: T, locale: Locale): { [K in keyof T]: string } {
  return Object.fromEntries(Object.entries(group).map(([key, value]) => [key, value[locale]])) as { [K in keyof T]: string };
}
export function createJiraMetadata(locale: Locale) {
  const number = new Intl.NumberFormat(intlLocale(locale), { maximumFractionDigits: 1 });
  return {
    JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS: localize(messages.JIRA_ANALYTICS_AGGREGATE_TYPE_LABELS, locale),
    JIRA_ANALYTICS_METRIC_LABELS: localize(messages.JIRA_ANALYTICS_METRIC_LABELS, locale),
    JIRA_ANALYTICS_GROUP_LABELS: localize(messages.JIRA_ANALYTICS_GROUP_LABELS, locale),
    JIRA_ANALYTICS_FILTER_LABELS: localize(messages.JIRA_ANALYTICS_FILTER_LABELS, locale),
    JIRA_ANALYTICS_OPERATOR_LABELS: localize(messages.JIRA_ANALYTICS_OPERATOR_LABELS, locale),
    JIRA_SEMANTIC_FIELD_LABELS: localize(messages.JIRA_SEMANTIC_FIELD_LABELS, locale),
    jiraAnalyticsFilterLogicLabel: (logic: "and" | "or") => locale === "en" ? logic === "and" ? "AND" : "OR" : logic === "and" ? "И" : "ИЛИ",
    formatJiraAnalyticsMetric: (metric: JiraAnalyticsMetric, value: number) => metric.endsWith("Duration")
      ? value >= 24 ? `${number.format(value / 24)} ${locale === "en" ? "d" : "дн."}` : `${number.format(value)} ${locale === "en" ? "h" : "ч"}`
      : number.format(Math.round(value)),
  };
}
