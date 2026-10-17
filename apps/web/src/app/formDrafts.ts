/**
 * Unfinished forms kept on the device: a new project, an open issue, a risk,
 * meeting notes. What was typed survives a reload and a closed tab; coming
 * back, the person is asked whether to go on with it or drop it.
 */
export type StoredFormDraft<T> = { value: T; savedAt: string };

const PREFIX = "pms-draft:";

export function formDraftKey(kind: string, scope: string | null | undefined) {
  return `${PREFIX}${kind}:${scope ?? ""}`;
}

function storageOrNull(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/** True when every field the person fills is as in the blank form; fields set by the page itself are ignored. */
export function isBlankForm<T extends object>(value: T, blank: T, ignore: ReadonlyArray<keyof T> = []): boolean {
  return (Object.keys(blank) as Array<keyof T>).every(
    (key) => ignore.includes(key) || JSON.stringify(value[key] ?? null) === JSON.stringify(blank[key] ?? null),
  );
}

export function readFormDraft<T>(key: string, storage: Storage | null = storageOrNull()): StoredFormDraft<T> | null {
  try {
    const parsed: unknown = JSON.parse(storage?.getItem(key) ?? "null");
    if (!parsed || typeof parsed !== "object" || !("value" in parsed) || typeof (parsed as StoredFormDraft<T>).savedAt !== "string") return null;
    return parsed as StoredFormDraft<T>;
  } catch {
    return null;
  }
}

export function writeFormDraft<T>(key: string, value: T, storage: Storage | null = storageOrNull(), now = new Date()) {
  try {
    storage?.setItem(key, JSON.stringify({ value, savedAt: now.toISOString() } satisfies StoredFormDraft<T>));
  } catch {
    /* storage is optional: a full or missing one just keeps nothing */
  }
}

export function clearFormDraft(key: string, storage: Storage | null = storageOrNull()) {
  try {
    storage?.removeItem(key);
  } catch {
    /* ignore */
  }
}
