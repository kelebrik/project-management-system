import assert from "node:assert/strict";
import test from "node:test";

import { ROADMAP_MARKER_HALF, addMonths, layoutRoadmapLane, roadmapMonths, roadmapPosition, roadmapWindow, shortenText, type RoadmapMark } from "./roadmapLayout";

// Six pixels a letter, like 11 px text.
const measure = (text: string) => text.length * 6;

test("the window counts calendar months from today, clamping to the month's end", () => {
  assert.deepEqual(roadmapWindow("2026-10-07", 4, 8), { from: "2026-06-07", to: "2027-06-07" });
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(addMonths("2028-03-31", -1), "2028-02-29");
  assert.deepEqual(roadmapMonths({ from: "2026-06-07", to: "2026-09-01" }), ["2026-07-01", "2026-08-01", "2026-09-01"]);
  assert.equal(roadmapPosition("2026-10-07", { from: "2026-08-07", to: "2026-12-07" }), 61 / 122);
});

test("a label goes next to its marker, then to the other side, then above and below", () => {
  const bounds = { left: 0, right: 600 };
  const one = layoutRoadmapLane([{ id: "a", x: 100, label: "Beta" }], bounds, measure);
  assert.deepEqual(one.labels.map((label) => [label.tier, label.side, label.x]), [[0, "right", 100 + ROADMAP_MARKER_HALF + 3]]);
  // A marker near the right end: the label goes to the left.
  const end = layoutRoadmapLane([{ id: "a", x: 590, label: "Release" }], bounds, measure);
  assert.deepEqual(end.labels.map((label) => [label.tier, label.side]), [[0, "left"]]);
  // Two close markers with long names: the second goes above, the third below.
  const crowd = layoutRoadmapLane(
    [
      { id: "a", x: 100, label: "Production samples ready" },
      { id: "b", x: 130, label: "Certification passed" },
      { id: "c", x: 160, label: "Factory acceptance" },
    ],
    bounds,
    measure,
  );
  assert.deepEqual(crowd.labels.map((label) => label.tier).sort(), [-1, 0, 1]);
  assert.equal(crowd.hidden.length, 0);
  assert.equal(crowd.above && crowd.below, true);
});

test("when a label fits nowhere whole it is shortened, and when not even that, counted", () => {
  const bounds = { left: 0, right: 200 };
  const marks: RoadmapMark[] = Array.from({ length: 8 }, (_, index) => ({ id: `m${index}`, x: 20 + index * 22, label: `A very long goal name number ${index}` }));
  const layout = layoutRoadmapLane(marks, bounds, measure);
  assert.ok(layout.labels.some((label) => label.short && label.text.endsWith("…")));
  assert.ok(layout.hidden.length > 0);
  assert.equal(layout.labels.length + layout.hidden.length, marks.length);
  assert.equal(shortenText("Certification", 40, measure), "Certi…");
  assert.equal(shortenText("Certification", 5, measure), null);
});

test("no two labels of a row and no label and marker ever overlap, however crowded", () => {
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let round = 0; round < 300; round += 1) {
    const width = 200 + Math.floor(random() * 900);
    const count = 1 + Math.floor(random() * 14);
    const marks: RoadmapMark[] = Array.from({ length: count }, (_, index) => {
      const x = Math.floor(random() * width);
      // Same days happen: a third of the marks share a neighbour's place.
      return { id: `m${index}`, x: index > 0 && random() < 0.3 ? Math.floor(width / 2) : x, label: "Goal ".repeat(1 + Math.floor(random() * 6)).trim(), obstacles: random() < 0.3 ? [[x - 20, x - 12]] : undefined };
    });
    const layout = layoutRoadmapLane(marks, { left: 0, right: width }, measure);
    assert.equal(layout.labels.length + layout.hidden.length, count);
    for (const label of layout.labels) {
      assert.ok(label.x >= 0 && label.x + label.width <= width, "inside the lane");
      assert.ok(label.width >= measure(label.text) - 0.001, "as wide as its text");
      for (const other of layout.labels) {
        if (other === label || other.tier !== label.tier) continue;
        assert.ok(label.x + label.width <= other.x || other.x + other.width <= label.x, `labels ${label.id} and ${other.id} overlap`);
      }
      if (label.tier !== 0) continue;
      for (const mark of marks) {
        const shapes = [[mark.x - ROADMAP_MARKER_HALF, mark.x + ROADMAP_MARKER_HALF], ...(mark.obstacles ?? [])];
        for (const [from, to] of shapes) assert.ok(label.x + label.width <= from || to <= label.x, `label ${label.id} covers marker ${mark.id}`);
      }
    }
  }
});

test("a lane of thousands of goals is laid out in a moment", () => {
  const marks: RoadmapMark[] = Array.from({ length: 5_000 }, (_, index) => ({ id: `m${index}`, x: (index * 7919) % 1200, label: `Goal number ${index}` }));
  const began = performance.now();
  const layout = layoutRoadmapLane(marks, { left: 0, right: 1200 }, measure);
  // The first, quadratic version took about 14 s here.
  assert.ok(performance.now() - began < 3000, `took ${Math.round(performance.now() - began)} ms`);
  assert.equal(layout.labels.length + layout.hidden.length, marks.length);
  // All on one day with the same plan: one marker and one ring to keep clear of.
  const same: RoadmapMark[] = Array.from({ length: 5_000 }, (_, index) => ({ id: `s${index}`, x: 600, label: `Goal ${index}`, obstacles: [[626, 634]] }));
  const again = performance.now();
  layoutRoadmapLane(same, { left: 0, right: 1200 }, measure);
  assert.ok(performance.now() - again < 3000, `took ${Math.round(performance.now() - again)} ms`);
});
