import type { WeeklyActor, WeeklyChange, WeeklyValue } from '@pms/shared';

/** Raw ISO dates arrive as project data and are formatted, not translated. */
const dateFieldKeys = new Set([
  'WbsItem.startDate',
  'WbsItem.dueDate',
  'WbsItem.forecastDueDate',
  'WbsItem.baselineDueDate',
  'Issue.dueDate',
  'RaidItem.dueDate',
  'Project.targetDate',
]);

export type WeeklyBriefTranslator = {
  t: (key: string) => string;
  wbsStatusLabel: (value: string) => string;
  issueStatusLabel: (value: string) => string;
  raidStatusLabel: (value: string) => string;
  issueSeverityLabel: (value: string) => string;
  projectStatusLabel: (value: string) => string;
  projectHealthLabel: (value: string) => string;
};

export function weeklyFieldLabel(fieldKey: string, translator: WeeklyBriefTranslator) {
  return translator.t(`ui.automation.briefField.${fieldKey}`);
}

export function weeklyActorLabel(actor: WeeklyActor, translator: WeeklyBriefTranslator) {
  return 'name' in actor ? actor.name : translator.t(`ui.automation.briefActor.${actor.token}`);
}

/** Plain value rendering, used for titles where no field dictionary applies. */
export function weeklyText(value: WeeklyValue, translator: WeeklyBriefTranslator) {
  return 'token' in value ? translator.t(`ui.automation.briefValue.${value.token}`) : value.text;
}

export function weeklyValue(
  row: WeeklyChange,
  value: WeeklyValue,
  translator: WeeklyBriefTranslator,
) {
  if ('token' in value) return weeklyText(value, translator);
  const raw = value.text;
  if (row.fieldKey === 'Issue.decisionRequired') {
    return raw === 'true'
      ? translator.t('ui.automation.yes')
      : raw === 'false'
        ? translator.t('ui.automation.no')
        : raw;
  }
  if (dateFieldKeys.has(row.fieldKey) && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(raw)) {
    return raw.slice(0, 10).split('-').reverse().join('.');
  }
  switch (row.fieldKey) {
    case 'WbsItem.status':
      return translator.wbsStatusLabel(raw);
    case 'Issue.status':
      return translator.issueStatusLabel(raw);
    case 'RaidItem.status':
      return translator.raidStatusLabel(raw);
    case 'Issue.severity':
      return translator.issueSeverityLabel(raw);
    case 'Project.status':
      return translator.projectStatusLabel(raw);
    case 'Project.rag':
      return translator.projectHealthLabel(raw);
    default:
      return raw;
  }
}
