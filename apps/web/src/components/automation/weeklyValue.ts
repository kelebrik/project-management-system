import { labels, type WeeklyChange } from '@pms/shared';

export function weeklyValue(row: WeeklyChange, value: string) {
  if (row.field === 'Требуется решение') return value === 'true' ? 'Да' : value === 'false' ? 'Нет' : value;
  if (['Начало', 'Окончание', 'Прогноз окончания', 'Базовое окончание', 'Срок ответа', 'Срок', 'Целевая дата'].includes(row.field)
    && /^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value)) return value.slice(0, 10).split('-').reverse().join('.');
  let dictionary: Record<string, string> | undefined;
  if (row.field === 'Важность') dictionary = labels.issueSeverity;
  if (row.field === 'Индикатор') dictionary = labels.rag;
  if (row.field === 'Статус проекта') dictionary = labels.projectStatus;
  if (row.field === 'Статус') dictionary = row.source === 'wbs' ? labels.wbsStatus : /\/issues(?:[?#]|$)/.test(row.href) ? labels.openIssueStatus : labels.raidStatus;
  return dictionary?.[value] ?? value;
}
