import { lazy, Suspense } from "react";
import type { Options } from "highcharts";

// Highcharts is loaded only when a chart is on screen, not with the application.
const HighchartsChartImpl = lazy(() => import("./HighchartsChartImpl"));

export function HighchartsChart(props: { options: Options; label: string; className?: string; inPlace?: boolean }) {
  return (
    <Suspense fallback={<div aria-label={props.label} className={`hc-chart hc-chart-loading ${props.className ?? ""}`} role="img" />}>
      <HighchartsChartImpl {...props} />
    </Suspense>
  );
}
