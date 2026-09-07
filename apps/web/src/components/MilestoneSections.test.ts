import assert from "node:assert/strict";
import test from "node:test";
import type { CSSProperties } from "react";
import type { MilestoneTimelineModel } from "../app/milestoneTimeline";
import { phaseAxisTitleStyle } from "./MilestoneSections";

test("phase title uses the marker-free position closest to the timeline center", () => {
  const lane = {
    id: "phase-4",
    code: "4",
    title: "Новый пульт",
    items: [{ offset: 0.1 }, { offset: 0.55 }],
  } as MilestoneTimelineModel["lanes"][number];

  const style = phaseAxisTitleStyle(lane, 960) as CSSProperties &
    Record<`--${string}`, string>;

  assert.equal(
    style["--milestone-axis-title-left"],
    "calc(8px + 43.571% - 21.786px - 76.000px)",
  );
  assert.equal(style["--milestone-axis-title-width"], "152px");
});

test("phase title stays centered as far as its milestone marker allows", () => {
  const lane = {
    id: "phase-3",
    code: "3",
    title: "Ambient",
    items: [{ offset: 0.55 }],
  } as MilestoneTimelineModel["lanes"][number];

  const style = phaseAxisTitleStyle(lane, 960) as CSSProperties &
    Record<`--${string}`, string>;

  assert.equal(
    style["--milestone-axis-title-left"],
    "calc(8px + 45.330% - 22.665px - 60.000px)",
  );
  assert.equal(style["--milestone-axis-title-width"], "120px");
});
