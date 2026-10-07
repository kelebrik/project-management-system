import { lazy, Suspense, type ComponentType } from "react";
import type { ChartInput } from "../../../app/pages/chartOption";

export type ChartEngineProps = { input: ChartInput; label: string; onPick?: (index: number) => void };

// The cloud build draws charts with its own engine (src/cloudOnly/charts); the
// corporate build does not ship that folder and draws them with Highcharts,
// which is loaded only there.
const cloudEngine = Object.values(
  import.meta.glob<{ ChartEngine?: ComponentType<ChartEngineProps> }>("../../../cloudOnly/*/slot.tsx", { eager: true }),
).find((module) => module.ChartEngine)?.ChartEngine;

const HighchartsEngine = lazy(() => import("./HighchartsEngine"));

/** A chart widget's picture, by whichever engine this build draws with. */
export function ChartView(props: ChartEngineProps) {
  if (cloudEngine) {
    const Engine = cloudEngine;
    return <Engine {...props} />;
  }
  return (
    <Suspense fallback={<div className="mp-skeleton" />}>
      <HighchartsEngine {...props} />
    </Suspense>
  );
}
