import { addMonths, isoDate, startOfDay, startOfMonth } from "./dateUtils";

export type MilestoneLabelScope = "phase" | "all";

export type MilestoneLabelOffset = {
  x: number;
  y: number;
};

export type MilestoneLabelOffsets = Record<string, MilestoneLabelOffset>;

const MILESTONE_LABEL_LAYOUT_VERSION = 3;

type MilestoneFingerprintModel = {
  startDate: string;
  endDate: string;
  todayOffset: number | null;
  lanes: Array<{
    id: string;
    code: string;
    title: string;
    items: Array<{
      offset: number;
      side: "top" | "bottom";
      level: number;
      milestone: {
        id: string;
        code: string;
        title: string;
        dueDate: string | null;
      };
    }>;
  }>;
};

export const zeroMilestoneLabelOffset: MilestoneLabelOffset = { x: 0, y: 0 };
export const MILESTONE_TODAY_LABEL_ID = "__today__";

export function milestoneLabelOffsetKey(
  scope: MilestoneLabelScope,
  milestoneId: string,
) {
  return `${scope}:${milestoneId}`;
}

export function normalizeMilestoneLabelOffsets(
  value: unknown,
): MilestoneLabelOffsets {
  if (!value || typeof value !== "object") return {};
  const normalized: MilestoneLabelOffsets = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, offset]) => {
    if (!offset || typeof offset !== "object") return;
    const x = Number((offset as { x?: unknown }).x);
    const y = Number((offset as { y?: unknown }).y);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      normalized[key] = { x: Math.round(x), y: Math.round(y) };
    }
  });
  return normalized;
}

export function filterMilestoneLabelOffsets(
  offsets: MilestoneLabelOffsets,
  validOffsetKeys: Iterable<string>,
) {
  const validKeys = new Set(validOffsetKeys);
  const filtered: MilestoneLabelOffsets = {};
  Object.entries(offsets).forEach(([key, offset]) => {
    if (validKeys.has(key)) {
      filtered[key] = offset;
    }
  });
  return filtered;
}

function roundFingerprintNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 10000) / 10000
    : null;
}

function monthFingerprintKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}`;
}

function monthFingerprintRange(startIso: string, endIso: string) {
  const start = startOfMonth(startOfDay(new Date(startIso)));
  const end = startOfMonth(startOfDay(new Date(endIso)));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const months: string[] = [];
  let cursor = start;
  while (cursor <= end && months.length < 240) {
    months.push(monthFingerprintKey(cursor));
    cursor = addMonths(cursor, 1);
  }
  return months;
}

function createMilestoneTimelineFingerprint(model: MilestoneFingerprintModel) {
  return {
    startDate: isoDate(startOfDay(new Date(model.startDate))),
    endDate: isoDate(startOfDay(new Date(model.endDate))),
    months: monthFingerprintRange(model.startDate, model.endDate),
    todayOffset: roundFingerprintNumber(model.todayOffset),
    lanes: model.lanes.map((lane) => ({
      id: lane.id,
      code: lane.code,
      title: lane.title,
      items: lane.items.map((item) => ({
        id: item.milestone.id,
        code: item.milestone.code,
        title: item.milestone.title,
        dueDate: item.milestone.dueDate
          ? isoDate(startOfDay(new Date(item.milestone.dueDate)))
          : null,
        offset: roundFingerprintNumber(item.offset),
        side: item.side,
        level: item.level,
      })),
    })),
  };
}

export function createMilestoneLabelLayoutFingerprint(timeline: {
  byPhase: MilestoneFingerprintModel;
  all: MilestoneFingerprintModel;
}) {
  return JSON.stringify({
    version: MILESTONE_LABEL_LAYOUT_VERSION,
    byPhase: createMilestoneTimelineFingerprint(timeline.byPhase),
    all: createMilestoneTimelineFingerprint(timeline.all),
  });
}

export function createMilestoneLabelLayoutOffsetKeys(timeline: {
  byPhase: MilestoneFingerprintModel;
  all: MilestoneFingerprintModel;
}) {
  const keys = new Set<string>();

  timeline.byPhase.lanes.forEach((lane) => {
    lane.items.forEach((item) => {
      keys.add(milestoneLabelOffsetKey("phase", item.milestone.id));
    });
  });

  timeline.all.lanes.forEach((lane) => {
    lane.items.forEach((item) => {
      keys.add(milestoneLabelOffsetKey("all", item.milestone.id));
    });
  });

  if (timeline.all.todayOffset !== null) {
    keys.add(milestoneLabelOffsetKey("all", MILESTONE_TODAY_LABEL_ID));
  }

  return [...keys].sort();
}

export function normalizeMilestoneLabelLayoutOffsets(
  value: unknown,
  validOffsetKeys?: Iterable<string>,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const layout = value as { offsets?: unknown };
  const rawOffsets = Object.prototype.hasOwnProperty.call(layout, "offsets")
    ? layout.offsets
    : value;
  const offsets = normalizeMilestoneLabelOffsets(rawOffsets);
  return validOffsetKeys
    ? filterMilestoneLabelOffsets(offsets, validOffsetKeys)
    : offsets;
}
