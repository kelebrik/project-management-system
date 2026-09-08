import type { WeeklyChange } from '@pms/shared';

export const briefFields: Record<string, Record<string, string>> = {
  WbsItem: { title: 'Название', status: 'Статус', owner: 'Ответственный', startDate: 'Начало', dueDate: 'Окончание', forecastDueDate: 'Прогноз окончания', baselineDueDate: 'Базовое окончание', progress: 'Прогресс' },
  Issue: { title: 'Вопрос', status: 'Статус', owner: 'Ответственный', dueDate: 'Срок ответа', decisionRequired: 'Требуется решение', severity: 'Важность' },
  RaidItem: { title: 'Риск / проблема', status: 'Статус', owner: 'Ответственный', dueDate: 'Срок', probability: 'Вероятность', impact: 'Влияние', riskScore: 'Оценка риска' },
  Project: { name: 'Название проекта', status: 'Статус проекта', targetDate: 'Целевая дата', rag: 'Индикатор', projectManager: 'Руководитель проекта' },
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown) => value === null || value === undefined ? '—' : typeof value === 'object' ? 'Изменено' : String(value).slice(0, 500);
export function briefHref(code: string, type: string, id: string | null) {
  const root = `/${encodeURIComponent(code)}`;
  return type === 'WbsItem' ? `${root}/wbs${id ? `?focusWbs=${encodeURIComponent(id)}` : ''}`
    : type === 'Issue' ? `${root}/issues${id ? `#issue-item-${encodeURIComponent(id)}` : ''}`
      : type === 'RaidItem' ? `${root}/risks${id ? `#raid-item-${encodeURIComponent(id)}` : ''}` : `${root}/overview`;
}

/** Extract only business fields; never expose snapshots or integration configuration. */
export function commandChanges(command: {
  id: string; projectId: string; createdAt: Date; type: string; beforeSnapshot: unknown; afterSnapshot: unknown; payload: unknown;
}, projectCode: string, actor: string): WeeklyChange[] {
  const payload = object(command.payload);
  const extract = (value: unknown) => {
    if (Array.isArray(value)) return value.map(object);
    const data = object(value);
    return Array.isArray(data.wbsItems) ? data.wbsItems.map(object) : data.id && typeof data.title === 'string' ? [data] : [];
  };
  let before = extract(command.beforeSnapshot ?? payload.before);
  let after = extract(command.afterSnapshot ?? payload.after);
  // Several historical commands store the whole remaining plan on one side only.
  // Absence of a before-snapshot does not mean that every row was created.
  if (command.type === 'CREATE') {
    const createdId = payload.itemId ?? payload.insertedItemId;
    after = payload.item ? extract(payload.item) : after.filter((item) => item.id === createdId);
    before = [];
  } else if (command.type === 'DELETE') {
    after = [];
  } else if (!before.length || !after.length) {
    return [];
  }
  const beforeById = new Map(before.map((item) => [String(item.id), item]));
  const afterById = new Map(after.map((item) => [String(item.id), item]));
  const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])];
  return ids.flatMap((id) => {
    const oldItem = beforeById.get(id); const newItem = afterById.get(id);
    const common = { projectId: command.projectId, projectCode, at: command.createdAt.toISOString(), actor: payload.automaticSchedule ? 'Автоматический пересчет' : actor,
      title: text(newItem?.title ?? oldItem?.title ?? id), href: briefHref(projectCode, 'WbsItem', id), source: 'wbs' as const };
    if (!oldItem || !newItem) return [{ ...common, id: `${command.id}:${id}:existence`, field: 'Работа', before: oldItem ? 'Существовала' : '—', after: newItem ? 'Создана' : 'Удалена' }];
    return Object.entries(briefFields.WbsItem).flatMap(([field, label]) => {
      const oldValue = text(oldItem[field]); const newValue = text(newItem[field]);
      return oldValue === newValue ? [] : [{ ...common, id: `${command.id}:${id}:${field}`, field: label, before: oldValue, after: newValue }];
    });
  });
}

export function journalChange(row: {
  id: string; projectId: string | null; objectType: string; objectId: string | null; field: string;
  oldText: string | null; newText: string | null; createdAt: Date;
}, projectCode: string, actor: string, title: string): WeeklyChange | null {
  const field = briefFields[row.objectType]?.[row.field];
  if (!field || !row.projectId) return null;
  return { id: row.id, projectId: row.projectId, projectCode, title, field, before: text(row.oldText), after: text(row.newText), at: row.createdAt.toISOString(), actor, href: briefHref(projectCode, row.objectType, row.objectId), source: 'journal' };
}
