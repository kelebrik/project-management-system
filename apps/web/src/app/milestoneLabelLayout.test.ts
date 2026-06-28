import assert from "node:assert/strict";
import test from "node:test";

import {
  createMilestoneLabelLayoutOffsetKeys,
  milestoneLabelOffsetKey,
  normalizeMilestoneLabelLayoutOffsets,
} from "./milestoneLabelLayout";

test("milestone label layout restores offsets after fingerprint changes", () => {
  const offsets = normalizeMilestoneLabelLayoutOffsets(
    {
      fingerprint: "old-build-fingerprint",
      offsets: {
        [milestoneLabelOffsetKey("phase", "m1")]: { x: 12.4, y: -7.8 },
        [milestoneLabelOffsetKey("all", "m1")]: { x: -5.2, y: 9.7 },
        [milestoneLabelOffsetKey("phase", "removed")]: { x: 100, y: 100 },
      },
    },
    [
      milestoneLabelOffsetKey("phase", "m1"),
      milestoneLabelOffsetKey("all", "m1"),
    ],
  );

  assert.deepEqual(offsets, {
    [milestoneLabelOffsetKey("phase", "m1")]: { x: 12, y: -8 },
    [milestoneLabelOffsetKey("all", "m1")]: { x: -5, y: 10 },
  });
});

test("milestone label layout keys include phase, all and today labels", () => {
  const keys = createMilestoneLabelLayoutOffsetKeys({
    byPhase: {
      startDate: "2026-06-01",
      endDate: "2026-07-01",
      todayOffset: null,
      lanes: [
        {
          id: "phase-1",
          code: "1",
          title: "Phase",
          items: [
            {
              offset: 0.25,
              side: "top",
              level: 0,
              milestone: {
                id: "m1",
                code: "1.1",
                title: "Milestone",
                dueDate: "2026-06-15",
              },
            },
          ],
        },
      ],
    },
    all: {
      startDate: "2026-06-01",
      endDate: "2026-07-01",
      todayOffset: 0.5,
      lanes: [
        {
          id: "all",
          code: "",
          title: "Все вехи",
          items: [
            {
              offset: 0.25,
              side: "top",
              level: 0,
              milestone: {
                id: "m1",
                code: "1.1",
                title: "Milestone",
                dueDate: "2026-06-15",
              },
            },
          ],
        },
      ],
    },
  });

  assert.deepEqual(keys, [
    milestoneLabelOffsetKey("all", "__today__"),
    milestoneLabelOffsetKey("all", "m1"),
    milestoneLabelOffsetKey("phase", "m1"),
  ]);
});
