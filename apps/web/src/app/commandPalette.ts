export type PaletteGroup = "recent" | "actions" | "sections" | "goto" | "projects";

export type PaletteCommand = {
  id: string;
  group: Exclude<PaletteGroup, "recent">;
  label: string;
  /** Shown to the right: the project code, the section it opens. */
  hint?: string;
  /** Other words it answers to, in either language. */
  keywords?: string[];
  run: () => void;
};

const GROUP_ORDER: PaletteGroup[] = ["recent", "actions", "sections", "goto", "projects"];
export const PALETTE_RECENT_LIMIT = 5;
const RECENT_STORAGE_KEY = "pms:command-palette:recent";

const EN = "qwertyuiop[]asdfghjkl;'zxcvbnm,.`";
const RU = "йцукенгшщзхъфывапролджэячсмитьбюё";
const enToRu = new Map([...EN].map((char, index) => [char, RU[index]!]));
const ruToEn = new Map([...RU].map((char, index) => [char, EN[index]!]));

/** The same keys typed in the other keyboard layout: «cnhernehf» is «структура». */
export function switchLayout(value: string) {
  return [...value.toLowerCase()].map((char) => enToRu.get(char) ?? ruToEn.get(char) ?? char).join("");
}

function normalize(value: string) {
  return value.toLowerCase().replace(/ё/g, "е").trim();
}

function scoreText(text: string, query: string) {
  const haystack = normalize(text);
  if (!query) return 1;
  if (haystack === query) return 100;
  if (haystack.startsWith(query)) return 80;
  if (haystack.split(/[\s·/,.()-]+/).some((word) => word.startsWith(query))) return 60;
  if (haystack.includes(query)) return 40;
  // Letters in order, gaps allowed: «пртф» finds «портфель».
  let position = 0;
  for (const char of haystack) {
    if (char === query[position]) position += 1;
    if (position === query.length) return 10;
  }
  return 0;
}

/** How well a command answers a query, in the layout typed or the other one; 0 is not at all. */
export function scoreCommand(command: Pick<PaletteCommand, "label" | "hint" | "keywords">, rawQuery: string) {
  const queries = [normalize(rawQuery), normalize(switchLayout(rawQuery))];
  const texts = [command.label, command.hint ?? "", ...(command.keywords ?? [])];
  let best = 0;
  queries.forEach((query, layoutIndex) => {
    texts.forEach((text, textIndex) => {
      // The label counts most, a typo in layout a little less.
      const score = scoreText(text, query) - (textIndex === 0 ? 0 : 5) - layoutIndex * 2;
      if (score > best) best = score;
    });
  });
  return best;
}

export type PaletteEntry = { command: PaletteCommand; group: PaletteGroup };

/**
 * Without a query: recent commands first, then every group in its order.
 * With one: the matching commands by score, the group order breaking ties.
 */
export function filterCommands(commands: PaletteCommand[], query: string, recentIds: string[]): PaletteEntry[] {
  const byId = new Map(commands.map((command) => [command.id, command]));
  if (!normalize(query)) {
    const recent = recentIds.flatMap((id) => (byId.has(id) ? [byId.get(id)!] : [])).slice(0, PALETTE_RECENT_LIMIT);
    const recentSet = new Set(recent.map((command) => command.id));
    return [
      ...recent.map((command) => ({ command, group: "recent" as const })),
      ...[...commands]
        .filter((command) => !recentSet.has(command.id))
        .sort((left, right) => GROUP_ORDER.indexOf(left.group) - GROUP_ORDER.indexOf(right.group))
        .map((command) => ({ command, group: command.group })),
    ];
  }
  return commands
    .map((command) => ({ command, score: scoreCommand(command, query) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || GROUP_ORDER.indexOf(left.command.group) - GROUP_ORDER.indexOf(right.command.group))
    .map(({ command }) => ({ command, group: command.group }));
}

export function readRecentCommands(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): string[] {
  try {
    const value: unknown = JSON.parse(storage?.getItem(RECENT_STORAGE_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 20) : [];
  } catch {
    return [];
  }
}

export function rememberCommand(id: string, storage: Pick<Storage, "getItem" | "setItem"> | undefined = globalThis.localStorage) {
  const next = [id, ...readRecentCommands(storage).filter((item) => item !== id)].slice(0, 20);
  try {
    storage?.setItem(RECENT_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A blocked storage only loses the recent list.
  }
  return next;
}
