import { useMemo } from "react";
import { buildChartOption } from "../../app/pages/chartOption";
import type { ChartEngineProps } from "../../components/pages/charts/ChartView";
import { EChart } from "./EChart";

/**
 * The cloud build draws the charts of My page with ECharts (Apache-2.0): the
 * public cloud site stays clear of Highcharts, which needs a commercial
 * licence there.
 */
export function ChartEngine({ input, label, onPick }: ChartEngineProps) {
  const option = useMemo(() => buildChartOption(input), [input]);
  return <EChart label={label} onPick={onPick} option={option} />;
}
