import { useEffect, useRef } from "react";
import Highcharts, { type Chart, type Options } from "highcharts";
import "highcharts/modules/xrange";
import "highcharts/modules/accessibility";

/** A five-pointed star for goals on the Gantt, drawn like Highcharts' own symbols. */
type SymbolFn = (x: number, y: number, w: number, h: number) => Array<string | number>;
const symbols = (Highcharts as unknown as { SVGRenderer: { prototype: { symbols: Record<string, SymbolFn> } } }).SVGRenderer.prototype.symbols;
if (!symbols.star) {
  symbols.star = (x, y, w, h) => {
    const cx = x + w / 2;
    const cy = y + h / 2;
    const path: Array<string | number> = [];
    for (let index = 0; index < 10; index += 1) {
      const radius = index % 2 === 0 ? w / 2 : w / 5;
      const angle = (Math.PI / 5) * index - Math.PI / 2;
      path.push(index === 0 ? "M" : "L", cx + radius * Math.cos(angle), cy + radius * Math.sin(angle) * (h / w));
    }
    path.push("Z");
    return path;
  };
}

/**
 * One Highcharts picture that follows its box: drawn as SVG, drawn anew when
 * the options change (an update would merge them and keep settings of the
 * previous look), resized with its box, destroyed when it goes away. The
 * "Highcharts.com" credit stays while the library is used under its free
 * evaluation terms, until a commercial licence is bought.
 *
 * `inPlace` updates the drawn chart instead, for a picture whose options keep
 * one shape and only change their data (the Gantt as it scrolls): every new
 * chart puts a <style> of its palette into the page, which makes the browser
 * restyle the whole page — on a Gantt of thousands of rows, a visible stall.
 * Its series must keep their number and order; their data is replaced whole.
 */
export default function HighchartsChartImpl({ options, label, className = "", inPlace = false }: { options: Options; label: string; className?: string; inPlace?: boolean }) {
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
    const current = chart.current;
    const series = options.series ?? [];
    if (inPlace && current && current.series.length === series.length) {
      // The data of each series is replaced whole: merged, Highcharts matches new points to old ones
      // assuming they are sorted by x, and on a Gantt (sorted by rows) points were lost or doubled.
      current.update({ ...options, series: series.map((item) => ({ ...item, data: undefined })) } as Options, false, true, false);
      series.forEach((item, index) => current.series[index]?.setData(("data" in item ? item.data : undefined) ?? [], false, false, false));
      current.redraw(false);
      return;
    }
    chart.current?.destroy();
    chart.current = Highcharts.chart(element, options);
  }, [inPlace, options]);

  return <div aria-label={label} className={`hc-chart ${className}`} ref={box} role="img" />;
}
