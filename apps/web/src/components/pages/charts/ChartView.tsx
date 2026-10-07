import { useMemo } from "react";
import type { ChartInput } from "../../../app/pages/chartOption";
import { buildHighchartsOption } from "../../../app/pages/highchartsOption";
import { HighchartsChart } from "../../charts/HighchartsChart";

export type ChartEngineProps = { input: ChartInput; label: string; onPick?: (index: number) => void };

/** A chart widget's picture, drawn with Highcharts. */
export function ChartView({ input, label, onPick }: ChartEngineProps) {
  const options = useMemo(() => buildHighchartsOption({ ...input, onPick }), [input, onPick]);
  return <HighchartsChart className={`mp-echart ${onPick ? "mp-echart-drill" : ""}`} label={label} options={options} />;
}
