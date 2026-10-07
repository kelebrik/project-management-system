import { useEffect, useMemo, useRef, useState } from "react";
import { PAGE_ROADMAP_DEFAULT, type PageDatasetRow, type PageQueryResult, type PageWidget } from "@pms/shared";
import { layoutRoadmapLane, roadmapMonths, roadmapPosition, roadmapWindow, shortenText, type RoadmapLaneLayout, type RoadmapWindow } from "../../../app/pages/roadmapLayout";
import { formatPageValue } from "../../../app/pages/pageModel";
import { useI18n } from "../../../i18n/I18nProvider";
import { useBoxSize } from "../useBoxSize";

/**
 * A roadmap of goals: a time axis from some months before today to some after,
 * one thin lane per project of the scope above it, the milestones and goals
 * of each project on its lane with their names right next to them. Names never
 * overlap: those that do not fit are shortened, and the rest are counted as
 * "+N" by the project. Lanes that do not fit the widget are counted below it.
 */

type Roadmap = Extract<PageQueryResult, { kind: "roadmap" }>;

const ROW = 14;
const LANE = 22;
const AXIS = 18;
const GUTTER = 22;
const FONT_SIZE = 11;
/** The height of the line that counts the projects that did not fit. */
const MORE = 18;

/** Widths of texts as the browser draws them in the widget's font, after the fonts have loaded. */
function useTextMeasure(box: React.RefObject<HTMLElement | null>) {
  const [fontsReady, setFontsReady] = useState(0);
  useEffect(() => {
    let alive = true;
    void document.fonts?.ready.then(() => alive && setFontsReady((count) => count + 1));
    return () => {
      alive = false;
    };
  }, []);
  return useMemo(() => {
    const context = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
    const family = box.current ? getComputedStyle(box.current).fontFamily : "sans-serif";
    const cache = new Map<string, number>();
    const measure = (weight: number) => (text: string) => {
      const key = `${weight}|${text}`;
      const known = cache.get(key);
      if (known !== undefined) return known;
      let width = text.length * FONT_SIZE * 0.58;
      if (context) {
        context.font = `${weight} ${FONT_SIZE}px ${family}`;
        width = context.measureText(text).width;
      }
      cache.set(key, width);
      return width;
    };
    return { regular: measure(400), bold: measure(600) };
    // Measured again when the fonts are in and when the box first appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsReady, box.current]);
}

const dayOf = (row: PageDatasetRow) => (typeof row.values.forecastDate === "string" ? row.values.forecastDate : typeof row.values.plannedDate === "string" ? row.values.plannedDate : null);
const inWindow = (day: string, range: RoadmapWindow) => day >= range.from && day <= range.to;

/** A five-pointed star or a diamond around a point. */
function markerPath(goal: boolean, x: number, y: number) {
  if (!goal) return `M ${x} ${y - 6} L ${x + 6} ${y} L ${x} ${y + 6} L ${x - 6} ${y} Z`;
  const points = Array.from({ length: 10 }, (_, index) => {
    const radius = index % 2 === 0 ? 7 : 3;
    const angle = (Math.PI / 5) * index - Math.PI / 2;
    return `${(x + radius * Math.cos(angle)).toFixed(1)} ${(y + radius * Math.sin(angle)).toFixed(1)}`;
  });
  return `M ${points.join(" L ")} Z`;
}

type LaneDrawing = {
  key: string;
  project: string;
  projectName: string;
  href: string | null;
  top: number;
  height: number;
  lineY: number;
  items: Array<{ row: PageDatasetRow; x: number; planX: number | null; day: string; plan: string | null }>;
  layout: RoadmapLaneLayout;
  before: number;
  after: number;
};

export function RoadmapWidget({ widget, result, today, drillable }: { widget: PageWidget; result: Roadmap; today: string; drillable: boolean }) {
  const { locale, t } = useI18n();
  const box = useRef<HTMLDivElement | null>(null);
  const { width, height } = useBoxSize(box);
  const measure = useTextMeasure(box);
  const { before, after } = widget.roadmap ?? PAGE_ROADMAP_DEFAULT;
  const range = roadmapWindow(today, before, after);
  const labelWidth = Math.round(Math.min(170, Math.max(70, width * 0.16)));
  const plotLeft = labelWidth + GUTTER;
  const plotRight = Math.max(plotLeft + 40, width - GUTTER);
  const x = (day: string) => plotLeft + roadmapPosition(day, range) * (plotRight - plotLeft);

  const { lanes, moreLanes } = useMemo(() => {
    const build = (room: number) => {
      const drawn: LaneDrawing[] = [];
      let top = 0;
      for (const lane of result.lanes) {
        const dated = lane.items.map((row) => ({ row, day: dayOf(row) })).filter((entry): entry is { row: PageDatasetRow; day: string } => entry.day !== null);
        const shown = dated.filter((entry) => inWindow(entry.day, range));
        const items = shown.map(({ row, day }) => {
          const plan = typeof row.values.plannedDate === "string" && row.values.plannedDate !== day ? row.values.plannedDate : null;
          return { row, day, plan, x: x(day), planX: plan && inWindow(plan, range) ? x(plan) : null };
        });
        const layout = layoutRoadmapLane(
          items.map((item) => ({ id: item.row.id, x: item.x, label: String(item.row.values.title ?? ""), obstacles: item.planX === null ? undefined : [[item.planX - 4, item.planX + 4]] })),
          { left: plotLeft, right: plotRight },
          measure.regular,
        );
        const laneHeight = LANE + (layout.above ? ROW : 0) + (layout.below ? ROW : 0);
        if (top + laneHeight > room && drawn.length > 0) break;
        drawn.push({
          key: lane.projectId,
          project: lane.project,
          projectName: lane.projectName,
          href: lane.href,
          top,
          height: laneHeight,
          lineY: top + (layout.above ? ROW : 0) + LANE / 2,
          items,
          layout,
          before: dated.filter((entry) => entry.day < range.from).length,
          after: dated.filter((entry) => entry.day > range.to).length,
        });
        top += laneHeight;
      }
      return drawn;
    };
    // When not every lane fits, they are laid out again leaving room for the line that counts the rest.
    const all = build(height - AXIS);
    const drawn = all.length < result.totalLanes ? build(height - AXIS - MORE) : all;
    return { lanes: drawn, moreLanes: result.totalLanes - drawn.length };
    // `x` follows from the range and the plot, both in the dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, range.from, range.to, plotLeft, plotRight, height, measure]);

  // The measured box stays even when there is nothing to draw, so lanes that come later are drawn.
  if (result.lanes.length === 0) return <div className="mp-fill mp-roadmap-box" ref={box}><div className="mp-note">{t("ui.pages.roadmap.noProjects")}</div></div>;
  const bottom = lanes.reduce((sum, lane) => sum + lane.height, 0);
  const months = roadmapMonths(range);
  const monthWidth = (plotRight - plotLeft) / Math.max(1, (before + after));
  const monthLabel = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    const short = new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", { month: "short", timeZone: "UTC" }).format(date).replace(".", "");
    return date.getUTCMonth() === 0 || day === months[0] ? `${short} ${date.getUTCFullYear()}` : short;
  };
  const quarterLabel = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    return locale === "ru" ? `${Math.floor(date.getUTCMonth() / 3) + 1} кв. ${date.getUTCFullYear()}` : `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`;
  };
  // Narrow months are labelled by quarters.
  const candidates = monthWidth >= 38 ? months.map((day) => ({ day, text: monthLabel(day) })) : months.filter((day) => new Date(`${day}T00:00:00Z`).getUTCMonth() % 3 === 0).map((day) => ({ day, text: quarterLabel(day) }));
  // Axis labels do not overlap either: one that would run into the previous one is left out.
  const axisLabels = candidates.reduce<Array<{ day: string; text: string; end: number }>>((kept, label) => {
    const start = x(label.day) + 3;
    const end = start + measure.regular(label.text);
    const previous = kept.at(-1)?.end ?? -Infinity;
    return start < previous + 6 || end > width ? kept : [...kept, { ...label, end }];
  }, []);
  const date = (day: string) => formatPageValue(day, { key: "day", label: { ru: "", en: "" }, kind: "date", format: "date" }, locale);

  return (
    <div className="mp-fill mp-roadmap-box" ref={box}>
      {width > 0 && (
        <svg aria-hidden="true" className="mp-roadmap" height={bottom + AXIS} width={width}>
          {months.map((day) => <line className="mp-roadmap-grid" key={day} x1={x(day)} x2={x(day)} y1={0} y2={bottom} />)}
          {axisLabels.map((label) => <text className="mp-roadmap-axis" key={label.day} x={x(label.day) + 3} y={bottom + 13}>{label.text}</text>)}
          {inWindow(today, range) && <line className="mp-roadmap-today" x1={x(today)} x2={x(today)} y1={0} y2={bottom} />}
          {lanes.map((lane) => {
            const hiddenNames = lane.items.filter((item) => lane.layout.hidden.includes(item.row.id)).map((item) => String(item.row.values.title ?? ""));
            const code = shortenText(lane.project, labelWidth - (hiddenNames.length ? 26 : 4), measure.bold) ?? lane.project.slice(0, 3);
            return (
              <g className="mp-roadmap-lane" key={lane.key}>
                <text className="mp-roadmap-project" x={0} y={lane.lineY + 4}>
                  <title>{lane.projectName}</title>
                  {code}
                </text>
                {hiddenNames.length > 0 && (
                  <text className="mp-roadmap-hidden" textAnchor="end" x={labelWidth} y={lane.lineY + 4}>
                    <title>{t("ui.pages.roadmap.hidden", { names: hiddenNames.join("; ") })}</title>
                    {`+${hiddenNames.length}`}
                  </text>
                )}
                <line className="mp-roadmap-line" x1={plotLeft} x2={plotRight} y1={lane.lineY} y2={lane.lineY} />
                {lane.before > 0 && (
                  <text className="mp-roadmap-edge" textAnchor="end" x={plotLeft - 3} y={lane.lineY + 4}>
                    <title>{t("ui.pages.roadmap.before", { count: lane.before })}</title>
                    {`‹${lane.before}`}
                  </text>
                )}
                {lane.after > 0 && (
                  <text className="mp-roadmap-edge" x={plotRight + 3} y={lane.lineY + 4}>
                    <title>{t("ui.pages.roadmap.after", { count: lane.after })}</title>
                    {`${lane.after}›`}
                  </text>
                )}
                {lane.items.map((item) => {
                  const values = item.row.values;
                  const late = item.plan !== null && item.day > item.plan;
                  const done = values.status === "DONE";
                  const cancelled = values.status === "CANCELLED";
                  const label = lane.layout.labels.find((entry) => entry.id === item.row.id);
                  const labelY = !label ? 0 : label.tier === 0 ? lane.lineY + 4 : label.tier === 1 ? lane.lineY - 12 : lane.lineY + 19;
                  const tip = `${String(values.title ?? "")}: ${date(item.day)}${item.plan ? ` (${t("ui.pages.roadmap.plan")} ${date(item.plan)})` : ""}`;
                  const content = (
                    <>
                      {item.planX !== null && <line className={late ? "mp-roadmap-slip" : "mp-roadmap-gain"} x1={item.planX} x2={item.x} y1={lane.lineY} y2={lane.lineY} />}
                      {item.planX !== null && <circle className="mp-roadmap-plan" cx={item.planX} cy={lane.lineY} r={3.5} />}
                      <path className={`mp-roadmap-mark ${values.type === "GOAL" ? "mp-roadmap-goal" : ""} ${cancelled ? "mp-roadmap-cancelled" : done ? "mp-roadmap-done" : late ? "mp-roadmap-late" : ""}`} d={markerPath(values.type === "GOAL", item.x, lane.lineY)}>
                        <title>{tip}</title>
                      </path>
                      {label && label.tier !== 0 && <line className="mp-roadmap-connector" x1={item.x} x2={item.x} y1={lane.lineY + (label.tier === 1 ? -7 : 7)} y2={label.tier === 1 ? labelY + 2 : labelY - 9} />}
                      {label && label.tier === 0 && <rect className="mp-roadmap-label-bg" height={13} rx={2} width={label.width + 4} x={label.x - 2} y={lane.lineY - 7} />}
                      {label && (
                        <text className={`mp-roadmap-label ${cancelled ? "mp-roadmap-label-cancelled" : ""}`} x={label.side === "right" ? label.x : label.x + label.width} textAnchor={label.side === "right" ? "start" : "end"} y={labelY}>
                          <title>{tip}</title>
                          {label.text}
                        </text>
                      )}
                    </>
                  );
                  // A click for the mouse; the keyboard reaches the same links in the list in words below.
                  return drillable && item.row.href ? <a href={item.row.href} key={item.row.id} tabIndex={-1}>{content}</a> : <g key={item.row.id}>{content}</g>;
                })}
              </g>
            );
          })}
        </svg>
      )}
      {/* The same in words for a screen reader: every drawn project with all its goals in the window, those without a label too. */}
      <ul aria-label={widget.title} className="mp-roadmap-words">
        {lanes.map((lane) => (
          <li key={lane.key}>
            {`${lane.projectName} (${lane.project}): `}
            {lane.items.length === 0 && t("ui.pages.roadmap.noGoals")}
            {lane.items.map((item, index) => {
              const status = item.row.values.status === "CANCELLED" ? t("ui.pages.roadmap.cancelled") : item.row.values.status === "DONE" ? t("ui.pages.roadmap.done") : item.plan !== null && item.day > item.plan ? t("ui.pages.roadmap.late") : "";
              const text = `${String(item.row.values.title ?? "")} — ${date(item.day)}${item.plan ? `, ${t("ui.pages.roadmap.plan")} ${date(item.plan)}` : ""}${status ? `, ${status}` : ""}`;
              return (
                <span key={item.row.id}>
                  {index > 0 && "; "}
                  {drillable && item.row.href ? <a href={item.row.href}>{text}</a> : text}
                </span>
              );
            })}
            {lane.before > 0 ? `; ${t("ui.pages.roadmap.before", { count: lane.before })}` : ""}
            {lane.after > 0 ? `; ${t("ui.pages.roadmap.after", { count: lane.after })}` : ""}
          </li>
        ))}
      </ul>
      {moreLanes > 0 && <div className="mp-more">{t("ui.pages.roadmap.moreProjects", { count: moreLanes })}</div>}
    </div>
  );
}
