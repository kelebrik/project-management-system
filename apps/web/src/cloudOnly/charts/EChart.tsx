import { useEffect, useRef } from "react";
import { echarts } from "./echartsSetup";

/**
 * One ECharts picture that follows its box: drawn as SVG, redrawn when the
 * option changes, resized with the widget, released when it goes away.
 */
export function EChart({ option, label, onPick }: { option: Record<string, unknown>; label: string; onPick?: (index: number) => void }) {
  const box = useRef<HTMLDivElement | null>(null);
  const chart = useRef<ReturnType<typeof echarts.init> | null>(null);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const instance = echarts.init(element, undefined, { renderer: "svg" });
    chart.current = instance;
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(element);
    return () => {
      observer.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useEffect(() => {
    const instance = chart.current;
    if (!instance || !onPick) return;
    const handler = (params: { dataIndex?: number }) => {
      if (typeof params.dataIndex === "number") onPick(params.dataIndex);
    };
    instance.on("click", handler);
    return () => {
      instance.off("click", handler);
    };
  }, [onPick]);

  return <div aria-label={label} className={`mp-echart ${onPick ? "mp-echart-drill" : ""}`} ref={box} role="img" />;
}
