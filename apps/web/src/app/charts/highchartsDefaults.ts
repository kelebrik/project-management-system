import Highcharts from "highcharts";

/**
 * Defaults for every Highcharts picture: the licence is bought, so no
 * "Highcharts.com" credit, even on a chart that does not say so; and a month on
 * a date axis is its short name and year, without the "г." the Russian locale
 * adds to a year ("дек. 2025", not "дек. 2025 г.").
 */
Highcharts.setOptions({
  credits: { enabled: false },
  xAxis: { dateTimeLabelFormats: { month: { main: "%b %Y" } } },
});
