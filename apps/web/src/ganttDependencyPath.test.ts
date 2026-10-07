import assert from "node:assert/strict";
import test from "node:test";

import { ganttConnectorArrow, ganttConnectorPoints, ganttDependencyPath } from "./ganttDependencyPath";

test("gantt dependency path avoids wide loops for overlapping finish-start links", () => {
  const path = ganttDependencyPath({
    fromSide: "end",
    fromX: 60,
    fromY: 54,
    toSide: "start",
    toX: 45,
    toY: 90,
  });

  const xCoordinates = [...path.matchAll(/[MLQ] ([\d.]+)/g)].map((match) =>
    Number(match[1]),
  );

  assert.match(path, /^M 60 54 /);
  assert.ok(Math.max(...xCoordinates) <= 61.15);
  assert.ok(!path.includes("L 62.6 54"));
  assert.ok(!path.includes("L 62.6 72"));
});

// 1000 px wide timeline: 0.1 % per pixel.
const connector = { fromRowY: 12, fromTop: -8, fromBottom: 8, percentPerPx: 0.1 };

test("a link leaves the middle of the predecessor from below and runs along the successor's row into it", () => {
  assert.deepEqual(ganttConnectorPoints({ ...connector, fromCenterX: 20, toSide: "start", toX: 40, toY: 60 }), [
    { x: 20, y: 20 },
    { x: 20, y: 60 },
    { x: 40, y: 60 },
  ]);
  // From a phase, whose line lies below the centre, it leaves the line itself.
  assert.deepEqual(ganttConnectorPoints({ ...connector, fromTop: 4.5, fromBottom: 8.5, fromRowY: 60, fromCenterX: 20, toSide: "start", toX: 40, toY: 12 })?.[0], { x: 20, y: 64.5 });
  // A successor above: the link leaves from the top.
  assert.deepEqual(ganttConnectorPoints({ ...connector, fromRowY: 60, fromCenterX: 20, toSide: "start", toX: 40, toY: 12 })?.[0], { x: 20, y: 52 });
});

test("a successor beginning before the middle is reached along the border of the rows, from its side", () => {
  assert.deepEqual(ganttConnectorPoints({ ...connector, fromCenterX: 20, toSide: "start", toX: 20.5, toY: 60 }), [
    { x: 20, y: 20 },
    { x: 20, y: 48 },
    { x: 19.5, y: 48 },
    { x: 19.5, y: 60 },
    { x: 20.5, y: 60 },
  ]);
  // Into the end of a successor (finish-finish), from the right.
  assert.deepEqual(ganttConnectorPoints({ ...connector, fromCenterX: 20, toSide: "end", toX: 30, toY: 36 })?.slice(-2), [
    { x: 31, y: 36 },
    { x: 30, y: 36 },
  ]);
  // Within one row the side-to-side route stays.
  assert.equal(ganttConnectorPoints({ ...connector, fromCenterX: 20, toSide: "start", toX: 40, toY: 14 }), null);
});

test("the arrowhead is open, its tip at the end of the link, 6 px long whatever the width", () => {
  assert.equal(ganttConnectorArrow(40, 60, "start", 0.1), "M 39.4 56 L 40 60 L 39.4 64");
  assert.equal(ganttConnectorArrow(40, 60, "end", 0.1), "M 40.6 56 L 40 60 L 40.6 64");
});
