import assert from "node:assert/strict";
import test from "node:test";
import type { CSSProperties } from "react";
import type { MilestoneTimelineModel } from "../app/milestoneTimeline";
import { phaseAxisTitleStyle } from "./MilestoneSections";

test("phase title position scales with the responsive timeline width", () => {
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
    "calc(8px + 13.077% - 6.538px)",
  );
  assert.equal(style["--milestone-axis-title-width"], "152px");
});

test("phase title at the timeline start keeps its original inset", () => {
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
    "calc(8px + 0.000% - 0.000px)",
  );
});
