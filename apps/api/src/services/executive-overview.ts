import { labels } from '@pms/shared';
import { prisma } from '../db.js';

function isoDate(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function daysSince(value: Date | null | undefined) {
  if (!value) return null;
  return Math.floor((Date.now() - value.getTime()) / 86_400_000);
}

function severityRank(severity: string) {
  return { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 }[severity] ?? 0;
}

function raidSeverity(score: number) {
  if (score >= 20) return 'CRITICAL';
  if (score >= 15) return 'HIGH';
  if (score >= 8) return 'MEDIUM';
  return 'LOW';
}

function ragLabel(rag: string) {
  if (rag === 'RED') return 'Критично';
  if (rag === 'AMBER') return 'Под риском';
  return 'В норме';
}

function severityLabel(severity: string) {
  return (
    {
      CRITICAL: 'Критичная',
      HIGH: 'Высокая',
      MEDIUM: 'Средняя',
      LOW: 'Низкая',
    }[severity] ?? severity
  );
}

function wbsStatusLabel(status: string) {
  return labels.wbsStatus[status as keyof typeof labels.wbsStatus] ?? status;
}

function overviewTone(value: 'green' | 'amber' | 'red' | 'neutral') {
  return value;
}

export async function getProjectForOverviewGeneration(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    include: {
      jiraIntegration: true,
      issues: {
        where: { status: { notIn: ['Done', 'Closed', 'Resolved'] } },
        orderBy: [{ decisionRequired: 'desc' }, { severity: 'desc' }, { updatedAt: 'desc' }],
        include: { jiraLinks: { orderBy: { createdAt: 'asc' } } },
      },
      jiraSnapshots: { orderBy: { updatedAt: 'desc' } },
      milestones: { orderBy: { dueDate: 'asc' } },
      wbsItems: { orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }] },
      wbsDependencies: {
        orderBy: { createdAt: 'asc' },
        include: {
          predecessor: { select: { id: true, code: true, title: true } },
          successor: { select: { id: true, code: true, title: true } },
        },
      },
      artifacts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
      raidItems: {
        orderBy: [{ riskScore: 'desc' }, { updatedAt: 'desc' }],
        include: {
          statusUpdates: { orderBy: [{ statusAt: 'desc' }, { createdAt: 'desc' }] },
        },
      },
      changeRequests: { orderBy: [{ updatedAt: 'desc' }] },
      overviews: { orderBy: { version: 'desc' }, take: 1 },
    },
  });
}

type ProjectForOverviewGeneration = NonNullable<Awaited<ReturnType<typeof getProjectForOverviewGeneration>>>;

export function generateExecutiveSummary(project: ProjectForOverviewGeneration) {
  const criticalIssues = project.issues.filter((issue) => issue.severity === 'CRITICAL');
  const decisionIssues = project.issues.filter((issue) => issue.decisionRequired);
  const activeRaidItems = project.raidItems.filter((item) => !['CLOSED', 'VALIDATED'].includes(item.status));
  const highRaidItems = activeRaidItems.filter((item) => item.type === 'RISK' && item.riskScore >= 15);
  const activeProblems = activeRaidItems.filter((item) => item.type === 'DEPENDENCY');
  const activeAssumptions = activeRaidItems.filter((item) => item.type === 'ASSUMPTION');
  const topIssue = [...project.issues].sort(
    (left, right) => severityRank(right.severity) - severityRank(left.severity),
  )[0];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const wbsMilestones = project.wbsItems
    .filter((item) => item.type === 'MILESTONE')
    .sort(
      (left, right) =>
        (left.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) -
          (right.dueDate?.getTime() ?? Number.MAX_SAFE_INTEGER) ||
        left.sortOrder - right.sortOrder,
    );
  const nextMilestone = wbsMilestones.find((milestone) => milestone.status !== 'DONE');
  const completedWbs = project.wbsItems.filter((item) => item.status === 'DONE').length;
  const blockedWbs = project.wbsItems.filter((item) => item.status === 'BLOCKED').length;
  const atRiskWbs = project.wbsItems.filter((item) => item.status === 'AT_RISK').length;
  const missingWbsDates = project.wbsItems.filter((item) => !item.startDate || !item.dueDate).length;
  const overdueMilestones = wbsMilestones.filter(
    (milestone) => milestone.status !== 'DONE' && milestone.dueDate && milestone.dueDate.getTime() < today.getTime(),
  ).length;
  const jiraSyncAge = daysSince(project.jiraIntegration?.lastSyncedAt);
  const staleJiraIssues = project.jiraSnapshots.filter(
    (issue) => daysSince(issue.updatedAt) !== null && Number(daysSince(issue.updatedAt)) > 7,
  );
  const artifactBaselineCount = project.artifacts.filter((artifact) =>
    ['Approved', 'Baseline'].includes(artifact.status),
  ).length;
  const scheduleText =
    project.scheduleVariance > 0
      ? `отклонение по срокам +${project.scheduleVariance} дней`
      : project.scheduleVariance < 0
        ? `опережение графика ${Math.abs(project.scheduleVariance)} дней`
        : 'отклонений по срокам нет';

  const executiveSummary = [
    `${project.name} находится в статусе ${ragLabel(project.rag)}.`,
    `Готовность составляет ${project.progress}%, ${scheduleText}.`,
    criticalIssues.length > 0
      ? `Критических открытых проблем: ${criticalIssues.length}; ключевая проблема: ${topIssue?.title}.`
      : topIssue
        ? `Ключевая открытая проблема: ${topIssue.title}.`
        : 'Критических открытых проблем не зафиксировано.',
    nextMilestone
      ? `Ближайшая веха: ${nextMilestone.title}, срок ${isoDate(nextMilestone.dueDate) ?? 'не задан'}, статус ${wbsStatusLabel(nextMilestone.status)}.`
      : 'Ближайшие вехи не заданы.',
    activeRaidItems.length > 0
      ? `В реестре рисков и проблем активно ${activeRaidItems.length} записей, высоких рисков: ${highRaidItems.length}, проблем: ${activeProblems.length}.`
      : 'Активных записей о рисках и проблемах нет.',
    decisionIssues.length > 0
      ? `Для руководства требуется ${decisionIssues.length} решение(й) по открытым вопросам.`
      : 'Новых решений от руководства сейчас не требуется.',
  ].join(' ');

  const kpis = [
    {
      label: 'Статус',
      value: ragLabel(project.rag),
      secondary: project.rag === 'RED' ? 'Критично' : project.rag === 'AMBER' ? 'Под риском' : 'В норме',
      tone: overviewTone(project.rag === 'RED' ? 'red' : project.rag === 'AMBER' ? 'amber' : 'green'),
      source: `Паспорт проекта ${project.code}`,
    },
    {
      label: 'Прогресс',
      value: `${project.progress}%`,
      secondary: `${completedWbs}/${project.wbsItems.length || 0} элементов Структуры сделано`,
      tone: overviewTone(project.progress >= 80 ? 'green' : project.progress >= 45 ? 'amber' : 'neutral'),
      source: 'Базовый план Структуры',
    },
    {
      label: 'Сроки',
      value: `${project.scheduleVariance > 0 ? '+' : ''}${project.scheduleVariance} дней`,
      secondary: overdueMilestones > 0 ? `${overdueMilestones} просроченных вех` : 'отклонение от базового плана',
      tone: overviewTone(project.scheduleVariance > 10 || overdueMilestones > 0 ? 'red' : project.scheduleVariance > 0 ? 'amber' : 'green'),
      source: 'План-график проекта',
    },
    {
      label: 'Открытые вопросы',
      value: String(project.issues.length),
      secondary: `${criticalIssues.length} критичных / ${decisionIssues.length} решений`,
      tone: overviewTone(criticalIssues.length > 0 ? 'red' : decisionIssues.length > 0 ? 'amber' : 'green'),
      source: 'Реестр открытых вопросов',
    },
    {
      label: 'Риски и проблемы',
      value: `${activeRaidItems.length}`,
      secondary: `${highRaidItems.length} высоких рисков / ${activeProblems.length} проблем / ${activeAssumptions.length} допущений`,
      tone: overviewTone(highRaidItems.length > 0 || activeProblems.length > 0 ? 'red' : activeAssumptions.length > 0 ? 'amber' : 'green'),
      source: 'Риски и проблемы',
    },
    {
      label: 'Вехи',
      value: String(wbsMilestones.length),
      secondary: overdueMilestones > 0 ? `${overdueMilestones} просрочено` : 'по данным Структуры',
      tone: overviewTone(overdueMilestones > 0 ? 'red' : wbsMilestones.length > 0 ? 'green' : 'neutral'),
      source: 'Структура',
    },
  ];

  const qualityGates = [
    {
      name: 'Актуальность данных проекта',
      status: !project.jiraIntegration ? 'WARN' : jiraSyncAge === null || jiraSyncAge > 3 ? 'WARN' : 'OK',
      detail: !project.jiraIntegration
        ? 'Интеграция Jira не настроена'
        : jiraSyncAge === null
          ? 'Jira еще не синхронизировалась'
          : `Давность синхронизации Jira: ${jiraSyncAge} дн.`,
      source: 'Интеграция Jira',
    },
    {
      name: 'Полнота плана',
      status: project.wbsItems.length === 0 || missingWbsDates > 0 ? 'WARN' : 'OK',
      detail:
        missingWbsDates > 0
          ? `${missingWbsDates} элемент(ов) Структуры без дат старта и срока`
          : `${project.wbsItems.length} элемент(ов) Структуры с календарными данными`,
      source: 'Структура',
    },
    {
      name: 'Контроль блокеров',
      status: criticalIssues.length > 0 || blockedWbs > 0 ? 'BLOCKED' : decisionIssues.length > 0 || atRiskWbs > 0 ? 'WARN' : 'OK',
      detail: `${criticalIssues.length} критичных вопросов, ${blockedWbs} проваленных элементов Структуры, ${decisionIssues.length} решений требуется`,
      source: 'Открытые вопросы + Структура',
    },
    {
      name: 'Управленческие подтверждения',
      status: artifactBaselineCount > 0 ? 'OK' : 'WARN',
      detail: `${artifactBaselineCount} одобренных артефактов или базовых планов в реестре проекта`,
      source: 'Реестр артефактов',
    },
    {
      name: 'Дисциплина управления рисками',
      status: highRaidItems.some((item) => !item.mitigationPlan) ? 'BLOCKED' : highRaidItems.length > 0 ? 'WARN' : 'OK',
      detail: `${highRaidItems.length} высоких рисков, ${activeProblems.length} активных проблем, ${activeAssumptions.length} допущений`,
      source: 'Риски и проблемы',
    },
  ];

  const risks = [
    ...project.issues.slice(0, 5).map((issue) => ({
      title: issue.title,
      severity: severityLabel(issue.severity),
      owner: issue.owner,
      impact: issue.impact,
      dueDate: isoDate(issue.dueDate),
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => link.jiraKey).join(', ')
          : 'Реестр открытых вопросов',
    })),
    ...activeRaidItems
      .filter((item) => item.type === 'RISK')
      .slice(0, Math.max(0, 5 - Math.min(project.issues.length, 5)))
      .map((item) => ({
        title: item.title,
        severity: severityLabel(raidSeverity(item.riskScore)),
        owner: item.owner,
        impact: `${item.description} Сроки: ${item.scheduleImpactDays} дн. План действий: ${
          item.mitigationPlan ?? 'не задан'
        }`,
        dueDate: isoDate(item.dueDate),
        source: `Оценка риска ${item.riskScore}`,
      })),
    ...project.wbsItems
      .filter((item) => item.status === 'BLOCKED' || item.status === 'AT_RISK')
      .slice(0, Math.max(0, 5 - Math.min(project.issues.length + highRaidItems.length, 5)))
      .map((item) => ({
        title: `${item.code} ${item.title}`,
        severity: severityLabel(item.status === 'BLOCKED' ? 'HIGH' : 'MEDIUM'),
        owner: item.owner,
        impact: item.description ?? 'Элемент Структуры требует внимания руководства',
        dueDate: isoDate(item.dueDate),
        source: 'Структура',
      })),
  ];

  const nextSteps = [
    ...decisionIssues.slice(0, 3).map((issue) => ({
      title: `Принять управленческое решение: ${issue.title}`,
      owner: issue.owner,
      dueDate: isoDate(issue.dueDate),
      source: 'Реестр открытых вопросов',
    })),
    ...wbsMilestones
      .filter((milestone) => milestone.status !== 'DONE')
      .slice(0, 3)
      .map((milestone) => ({
        title: `Подготовить веху: ${milestone.title}`,
        owner: milestone.owner,
        dueDate: isoDate(milestone.dueDate),
        source: 'Вехи',
      })),
    ...staleJiraIssues.slice(0, 2).map((issue) => ({
      title: `Обновить статус Jira: ${issue.issueKey}`,
      owner: issue.assignee ?? 'Проектная команда',
      dueDate: isoDate(issue.updatedAt),
      source: 'Снимок Jira',
    })),
  ].slice(0, 6);

  const decisions = decisionIssues.slice(0, 5).map((issue) => ({
    title: issue.title,
    impactIfApproved: issue.impact,
    impactIfDelayed: `Сохраняется риск по ответственному ${issue.owner}; срок решения: ${
      isoDate(issue.dueDate) ?? 'не задан'
    }`,
    deadline: isoDate(issue.dueDate),
    source: issue.jiraLinks.length > 0 ? issue.jiraLinks.map((link) => link.jiraKey).join(', ') : 'Реестр открытых вопросов',
  }));

  const evidence = [
    {
      metric: 'Статус проекта',
      source: `Проект ${project.code} / индикатор ${ragLabel(project.rag)}`,
    },
    {
      metric: 'Отклонение сроков',
      source: `Снимок плана проекта / ${project.scheduleVariance} дн.`,
    },
    {
      metric: 'Структура',
      source: `${project.wbsItems.length} элементов / ${project.wbsItems.filter((item) => item.status === 'DONE').length} сделано`,
    },
    {
      metric: 'Открытые вопросы',
      source: `${project.issues.length} открытых вопросов в едином реестре`,
    },
    {
      metric: 'Снимок Jira',
      source: `${project.jiraSnapshots.length} синхронизированных задач Jira`,
    },
    {
      metric: 'Вехи',
      source: `${wbsMilestones.length} вех проекта из Структуры`,
    },
    {
      metric: 'Артефакты',
      source: `${project.artifacts.length} артефактов проекта / ${artifactBaselineCount} одобрено или зафиксировано как базовый план`,
    },
    {
      metric: 'Риски',
      source: `${activeRaidItems.length} активных записей о рисках / ${highRaidItems.length} высоких рисков`,
    },
    {
      metric: 'Риски и проблемы',
      source: `${activeRaidItems.length} активных записей / ${highRaidItems.length} высоких рисков / ${activeProblems.length} проблем`,
    },
    ...project.issues.slice(0, 3).map((issue) => ({
      metric: issue.title,
      source:
        issue.jiraLinks.length > 0
          ? issue.jiraLinks.map((link) => `${link.jiraKey}: ${link.jiraUrl}`).join('; ')
          : `${issue.source === 'JIRA' ? 'Jira' : 'Внутренний'} вопрос, ответственный ${issue.owner}`,
    })),
  ];

  return { executiveSummary, kpis, qualityGates, risks, nextSteps, decisions, evidence };
}

function escapeHtml(value: unknown) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => {
    const replacements: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return replacements[char] ?? char;
  });
}

export function exportFilePart(value: string) {
  return value
    .trim()
    .replace(/[^a-zа-яё0-9_-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .toLowerCase();
}

export function overviewStatusLabel(status: string) {
  return (
    {
      DRAFT: 'Черновик',
      GENERATED: 'Сгенерирован',
      PM_REVIEW: 'На проверке РП',
      APPROVED: 'Согласован',
      PUBLISHED: 'Опубликован',
    }[status] ?? status
  );
}

function renderJsonRecordList(value: unknown) {
  const items = Array.isArray(value) ? value : [];
  if (items.length === 0) {
    return '<p class="muted">Нет данных</p>';
  }
  return `<div class="record-list">${items
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return `<article>${escapeHtml(item)}</article>`;
      }
      const rows = Object.entries(item as Record<string, unknown>)
        .filter(([, entryValue]) => entryValue !== null && entryValue !== undefined && entryValue !== '')
        .map(
          ([key, entryValue]) =>
            `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(
              typeof entryValue === 'object' ? JSON.stringify(entryValue) : entryValue,
            )}</dd></div>`,
        )
        .join('');
      return `<article><dl>${rows}</dl></article>`;
    })
    .join('')}</div>`;
}

export async function getExecutiveOverviewForExport(overviewId: string) {
  return prisma.executiveOverview.findUnique({
    where: { id: overviewId },
    include: {
      project: {
        select: {
          id: true,
          code: true,
          name: true,
          projectManager: true,
          rag: true,
          status: true,
          targetDate: true,
          progress: true,
          scheduleVariance: true,
        },
      },
    },
  });
}

export function renderExecutiveOverviewHtml(
  overview: Awaited<ReturnType<typeof getExecutiveOverviewForExport>>,
) {
  if (!overview) return '';
  const project = overview.project;
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(project.code)} v${overview.version} Executive Overview</title>
  <style>
    body { color: #111827; font: 14px/1.45 Arial, sans-serif; margin: 32px; }
    h1 { font-size: 28px; margin: 0 0 8px; }
    h2 { border-bottom: 1px solid #dbe4ef; font-size: 18px; margin: 28px 0 12px; padding-bottom: 8px; }
    .meta, .muted { color: #64748b; }
    .summary { background: #0f172a; border-radius: 10px; color: #f8fafc; font-size: 16px; margin: 20px 0; padding: 20px; }
    .kpis { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
    .kpi, .record-list article { border: 1px solid #dbe4ef; border-radius: 8px; padding: 12px; }
    .kpi strong { display: block; font-size: 22px; margin: 4px 0; }
    .record-list { display: grid; gap: 10px; }
    dl { display: grid; gap: 8px; margin: 0; }
    .record-list div { display: grid; gap: 4px; grid-template-columns: 150px minmax(0, 1fr); }
    dt { color: #64748b; font-weight: 700; }
    dd { margin: 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(project.code)} ${escapeHtml(project.name)}</h1>
  <div class="meta">
    Версия ${overview.version} / ${escapeHtml(overviewStatusLabel(overview.status))} /
    РП: ${escapeHtml(project.projectManager)} / прогресс ${project.progress}% /
    отклонение сроков ${project.scheduleVariance} дн.
  </div>
  <section class="summary">${escapeHtml(overview.executiveSummary)}</section>
  <h2>KPI</h2>
  <div class="kpis">
    ${(Array.isArray(overview.kpis) ? overview.kpis : [])
      .map((item) => {
        const kpi = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
        return `<article class="kpi"><span>${escapeHtml(kpi.label)}</span><strong>${escapeHtml(
          kpi.value,
        )}</strong><small>${escapeHtml(kpi.secondary)}</small></article>`;
      })
      .join('')}
  </div>
  <h2>Ключевые риски</h2>
  ${renderJsonRecordList(overview.risks)}
  <h2>Решения</h2>
  ${renderJsonRecordList(overview.decisions)}
  <h2>Следующие шаги</h2>
  ${renderJsonRecordList(overview.nextSteps)}
  <h2>Evidence</h2>
  ${renderJsonRecordList(overview.evidence)}
</body>
</html>`;
}
