import { createHash } from 'node:crypto';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type JiraVersionCanonicalResult = {
  canonicalJson: string;
  warnings: string[];
};

export type SanitizedJiraVersionPayload = {
  payload: unknown;
  attachmentReferencesStripped: number;
};

function unicodeScalarCompare(left: string, right: string) {
  const leftPoints = Array.from(left, (character) => character.codePointAt(0)!);
  const rightPoints = Array.from(right, (character) => character.codePointAt(0)!);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    if (leftPoints[index] !== rightPoints[index]) {
      return (leftPoints[index] ?? 0) - (rightPoints[index] ?? 0);
    }
  }
  return leftPoints.length - rightPoints.length;
}

function assertValidUnicode(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new Error('Invalid Unicode surrogate pair');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new Error('Invalid Unicode surrogate pair');
    }
  }
}

function toJsonValue(value: unknown, path = '$'): JsonValue | undefined {
  if (value === undefined) return undefined;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`Non-finite number at ${path}`);
    return value;
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => {
      const normalized = toJsonValue(entry, `${path}[${index}]`);
      return normalized === undefined ? [] : [normalized];
    });
  }
  if (!value || typeof value !== 'object') throw new Error(`Unsupported value at ${path}`);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([key, entry]) => {
      const normalized = toJsonValue(entry, `${path}.${key}`);
      return normalized === undefined ? [] : [[key, normalized]];
    }),
  );
}

function record(value: JsonValue | undefined) {
  return value && !Array.isArray(value) && typeof value === 'object' ? value : undefined;
}

function normalizeTimestamp(
  target: { [key: string]: JsonValue },
  key: string,
  path: string,
  warnings: string[],
) {
  const value = target[key];
  if (value === undefined || value === null) return;
  if (typeof value !== 'string') {
    warnings.push(`${path} is not a string`);
    return;
  }
  const dateOnly = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnly) {
    const date = new Date(Date.UTC(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3])));
    if (
      Number(dateOnly[1]) >= 1000
      && date.getUTCFullYear() === Number(dateOnly[1])
      && date.getUTCMonth() === Number(dateOnly[2]) - 1
      && date.getUTCDate() === Number(dateOnly[3])
    ) return;
    warnings.push(`${path} is not a valid date`);
    return;
  }
  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(Z|([+-])(\d{2}):?(\d{2}))$/,
  );
  if (!match) {
    warnings.push(`${path} is not a valid timestamp`);
    return;
  }
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone,
    sign, offsetHourText = '0', offsetMinuteText = '0'] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, '0').slice(0, 3));
  const offsetHour = Number(offsetHourText);
  const offsetMinute = Number(offsetMinuteText);
  const localUtc = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  const local = new Date(localUtc);
  const calendarValid = year >= 1000
    && month >= 1 && month <= 12
    && day >= 1 && day <= 31
    && hour <= 23 && minute <= 59 && second <= 59
    && local.getUTCFullYear() === year
    && local.getUTCMonth() === month - 1
    && local.getUTCDate() === day
    && local.getUTCHours() === hour
    && local.getUTCMinutes() === minute
    && local.getUTCSeconds() === second;
  const offsetValid = offsetHour <= 14
    && offsetMinute <= 59
    && (offsetHour < 14 || offsetMinute === 0);
  if (!calendarValid || !offsetValid) {
    warnings.push(`${path} is not a valid timestamp`);
    return;
  }
  const offsetMinutes = zone === 'Z'
    ? 0
    : (sign === '-' ? -1 : 1) * (offsetHour * 60 + offsetMinute);
  target[key] = new Date(localUtc - offsetMinutes * 60_000).toISOString();
}

function valueRank(value: JsonValue | undefined) {
  return value === undefined ? 0 : value === null ? 1 : 2;
}

function compareNullable(left: JsonValue | undefined, right: JsonValue | undefined) {
  const rankDifference = valueRank(left) - valueRank(right);
  if (rankDifference !== 0 || left === undefined || left === null || right === undefined || right === null) {
    return rankDifference;
  }
  return unicodeScalarCompare(String(left), String(right));
}

function compareStableId(left: JsonValue | undefined, right: JsonValue | undefined) {
  const rankDifference = valueRank(left) - valueRank(right);
  if (
    rankDifference !== 0
    || left === undefined
    || left === null
    || right === undefined
    || right === null
  ) {
    return rankDifference;
  }
  const leftString = String(left);
  const rightString = String(right);
  if (/^\d+$/.test(leftString) && /^\d+$/.test(rightString)) {
    const numeric = BigInt(leftString) - BigInt(rightString);
    if (numeric !== 0n) return numeric < 0n ? -1 : 1;
  }
  return unicodeScalarCompare(leftString, rightString);
}

function compareTuple(
  left: JsonValue,
  right: JsonValue,
  keys: readonly string[],
  idKeys: ReadonlySet<string> = new Set(),
) {
  const leftRecord = record(left);
  const rightRecord = record(right);
  for (const key of keys) {
    const difference = idKeys.has(key)
      ? compareStableId(leftRecord?.[key], rightRecord?.[key])
      : compareNullable(leftRecord?.[key], rightRecord?.[key]);
    if (difference !== 0) return difference;
  }
  return unicodeScalarCompare(canonicalJson(left), canonicalJson(right));
}

function normalizeEntitySet(fields: { [key: string]: JsonValue }, key: string) {
  const values = fields[key];
  if (!Array.isArray(values)) return;
  values.sort((left, right) => compareTuple(left, right, ['id', 'name'], new Set(['id'])));
}

function sprintIdentity(value: JsonValue) {
  if (typeof value !== 'string') {
    const valueRecord = record(value);
    return { id: valueRecord?.id, name: valueRecord?.name };
  }
  return {
    id: value.match(/(?:^|,|\[)id=(\d+)(?:,|\])/i)?.[1],
    name: value.match(/(?:^|,)name=([^,\]]+)(?:,|\])/i)?.[1]?.trim(),
  };
}

function normalizeSprintSet(fields: { [key: string]: JsonValue }, key: string) {
  const values = fields[key];
  if (!Array.isArray(values)) return;
  values.sort((left, right) => {
    const leftSprint = sprintIdentity(left);
    const rightSprint = sprintIdentity(right);
    return compareStableId(leftSprint.id, rightSprint.id)
      || compareNullable(leftSprint.name, rightSprint.name)
      || unicodeScalarCompare(canonicalJson(left), canonicalJson(right));
  });
}

function normalizeVersionDocument(
  document: JsonValue,
  warnings: string[],
) {
  const root = record(document);
  if (!root) throw new Error('Jira version document must be an object');
  const issue = record(root.issue);
  const fields = record(issue?.fields);
  if (fields) {
    for (const key of ['created', 'updated', 'resolutiondate']) {
      normalizeTimestamp(fields, key, `$.issue.fields.${key}`, warnings);
    }
    if (Array.isArray(fields.labels)) {
      fields.labels.sort((left, right) => compareNullable(left, right));
    }
    for (const key of ['components', 'versions', 'fixVersions']) {
      normalizeEntitySet(fields, key);
    }
    for (const key of ['sprints', 'customfield_10004']) {
      normalizeSprintSet(fields, key);
    }
  }

  if (Array.isArray(root.changelog)) {
    root.changelog.forEach((entry, index) => {
      const history = record(entry);
      if (!history) return;
      normalizeTimestamp(history, 'created', `$.changelog[${index}].created`, warnings);
      if (Array.isArray(history.items)) {
        history.items.sort((left, right) => compareTuple(
          left,
          right,
          ['fieldId', 'field', 'from', 'to'],
          new Set(['from', 'to']),
        ));
      }
    });
    root.changelog.sort((left, right) => compareTuple(
      left,
      right,
      ['created', 'id'],
      new Set(['id']),
    ));
  }

  for (const collectionName of ['comments', 'worklogs'] as const) {
    const collection = root[collectionName];
    if (!Array.isArray(collection)) continue;
    collection.forEach((entry, index) => {
      const item = record(entry);
      if (!item) return;
      for (const key of collectionName === 'comments'
        ? ['created', 'updated']
        : ['created', 'updated', 'started']) {
        normalizeTimestamp(item, key, `$.${collectionName}[${index}].${key}`, warnings);
      }
    });
    collection.sort((left, right) => compareTuple(left, right, ['id'], new Set(['id'])));
  }

  if (Array.isArray(root.remoteLinks)) {
    root.remoteLinks.sort((left, right) => {
      const leftRecord = record(left);
      const rightRecord = record(right);
      const leftUrl = leftRecord?.url ?? record(leftRecord?.object)?.url;
      const rightUrl = rightRecord?.url ?? record(rightRecord?.object)?.url;
      return compareStableId(leftRecord?.id, rightRecord?.id)
        || compareNullable(leftUrl, rightUrl)
        || unicodeScalarCompare(canonicalJson(left), canonicalJson(right));
    });
  }
}

function containsAttachmentMetadata(value: JsonValue): boolean {
  if (Array.isArray(value)) return value.some(containsAttachmentMetadata);
  const valueRecord = record(value);
  if (!valueRecord) return false;
  const type = typeof valueRecord.type === 'string' ? valueRecord.type.toLowerCase() : '';
  if (['media', 'mediagroup', 'mediasingle', 'mediainline'].includes(type)) return true;
  const field = typeof (valueRecord.fieldId ?? valueRecord.field) === 'string'
    ? String(valueRecord.fieldId ?? valueRecord.field).toLowerCase()
    : '';
  if (field === 'attachment' || field === 'attachments') return true;
  if (
    typeof valueRecord.filename === 'string'
    && ['mimeType', 'content', 'thumbnail'].some((key) => key in valueRecord)
  ) return true;
  return Object.entries(valueRecord).some(([key, entry]) => {
    const normalizedKey = key.toLowerCase();
    return normalizedKey === 'attachment'
      || normalizedKey === 'attachments'
      || containsAttachmentMetadata(entry);
  });
}

const transientJiraKeys = new Set([
  'avatarurls',
  'expand',
  'iconurl',
  'self',
  'thumbnail',
]);

function isAttachmentKey(key: string) {
  const normalized = key.trim().toLowerCase();
  return normalized === 'attachment' || normalized === 'attachments';
}

function isAttachmentRecord(value: Record<string, unknown>) {
  const type = typeof value.type === 'string' ? value.type.trim().toLowerCase() : '';
  if (['media', 'mediagroup', 'mediasingle', 'mediainline'].includes(type)) return true;
  const field = typeof (value.fieldId ?? value.field) === 'string'
    ? String(value.fieldId ?? value.field).trim().toLowerCase()
    : '';
  if (field === 'attachment' || field === 'attachments') return true;
  return typeof value.filename === 'string'
    && ['mimeType', 'content', 'thumbnail'].some((key) => key in value);
}

function sanitizeVersionValue(value: unknown): { value: unknown; stripped: number } {
  if (Array.isArray(value)) {
    let stripped = 0;
    const entries: unknown[] = [];
    for (const entry of value) {
      const sanitized = sanitizeVersionValue(entry);
      stripped += sanitized.stripped;
      if (sanitized.value !== undefined) entries.push(sanitized.value);
    }
    return { value: entries, stripped };
  }
  if (!value || typeof value !== 'object') return { value, stripped: 0 };
  const source = value as Record<string, unknown>;
  if (isAttachmentRecord(source)) return { value: undefined, stripped: 1 };

  let stripped = 0;
  const entries: Array<[string, unknown]> = [];
  for (const [key, entry] of Object.entries(source)) {
    if (isAttachmentKey(key)) {
      const nested = sanitizeVersionValue(entry);
      stripped += Math.max(1, nested.stripped);
      continue;
    }
    if (transientJiraKeys.has(key.trim().toLowerCase())) continue;
    const sanitized = sanitizeVersionValue(entry);
    stripped += sanitized.stripped;
    if (sanitized.value !== undefined) entries.push([key, sanitized.value]);
  }
  return { value: Object.fromEntries(entries), stripped };
}

export function sanitizeJiraVersionPayload(input: unknown): SanitizedJiraVersionPayload {
  const sanitized = sanitizeVersionValue(input);
  if (sanitized.value === undefined) throw new Error('Jira version payload was an attachment');
  const payload = toJsonValue(sanitized.value);
  if (payload === undefined) throw new Error('Jira version payload is missing');
  if (containsAttachmentMetadata(payload)) {
    throw new Error('Jira version payload still contains attachment metadata after sanitization');
  }
  return {
    payload,
    attachmentReferencesStripped: sanitized.stripped,
  };
}

function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    return JSON.stringify(value);
  }
  if (typeof value === 'string') {
    assertValidUnicode(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => {
    assertValidUnicode(key);
    return `${JSON.stringify(key)}:${canonicalJson(value[key]!)}`;
  }).join(',')}}`;
}

export function canonicalizeJiraVersionV1(input: unknown): JiraVersionCanonicalResult {
  const document = toJsonValue(input);
  if (document === undefined) throw new Error('Jira version document is missing');
  if (containsAttachmentMetadata(document)) {
    throw new Error('Jira version document must be sanitized before canonicalization');
  }
  const warnings: string[] = [];
  normalizeVersionDocument(document, warnings);
  return { canonicalJson: canonicalJson(document), warnings };
}

export function hashJiraVersionV1(input: unknown) {
  const result = canonicalizeJiraVersionV1(input);
  return {
    ...result,
    contentHash: createHash('sha256').update(result.canonicalJson, 'utf8').digest('hex'),
  };
}
