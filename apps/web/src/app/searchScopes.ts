import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";

export type SearchTab = "project" | "wbs" | "raid" | "issue";

/**
 * The tab a result belongs to. The server names risks "risk" and issues that
 * need a decision "decision"; artifacts, overviews and anything new go to Other.
 */
export function searchScopeOf(type: string): SearchTab | "other" {
  if (type === "project" || type === "wbs") return type;
  if (type === "risk" || type === "raid") return "raid";
  if (type === "issue" || type === "decision") return "issue";
  return "other";
}

export const SEARCH_TAB_LABEL: Record<SearchTab | "other", TranslationKey> = {
  project: "nav.projects",
  wbs: "search.structure",
  raid: "search.raid",
  issue: "search.issues",
  other: "search.other",
};
