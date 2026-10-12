import assert from "node:assert/strict";
import test from "node:test";
import Highcharts from "highcharts";
import "./highchartsDefaults";

test("no Highcharts.com credit on any chart, even one that does not say so", () => {
  assert.equal(Highcharts.getOptions().credits?.enabled, false);
});
