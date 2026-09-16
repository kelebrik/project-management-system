import type { WeeklyActor, WeeklyChange, WeeklyValue } from '@pms/shared';

/** Business fields exposed per audited object type. Order drives report order. */
export const briefFields: Record<string, readonly string[]> = {
  WbsItem: ['title', 'status', 'owner', 'startDate', 'dueDate', 'forecastDueDate', 'baselineDueDate', 'progress'],
  Issue: ['title', 'status', 'owner', 'dueDate', 'decisionRequired', 'severity'],
  RaidItem: ['title', 'status', 'owner', 'dueDate', 'probability', 'impact', 'riskScore'],
  Project: ['name', 'status', 'targetDate', 'rag', 'projectManager'],
};
const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
/** Report values carry either project data or a token the web localizes. */
const briefValue = (raw: unknown): WeeklyValue =>
  raw === null || raw === undefined ? { token: 'empty' }
    : typeof raw === 'object' ? { token: 'changed' } : { text: String(raw).slice(0, 500) };
const sameValue = (left: WeeklyValue, right: WeeklyValue) =>
  'text' in left && 'text' in right ? left.text === right.text
    : 'token' in left && 'token' in right ? left.token === right.token : false;
export function briefHref(code: string, type: string, id: string | null) {
  const root = `/${encodeURIComponent(code)}`;
  return type === 'WbsItem' ? `${root}/wbs${id ? `?focusWbs=${encodeURIComponent(id)}` : ''}`
    : type === 'Issue' ? `${root}/issues${id ? `#issue-item-${encodeURIComponent(id)}` : ''}`
      : type === 'RaidItem' ? `${root}/risks${id ? `#raid-item-${encodeURIComponent(id)}` : ''}` : `${root}/overview`;
}

/** Extract only business fields; never expose snapshots or integration configuration. */
export function commandChanges(command: {
  id: string; projectId: string; createdAt: Date; type: string; beforeSnapshot: unknown; afterSnapshot: unknown; payload: unknown;
}, projectCode: string, actor: WeeklyActor): WeeklyChange[] {
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
    const common = { projectId: command.projectId, projectCode, at: command.createdAt.toISOString(),
      actor: payload.automaticSchedule ? { token: 'automaticRecalculation' as const } : actor,
      title: briefValue(newItem?.title ?? oldItem?.title ?? id), href: briefHref(projectCode, 'WbsItem', id), source: 'wbs' as const };
    if (!oldItem || !newItem) {
      return [{
        ...common, id: `${command.id}:${id}:existence`, fieldKey: 'WbsItem.existence',
        before: oldItem ? { token: 'existed' as const } : { token: 'empty' as const },
        after: newItem ? { token: 'created' as const } : { token: 'deleted' as const },
      }];
    }
    return briefFields.WbsItem.flatMap((field) => {
      const oldValue = briefValue(oldItem[field]); const newValue = briefValue(newItem[field]);
      return sameValue(oldValue, newValue)
        ? []
        : [{ ...common, id: `${command.id}:${id}:${field}`, fieldKey: `WbsItem.${field}`, before: oldValue, after: newValue }];
    });
  });
}

export function journalChange(row: {
  id: string; projectId: string | null; objectType: string; objectId: string | null; field: string;
  oldText: string | null; newText: string | null; createdAt: Date;
}, projectCode: string, actor: WeeklyActor, title: WeeklyValue): WeeklyChange | null {
  if (!briefFields[row.objectType]?.includes(row.field) || !row.projectId) return null;
  return {
    id: row.id, projectId: row.projectId, projectCode, title, fieldKey: `${row.objectType}.${row.field}`,
    before: briefValue(row.oldText), after: briefValue(row.newText), at: row.createdAt.toISOString(), actor,
    href: briefHref(projectCode, row.objectType, row.objectId), source: 'journal',
  };
}
