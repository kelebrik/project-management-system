/**
 * The extra fields of a Jira issue kept for analytics: status category,
 * parent and epic, components, fix versions, story points, due date, the
 * assignee's login and up to ten fields chosen by an administrator. They come
 * from the same search as the rest; nothing here asks Jira anything.
 */

export const JIRA_EXTRA_FIELDS_MAX = 10;
export const JIRA_FIELD_CATALOG_MAX = 1000;
const TEXT_MAX = 200;
const LIST_MAX = 50;

export type JiraCustomValue = string | number | string[];

export type JiraIssueAttributes = {
  statusCategoryKey: 'new' | 'indeterminate' | 'done' | null;
  parentKey: string | null;
  epicKey: string | null;
  components: string[];
  fixVersions: string[];
  storyPoints: number | null;
  dueDate: string | null;
  assigneeLogin: string | null;
  custom: Record<string, JiraCustomValue>;
};

export type JiraAttributeConfig = {
  epicLinkFieldId?: string | null;
  storyPointsFieldId?: string | null;
  extraFieldIds?: readonly string[];
};

const EPIC_LINK_NAMES = ['epic link', 'ссылка на эпик'];
const STORY_POINT_NAMES = ['story points', 'story point estimate', 'стори поинты', 'оценка в story points'];
const FIELD_ID = /^[A-Za-z0-9_.-]{1,100}$/;

const record = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/;
const text = (value: unknown) => (typeof value === 'string' && value.trim() ? value.normalize('NFKC').trim().slice(0, TEXT_MAX) : null);
/** Visible text that is not an e-mail address: people's addresses are not kept. */
const shown = (value: unknown) => {
  const result = text(value);
  return result && !EMAIL.test(result) ? result : null;
};
/** The whole object stays small: past this the chosen custom fields are dropped. */
export const JIRA_ATTRIBUTES_MAX_BYTES = 8 * 1024;

/** A field id that may go into a search request. */
export function isJiraFieldId(value: string) {
  return FIELD_ID.test(value);
}

function fieldIdByName(names: Record<string, string>, wanted: readonly string[]) {
  return Object.entries(names).find(([, name]) => wanted.includes(name.trim().toLowerCase()))?.[0] ?? null;
}

/** The ids of Epic Link and Story Points: set in the environment, otherwise found by name in the field catalog. */
export function jiraKnownFieldIds(catalog: Record<string, string>, env: NodeJS.ProcessEnv = process.env) {
  const configured = (value: string | undefined) => (value?.trim() && isJiraFieldId(value.trim()) ? value.trim() : null);
  return {
    epicLinkFieldId: configured(env.JIRA_EPIC_LINK_FIELD_ID) ?? fieldIdByName(catalog, EPIC_LINK_NAMES),
    storyPointsFieldId: configured(env.JIRA_STORY_POINTS_FIELD_ID) ?? fieldIdByName(catalog, STORY_POINT_NAMES),
  };
}

/** The fields the search asks for on top of the usual ones. */
export function jiraAttributeFieldIds(config: JiraAttributeConfig) {
  return [
    ...new Set(
      ['parent', 'components', 'fixVersions', 'duedate', config.epicLinkFieldId, config.storyPointsFieldId, ...(config.extraFieldIds ?? [])].filter(
        (id): id is string => typeof id === 'string' && isJiraFieldId(id),
      ),
    ),
  ];
}

function names(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => text(record(entry)?.name) ?? text(entry)).filter((entry): entry is string => Boolean(entry)))].sort().slice(0, LIST_MAX);
}

/** One custom value as text, a number or a list: options, users and versions by their visible name. */
export function jiraCustomValue(value: unknown): JiraCustomValue | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const direct = shown(value);
  if (direct) return direct;
  const object = record(value);
  if (object) {
    const named = shown(object.value) ?? shown(object.displayName) ?? shown(object.name) ?? shown(object.key);
    if (named) {
      const child = record(object.child);
      const childName = child ? shown(child.value) ?? shown(child.name) : null;
      return childName ? `${named} / ${childName}`.slice(0, TEXT_MAX) : named;
    }
    return null;
  }
  if (Array.isArray(value)) {
    const listed = value.map((entry) => jiraCustomValue(entry)).flatMap((entry) => (entry === null ? [] : Array.isArray(entry) ? entry : [String(entry)]));
    return listed.length > 0 ? [...new Set(listed)].slice(0, LIST_MAX) : null;
  }
  return null;
}

function epicKey(fields: Record<string, unknown>, config: JiraAttributeConfig) {
  if (config.epicLinkFieldId) {
    const linked = fields[config.epicLinkFieldId];
    const key = text(linked) ?? text(record(linked)?.key);
    if (key) return key;
  }
  // Team-managed projects and newer Jira put the epic as the parent.
  const parent = record(fields.parent);
  const parentType = text(record(record(parent?.fields)?.issuetype)?.name)?.toLowerCase();
  return parentType === 'epic' || parentType === 'эпик' ? text(parent?.key) : null;
}

function storyPoints(fields: Record<string, unknown>, config: JiraAttributeConfig) {
  if (!config.storyPointsFieldId) return null;
  const value = fields[config.storyPointsFieldId];
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(',', '.')) : Number.NaN;
  return Number.isFinite(number) && number >= 0 && number < 1_000_000 ? number : null;
}

export function jiraIssueAttributes(fields: Record<string, unknown>, config: JiraAttributeConfig): JiraIssueAttributes {
  const status = record(fields.status);
  const category = text(record(status?.statusCategory)?.key);
  const assignee = record(fields.assignee);
  const due = text(fields.duedate);
  const custom: Record<string, JiraCustomValue> = {};
  for (const id of (config.extraFieldIds ?? []).slice(0, JIRA_EXTRA_FIELDS_MAX)) {
    if (!isJiraFieldId(id)) continue;
    const value = jiraCustomValue(fields[id]);
    if (value !== null) custom[id] = value;
  }
  return {
    statusCategoryKey: category === 'new' || category === 'indeterminate' || category === 'done' ? category : null,
    parentKey: text(record(fields.parent)?.key),
    epicKey: epicKey(fields, config),
    components: names(fields.components),
    fixVersions: names(fields.fixVersions),
    storyPoints: storyPoints(fields, config),
    dueDate: due && /^\d{4}-\d{2}-\d{2}/.test(due) ? due.slice(0, 10) : null,
    assigneeLogin: shown(assignee?.name) ?? shown(assignee?.key) ?? shown(assignee?.accountId),
    custom,
  };
}

/** The attributes as stored: within the size limit, or without the custom fields when past it. */
export function storedJiraAttributes(attributes: JiraIssueAttributes | undefined): JiraIssueAttributes | null {
  if (!attributes) return null;
  const fits = (value: JiraIssueAttributes) => Buffer.byteLength(JSON.stringify(value), 'utf8') <= JIRA_ATTRIBUTES_MAX_BYTES;
  if (fits(attributes)) return attributes;
  // First the chosen custom fields go, then the lists are shortened until it fits.
  let trimmed: JiraIssueAttributes = { ...attributes, custom: {} };
  while (!fits(trimmed) && (trimmed.components.length > 0 || trimmed.fixVersions.length > 0)) {
    trimmed = trimmed.components.length >= trimmed.fixVersions.length
      ? { ...trimmed, components: trimmed.components.slice(0, -1) }
      : { ...trimmed, fixVersions: trimmed.fixVersions.slice(0, -1) };
  }
  return trimmed;
}

/** Whether two stored attribute objects say the same; key order does not matter. */
export function sameJiraAttributes(left: unknown, right: unknown) {
  const canonical = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical((value as Record<string, unknown>)[key])])) : value ?? null;
  return JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
}

/** The catalog of field names seen in search answers, merged and capped. */
export function mergeJiraFieldCatalog(current: unknown, seen: Record<string, string> | undefined) {
  const merged: Record<string, string> = {};
  for (const [id, name] of Object.entries(record(current) ?? {})) if (isJiraFieldId(id) && typeof name === 'string') merged[id] = name.slice(0, TEXT_MAX);
  let changed = false;
  for (const [id, name] of Object.entries(seen ?? {})) {
    if (!isJiraFieldId(id) || typeof name !== 'string' || merged[id] === name.slice(0, TEXT_MAX)) continue;
    if (!(id in merged) && Object.keys(merged).length >= JIRA_FIELD_CATALOG_MAX) continue;
    merged[id] = name.slice(0, TEXT_MAX);
    changed = true;
  }
  return { catalog: merged, changed };
}
