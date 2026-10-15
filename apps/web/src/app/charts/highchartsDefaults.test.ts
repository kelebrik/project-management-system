import assert from "node:assert/strict";
import test from "node:test";
import Highcharts from "highcharts";
import "./highchartsDefaults";

test("no Highcharts.com credit on any chart, even one that does not say so", () => {
  assert.equal(Highcharts.getOptions().credits?.enabled, false);
});

test("a month on a date axis has no \"г.\" after its year in Russian", () => {
  const month = (Highcharts.getOptions().xAxis as { dateTimeLabelFormats?: { month?: { main?: string } } } | undefined)?.dateTimeLabelFormats?.month?.main;
  assert.equal(month, "%b %Y");
  const previous = Highcharts.getOptions().lang?.locale;
  Highcharts.setOptions({ lang: { locale: "ru-RU" } });
  try {
    assert.equal(Highcharts.dateFormat(month!, Date.UTC(2025, 11, 1)), "дек. 2025");
  } finally {
    Highcharts.setOptions({ lang: { locale: previous } });
  }
});
