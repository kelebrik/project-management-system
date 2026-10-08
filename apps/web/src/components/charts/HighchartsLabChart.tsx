import { lazy, Suspense } from "react";
import type { Options } from "highcharts";

// The chart with the lab's extra modules registered first.
const LabChart = lazy(() => import("./highchartsExtras").then(() => import("./HighchartsChartImpl")));

export function HighchartsLabChart(props: { options: Options; label: string; className?: string }) {
  return (
    <Suspense fallback={<div aria-label={props.label} className={`hc-chart hc-chart-loading ${props.className ?? ""}`} role="img" />}>
      <LabChart {...props} />
    </Suspense>
  );
}
