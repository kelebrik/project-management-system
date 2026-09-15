import { wikiGroups } from "../app/wikiContent";
import { englishWikiGroups } from "./wiki.en";
import type { Locale } from "./types";
export const getWikiGroups = (locale: Locale) => locale === "en" ? englishWikiGroups : wikiGroups;
