import { useMemo } from "react";
import { buildHighchartsOption } from "../../../app/pages/highchartsOption";
import type { ChartEngineProps } from "./ChartView";
import { HighchartsChart } from "./HighchartsChart";

/** Charts of My page drawn with Highcharts: loaded only by a build that draws with it. */
export default function HighchartsEngine({ input, label, onPick }: ChartEngineProps) {
  const options = useMemo(() => buildHighchartsOption({ ...input, onPick }), [input, onPick]);
  return <HighchartsChart label={label} options={options} />;
}
