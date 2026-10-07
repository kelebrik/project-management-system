import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useAppChartColors } from "../../app/charts/appChartTheme";
import { jiraFlowOption, jiraGroupsOption, jiraOrderedGroups, jiraStackedOption, type JiraChartGroup, type JiraChartPick, type JiraFlowSeries } from "../../app/charts/jiraChartOptions";
import { HighchartsChart } from "../charts/HighchartsChart";

/**
 * Jira widgets and flow charts drawn with Highcharts in the application's
 * theme. A chart is drawn anew only when its data, look or colours change —
 * compared by value — not on every render of the widget around it; `formatKey`
 * names the way its numbers are written (the metric). Each point is also a
 * button in a list hidden until it takes focus, so the drill works from the
 * keyboard and a screen reader, as it did with the charts drawn by hand.
 */

type PointButton = { key: string; label: string; disabled?: boolean; onClick: () => void };

function PointButtons({ items }: { items: PointButton[] }) {
  return <ul className="jira-hc-points">{items.map((item) => <li key={item.key}><button type="button" disabled={item.disabled} onClick={item.onClick}>{item.label}</button></li>)}</ul>;
}

/** A click on a drawn point always goes to the widget's current handler, though the chart is not drawn anew for it. */
function useCurrentPick(onPick: JiraChartPick): JiraChartPick {
  const current = useRef(onPick);
  useLayoutEffect(() => {
    current.current = onPick;
  });
  return useCallback((group, cell) => current.current(group, cell), []);
}

const heightFor = (count: number, row = 26, min = 180, max = 520) => Math.max(min, Math.min(max, count * row + 50));

export function JiraGroupsChart({ kind, title, groups, format, formatKey, onPick }: { kind: "columns" | "line" | "bars"; title: string; groups: JiraChartGroup[]; format: (value: number) => string; formatKey: string; onPick: JiraChartPick }) {
  const colors = useAppChartColors();
  const key = JSON.stringify([kind, title, groups, formatKey]);
  const pick = useCurrentPick(onPick);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn anew when the data changes, compared by value
  const options = useMemo(() => jiraGroupsOption({ kind, groups, title, seriesName: title, colors, format, onPick: pick }), [colors, key, pick]);
  return (
    <div className="jira-hc" role="group" aria-label={title}>
      <div style={{ height: kind === "bars" ? heightFor(groups.length) : 240 }}><HighchartsChart label={title} options={options} /></div>
      <PointButtons items={jiraOrderedGroups(kind, groups).map((group) => ({ key: group.key, label: `${group.label}: ${format(group.value)}`, disabled: group.recordCount === 0, onClick: () => onPick(group) }))} />
    </div>
  );
}

export function JiraStackedChart({ title, groups, keys, format, formatKey, onPick }: { title: string; groups: JiraChartGroup[]; keys: Array<{ key: string; label: string }>; format: (value: number) => string; formatKey: string; onPick: JiraChartPick }) {
  const colors = useAppChartColors();
  const key = JSON.stringify([title, groups, keys, formatKey]);
  const pick = useCurrentPick(onPick);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn anew when the data changes, compared by value
  const options = useMemo(() => jiraStackedOption({ groups, keys, title, colors, format, onPick: pick }), [colors, key, pick]);
  return (
    <div className="jira-hc" role="group" aria-label={title}>
      <div style={{ height: heightFor(groups.length, 30, 200, 560) }}><HighchartsChart label={title} options={options} /></div>
      <PointButtons
        items={groups.flatMap((group) => [
          { key: group.key, label: `${group.label}: ${format(group.value)}`, onClick: () => onPick(group) },
          ...(group.breakdown ?? []).map((cell) => ({ key: JSON.stringify([group.key, cell.key]), label: `${group.label} · ${cell.label}: ${format(cell.value)}`, disabled: cell.recordCount === 0, onClick: () => onPick(group, cell) })),
        ])}
      />
    </div>
  );
}

export function JiraFlowChart({ title, labels, series, stacked = false, format }: { title: string; labels: string[]; series: JiraFlowSeries[]; stacked?: boolean; format: (value: number) => string }) {
  const colors = useAppChartColors();
  const key = JSON.stringify([title, labels, series, stacked]);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- drawn anew when the data changes, compared by value
  const options = useMemo(() => jiraFlowOption({ title, labels, series, stacked, colors, format }), [colors, key]);
  return (
    <figure className="jira-flow-chart">
      <figcaption>{title}</figcaption>
      <div className="jira-hc" style={{ height: 230 }}><HighchartsChart label={title} options={options} /></div>
    </figure>
  );
}
