import { BarChart, LineChart, PieChart } from "echarts/charts";
import { AriaComponent, DatasetComponent, GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { SVGRenderer } from "echarts/renderers";

/**
 * Only the parts of ECharts the pages draw, with the SVG renderer: crisp in
 * print and in a PDF, and a fraction of the full library in the page's chunk.
 */
echarts.use([BarChart, LineChart, PieChart, GridComponent, TooltipComponent, LegendComponent, DatasetComponent, AriaComponent, SVGRenderer]);

export { echarts };
