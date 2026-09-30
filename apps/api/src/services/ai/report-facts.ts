/** Shared pieces for handing project facts to a model: dates, cut text, fitting a budget, a safe data block. */

export const DAY_MS = 86_400_000;

export const day = (value: Date | null | undefined) => (value ? value.toISOString().slice(0, 10) : null);

export const cutText = (value: string | null | undefined, limit: number) => (value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);

/** Midnight UTC of the given moment: periods and horizons run in UTC days. */
export const utcDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

export const isOpenWork = (status: string) => status !== 'DONE' && status !== 'CANCELLED';

export const isActiveRaid = (status: string) => !['CLOSED', 'VALIDATED'].includes(status);

/**
 * Serialises facts, first keeping at most `listItems` per list, then halving
 * the longest list until the text fits `maxChars`. The totals the caller put in
 * stay, so the model still knows how much was left out.
 */
export function fitFacts(facts: Record<string, unknown>, listKeys: string[], { maxChars, listItems }: { maxChars: number; listItems: number }) {
  for (const key of listKeys) facts[key] = (facts[key] as unknown[]).slice(0, listItems);
  let text = JSON.stringify(facts);
  while (text.length > maxChars) {
    const longest = [...listKeys].sort((left, right) => (facts[right] as unknown[]).length - (facts[left] as unknown[]).length)[0];
    const list = facts[longest] as unknown[];
    if (!longest || list.length === 0) break;
    facts[longest] = list.slice(0, Math.floor(list.length / 2));
    text = JSON.stringify(facts);
  }
  return text;
}

/**
 * The values under the given keys anywhere in the facts as sent, after the
 * lists were trimmed: what the model saw is all an answer may point to.
 */
export function sentValues(text: string, keys: string[]) {
  const found = new Set<string>();
  const walk = (value: unknown, key?: string) => {
    if (Array.isArray(value)) value.forEach((entry) => walk(entry, key));
    else if (value && typeof value === 'object') for (const [name, entry] of Object.entries(value)) walk(entry, name);
    else if (typeof value === 'string' && value && key && keys.includes(key)) found.add(value);
  };
  walk(JSON.parse(text));
  return found;
}

/** The first `limit` entries; the rest count as dropped. */
export function capped<T>(list: T[], limit: number, counter: { dropped: number }) {
  if (list.length > limit) counter.dropped += list.length - limit;
  return list.slice(0, limit);
}

/** Data between tags the model is told never to obey; with every "<" disarmed, nothing inside can open or close a tag. */
export function dataBlock(tag: string, data: string) {
  return [`<${tag}>`, data.replaceAll('<', '‹'), `</${tag}>`].join('\n');
}

/** `type` is the RAID type of a risk reference, so the register can show the right list. */
export type FactRef = { kind: 'wbs' | 'issue' | 'risk' | 'jira'; id: string; label: string; type?: string };

/**
 * The references the facts offer ("wbs:<id>", "issue:<id>", "risk:<id>",
 * "jira:<KEY>"). A reference from the model counts only if it is one of them;
 * the rest are dropped and counted.
 */
export class FactRefs {
  private readonly known = new Map<string, FactRef>();

  add(kind: FactRef['kind'], id: string, label: string, type?: string) {
    const ref = `${kind}:${id}`;
    this.known.set(ref, { kind, id, label, ...(type ? { type } : {}) });
    return ref;
  }

  /** Forgets every reference that did not make it into the facts sent. */
  retain(sent: Set<string>) {
    for (const ref of [...this.known.keys()]) if (!sent.has(ref)) this.known.delete(ref);
    return this;
  }

  has(ref: string) {
    return this.known.has(ref);
  }

  get(ref: string) {
    return this.known.get(ref);
  }

  /** Keeps known references once each; `dropped` grows by the unknown ones. */
  keep(refs: unknown, counter: { dropped: number }, limit = 8) {
    const kept: string[] = [];
    for (const value of Array.isArray(refs) ? refs : []) {
      const ref = typeof value === 'string' ? value.trim() : '';
      if (!this.known.has(ref)) {
        counter.dropped += 1;
        continue;
      }
      if (kept.includes(ref)) continue;
      // Known, but past the limit per row: dropped too.
      if (kept.length < limit) kept.push(ref);
      else counter.dropped += 1;
    }
    return kept;
  }

  /** The labels of the given references, for the page to link to the rows. */
  resolve(refs: Iterable<string>) {
    const result: Record<string, FactRef> = {};
    for (const ref of refs) {
      const known = this.known.get(ref);
      if (known) result[ref] = known;
    }
    return result;
  }
}
