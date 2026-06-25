import assert from "node:assert/strict";
import test from "node:test";

import { ganttDependencyPath } from "./ganttDependencyPath";

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
