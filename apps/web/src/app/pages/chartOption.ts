import type { PageChartKind, PageFieldDef, PageFieldFormat, PageQueryResult } from "@pms/shared";
import { formatNumber, groupLabel, type Locale } from "./pageModel";

/**
 * What a chart widget is asked to draw — the server's groups, the look, the
 * colours of the sheet — and the sentence a screen reader says instead of it.
 * The picture itself is built by highchartsOption.ts.
 */

export type ChartColors = { series: string[]; text: string; muted: string; grid: string; surface: string; rag: Record<"GREEN" | "AMBER" | "RED", string> };

type Groups = Extract<PageQueryResult, { kind: "groups" }>;

export type ChartInput = {
  result: Groups;
  kind: PageChartKind;
  field: PageFieldDef | null;
  subField: PageFieldDef | null;
  unit: PageFieldFormat;
  showValues: boolean;
  colors: ChartColors;
  locale: Locale;
  title: string;
  /** Values past these limits are drawn red. */
  alert?: { above?: number; below?: number };
};

/** A sentence a screen reader says instead of the picture. */
export function chartSummary(input: Pick<ChartInput, "result" | "field" | "unit" | "locale" | "title">) {
  const parts = input.result.groups.slice(0, 12).map((group) => `${groupLabel(group.key, input.field, input.result.bucket, input.locale)}: ${formatNumber(group.value, input.unit, input.locale)}`);
  return `${input.title}. ${parts.join("; ")}${input.result.groups.length > 12 ? "…" : ""}`;
}
