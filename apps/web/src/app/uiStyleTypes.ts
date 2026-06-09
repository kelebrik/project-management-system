import type { CSSProperties } from "react";

export type GanttCssProperties = CSSProperties & {
  "--gantt-panel-height": string;
  "--gantt-panel-width": string;
  "--gantt-wbs-width": string;
  "--gantt-timeline-width": string;
};

export type WbsTableCssProperties = CSSProperties & {
  "--wbs-table-template": string;
  "--wbs-level-width": string;
};
