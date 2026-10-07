import { useEffect, useRef } from "react";
import Highcharts, { type Chart, type Options } from "highcharts";
import "highcharts/modules/accessibility";

/**
 * One Highcharts picture that follows its box: drawn as SVG, drawn anew when
 * the options change, resized with the widget, destroyed when it goes away.
 * The "Highcharts.com" credit stays: the library is used under its free
 * evaluation terms until a commercial licence is bought.
 */
export function HighchartsChart({ options, label }: { options: Options; label: string }) {
  const box = useRef<HTMLDivElement | null>(null);
  const chart = useRef<Chart | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(() => chart.current?.reflow());
    observer.observe(element);
    return () => {
      observer.disconnect();
      chart.current?.destroy();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    // Drawn anew for new options: an update would merge them and keep settings of the previous look (stacking, labels).
    chart.current?.destroy();
    chart.current = Highcharts.chart(element, options);
  }, [options]);

  return <div aria-label={label} className="mp-echart mp-hchart" ref={box} role="img" />;
}
