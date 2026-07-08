import type { WbsItem } from "./domainTypes";
import { startOfDay } from "./dateUtils";
import {
  MILESTONE_SNAKE_HEIGHT,
  MILESTONE_SNAKE_WIDTH,
  sampleMilestoneSnakePath,
} from "../milestoneSnakePath";

export type MilestoneTone = "green" | "blue" | "red" | "gray";

export type MilestoneState = {
  label: string;
  tone: MilestoneTone;
};

export type StructureMilestone = {
  milestone: WbsItem;
  calendarDaysLeft: number | null;
  workDaysLeft: number | null;
  state: MilestoneState;
};

export type MilestoneTimelineItem = StructureMilestone & {
  offset: number;
  side: "top" | "bottom";
  level: number;
  labelShiftPx: number;
};

export type MilestoneTimelineLane = {
  id: string;
  code: string;
  title: string;
  items: MilestoneTimelineItem[];
};

export type MilestoneTimelineModel = {
  lanes: MilestoneTimelineLane[];
  startDate: string;
  endDate: string;
  todayDate: string;
  trackWidth: number;
  laneHeight: number;
  todayOffset: number | null;
  hasMilestonesOutsideRange: boolean;
  hiddenStaleLaneCount?: number;
};

export type MilestoneSnakePoint = {
  x: number;
  y: number;
  tangentX: number;
  tangentY: number;
};

export type MilestoneSnakeLabel = {
  boxX: number;
  boxY: number;
  boxWidth: number;
  boxHeight: number;
  connectorX: number;
  connectorY: number;
  dateY: number;
};

export type MilestoneSnakeLayout = {
  entry: MilestoneTimelineItem;
  point: MilestoneSnakePoint;
  label: MilestoneSnakeLabel;
  lines: string[];
};

export type MilestoneSnakePointLayout = {
  entry: MilestoneTimelineItem;
  point: MilestoneSnakePoint;
};

export type SvgTextAnchor = "start" | "middle" | "end";
export type MilestoneTimelineTodayOffsetMode = "calendar" | "milestone-count";

export function milestoneStateLabel(
  milestone: WbsItem,
  precedingTasks: WbsItem[],
): MilestoneState {
  const today = startOfDay(new Date());
  if (milestone.status === "DONE") {
    return { label: "Веха пройдена", tone: "green" };
  }
  if (
    milestone.dueDate &&
    startOfDay(new Date(milestone.dueDate)) < today
  ) {
    return { label: "Веха просрочена", tone: "red" };
  }

  const lastTasks = precedingTasks
    .filter((item) => item.status !== "CANCELLED")
    .slice(-5);
  if (
    lastTasks.length > 0 &&
    lastTasks.every((item) => item.status === "NOT_STARTED")
  ) {
    return { label: "Последние задачи не начаты", tone: "gray" };
  }
  if (
    lastTasks.some(
      (item) => item.status === "IN_PROGRESS" || item.status === "IN_REVIEW",
    )
  ) {
    return { label: "Последние задачи в работе", tone: "blue" };
  }
  return { label: "Веха запланирована", tone: "gray" };
}

export function splitPhaseTitle(value: string) {
  return value
    .trim()
    .split(/\s+/)
    .reduce<string[]>((lines, word) => {
      const current = lines[lines.length - 1] ?? "";
      if (!current) return [word];
      if (`${current} ${word}`.length <= 12) {
        return [...lines.slice(0, -1), `${current} ${word}`];
      }
      return [...lines, word];
    }, [])
    .slice(0, 4);
}

export function wrapText(value: string, maxLineLength: number, maxLines: number) {
  const words = value
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((word) => {
      if (word.length <= maxLineLength) return [word];
      const chunks: string[] = [];
      let cursor = word;
      while (cursor.length > maxLineLength) {
        chunks.push(`${cursor.slice(0, Math.max(1, maxLineLength - 1))}-`);
        cursor = cursor.slice(Math.max(1, maxLineLength - 1));
      }
      if (cursor) chunks.push(cursor);
      return chunks;
    });
  const lines: string[] = [];
  words.forEach((word) => {
    const current = lines[lines.length - 1] ?? "";
    if (!current) {
      lines.push(word);
      return;
    }
    if (`${current} ${word}`.length <= maxLineLength) {
      lines[lines.length - 1] = `${current} ${word}`;
      return;
    }
    if (lines.length < maxLines) {
      lines.push(word);
      return;
    }
    const lastLine = lines[lines.length - 1] ?? "";
    lines[lines.length - 1] =
      lastLine.length > 0 ? `${lastLine.slice(0, Math.max(0, maxLineLength - 1))}…` : "…";
  });
  return lines.length > 0 ? lines : [value];
}

export const MILESTONE_SNAKE_PATH_POINTS = sampleMilestoneSnakePath();
export const MILESTONE_SNAKE_TOTAL_LENGTH =
  MILESTONE_SNAKE_PATH_POINTS[MILESTONE_SNAKE_PATH_POINTS.length - 1]
    ?.distance ?? 1;
export const MILESTONE_SNAKE_PATH_D = MILESTONE_SNAKE_PATH_POINTS.map((point, index) =>
  `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
).join(" ");
export const MILESTONE_SNAKE_START_PROGRESS = 0.018;
export const MILESTONE_SNAKE_END_PROGRESS = 0.948;

export function mapSnakeTimelineOffset(offset: number) {
  const boundedOffset = Math.max(0, Math.min(1, offset));
  const usableRange =
    MILESTONE_SNAKE_END_PROGRESS - MILESTONE_SNAKE_START_PROGRESS;
  return MILESTONE_SNAKE_START_PROGRESS + boundedOffset * usableRange;
}

export function interpolateSnakePoint(progress: number): MilestoneSnakePoint {
  const bounded = Math.max(0, Math.min(1, progress));
  const targetDistance = bounded * MILESTONE_SNAKE_TOTAL_LENGTH;
  const targetIndex = MILESTONE_SNAKE_PATH_POINTS.findIndex(
    (point) => point.distance >= targetDistance,
  );
  const nextIndex =
    targetIndex === -1 ? MILESTONE_SNAKE_PATH_POINTS.length - 1 : targetIndex;
  const previousIndex = Math.max(0, nextIndex - 1);
  const previous = MILESTONE_SNAKE_PATH_POINTS[previousIndex];
  const next = MILESTONE_SNAKE_PATH_POINTS[nextIndex];
  const localRange = Math.max(1, next.distance - previous.distance);
  const localProgress = (targetDistance - previous.distance) / localRange;
  const x = previous.x + (next.x - previous.x) * localProgress;
  const y = previous.y + (next.y - previous.y) * localProgress;
  const tangentLength = Math.max(1, Math.hypot(next.x - previous.x, next.y - previous.y));
  return {
    x,
    y,
    tangentX: (next.x - previous.x) / tangentLength,
    tangentY: (next.y - previous.y) / tangentLength,
  };
}

export function rectOverlap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const x = Math.max(
    0,
    Math.min(left.x + left.width, right.x + right.width) -
      Math.max(left.x, right.x),
  );
  const y = Math.max(
    0,
    Math.min(left.y + left.height, right.y + right.height) -
      Math.max(left.y, right.y),
  );
  return x * y;
}

export function rectGap(
  left: { x: number; y: number; width: number; height: number },
  right: { x: number; y: number; width: number; height: number },
) {
  const dx = Math.max(
    right.x - (left.x + left.width),
    left.x - (right.x + right.width),
    0,
  );
  const dy = Math.max(
    right.y - (left.y + left.height),
    left.y - (right.y + right.height),
    0,
  );
  return Math.hypot(dx, dy);
}

export function snakeConnectorPoint(
  point: MilestoneSnakePoint,
  boxX: number,
  boxY: number,
  boxWidth: number,
  boxHeight: number,
) {
  const nearestX = Math.max(boxX, Math.min(boxX + boxWidth, point.x));
  const nearestY = Math.max(boxY, Math.min(boxY + boxHeight, point.y));
  const distances = [
    { x: boxX, y: nearestY, value: Math.abs(point.x - boxX) },
    {
      x: boxX + boxWidth,
      y: nearestY,
      value: Math.abs(point.x - (boxX + boxWidth)),
    },
    { x: nearestX, y: boxY, value: Math.abs(point.y - boxY) },
    {
      x: nearestX,
      y: boxY + boxHeight,
      value: Math.abs(point.y - (boxY + boxHeight)),
    },
  ];
  return distances.sort((left, right) => left.value - right.value)[0];
}

export function snakeLabelCandidates(point: MilestoneSnakePoint, title: string) {
  const gripReservedWidth = 34;
  const compactTitle = title.length > 34;
  const sizes = compactTitle
    ? [
        { width: 126, maxLines: 4, preference: 8 },
        { width: 154, maxLines: 3, preference: 4 },
        { width: 190, maxLines: 2, preference: 0 },
      ]
    : [
        { width: 112, maxLines: 3, preference: 8 },
        { width: 136, maxLines: 2, preference: 4 },
        { width: 168, maxLines: 2, preference: 0 },
      ];
  const distances = [48, 84, 124, 170, 226, 288];
  const angles = [-165, -135, -105, -75, -45, -15, 15, 45, 75, 105, 135, 165, 0, 180];

  return sizes.flatMap((size) => {
    const maxLineLength = Math.max(
      7,
      Math.floor((size.width - gripReservedWidth) / 7.4),
    );
    const lines = wrapText(title, maxLineLength, size.maxLines);
    const boxHeight = 32 + lines.length * 13;
    const makeCandidate = (
      unclampedX: number,
      unclampedY: number,
      preference: number,
    ) => {
      const boxX = Math.max(
        14,
        Math.min(MILESTONE_SNAKE_WIDTH - size.width - 14, unclampedX),
      );
      const boxY = Math.max(
        14,
        Math.min(MILESTONE_SNAKE_HEIGHT - boxHeight - 14, unclampedY),
      );
      const connector = snakeConnectorPoint(
        point,
        boxX,
        boxY,
        size.width,
        boxHeight,
      );
      return {
        label: {
          boxX,
          boxY,
          boxWidth: size.width,
          boxHeight,
          connectorX: connector.x,
          connectorY: connector.y,
          dateY: boxY + boxHeight - 10,
        },
        lines,
        clampPenalty:
          Math.abs(boxX - unclampedX) * 8 + Math.abs(boxY - unclampedY) * 8,
        preference: preference + size.preference,
      };
    };

    const radialCandidates = distances.flatMap((distance, distanceIndex) =>
      angles.map((angle, angleIndex) => {
        const radians = (angle * Math.PI) / 180;
        const cos = Math.cos(radians);
        const sin = Math.sin(radians);
        let unclampedX = point.x + cos * distance - size.width / 2;
        let unclampedY = point.y + sin * distance - boxHeight / 2;

        if (Math.abs(cos) > 0.72) {
          unclampedX =
            cos > 0
              ? point.x + distance
              : point.x - distance - size.width;
        }
        if (Math.abs(sin) > 0.72) {
          unclampedY =
            sin > 0
              ? point.y + distance
              : point.y - distance - boxHeight;
        }

        return makeCandidate(
          unclampedX,
          unclampedY,
          distanceIndex * 8 + angleIndex * 0.2,
        );
      }),
    );

    const gridColumns = 6;
    const gridRows = 7;
    const gridCandidates = Array.from({ length: gridColumns * gridRows }, (_, cell) => {
      const column = cell % gridColumns;
      const row = Math.floor(cell / gridColumns);
      const x =
        18 +
        ((MILESTONE_SNAKE_WIDTH - size.width - 36) * column) /
          Math.max(1, gridColumns - 1);
      const y =
        18 +
        ((MILESTONE_SNAKE_HEIGHT - boxHeight - 36) * row) /
          Math.max(1, gridRows - 1);
      const centerX = x + size.width / 2;
      const centerY = y + boxHeight / 2;
      const distancePenalty = Math.hypot(centerX - point.x, centerY - point.y) * 0.12;
      return makeCandidate(x, y, 56 + distancePenalty);
    });

    return [...radialCandidates, ...gridCandidates];
  });
}

export function snakeLabelNormalPosition(
  point: MilestoneSnakePoint,
  distance: number,
  along = 0,
) {
  const normalX = -point.tangentY;
  const normalY = point.tangentX;
  const preferBelow = point.tangentY < 0;
  const direction = preferBelow ? 1 : -1;
  return {
    x: point.x + normalX * distance * direction + point.tangentX * along,
    y: point.y + normalY * distance * direction + point.tangentY * along,
  };
}

export function snakeMonthLabelPosition(point: MilestoneSnakePoint) {
  const labelWidth = 92;
  const distance = 48;
  const candidates = [1, -1].map((direction) => {
    const normalX = -point.tangentY * direction;
    const normalY = point.tangentX * direction;
    const x = point.x + normalX * distance;
    const y = point.y + normalY * distance + 4;
    const anchor: SvgTextAnchor =
      Math.abs(normalX) < 0.24
        ? "middle"
        : normalX > 0
          ? "start"
          : "end";
    const left =
      anchor === "middle"
        ? x - labelWidth / 2
        : anchor === "end"
          ? x - labelWidth
          : x;
    const right =
      anchor === "middle"
        ? x + labelWidth / 2
        : anchor === "end"
          ? x
          : x + labelWidth;
    const top = y - 14;
    const bottom = y + 4;
    const overflow =
      Math.max(0, 18 - left) +
      Math.max(0, right - (MILESTONE_SNAKE_WIDTH - 18)) +
      Math.max(0, 18 - top) +
      Math.max(0, bottom - (MILESTONE_SNAKE_HEIGHT - 18));
    const preferred = snakeLabelNormalPosition(point, distance);
    const preference = Math.hypot(x - preferred.x, y - preferred.y) * 0.2;
    return { x, y, anchor, score: overflow * 120 + preference };
  });
  return candidates.sort((left, right) => left.score - right.score)[0];
}

export function snakeAxisPenalty(label: MilestoneSnakeLabel, point: MilestoneSnakePoint) {
  const expanded = {
    x: label.boxX - 8,
    y: label.boxY - 8,
    width: label.boxWidth + 16,
    height: label.boxHeight + 16,
  };
  const pointInside =
    point.x >= expanded.x &&
    point.x <= expanded.x + expanded.width &&
    point.y >= expanded.y &&
    point.y <= expanded.y + expanded.height;
  let penalty = pointInside ? 5000 : 0;

  for (let index = 0; index < MILESTONE_SNAKE_PATH_POINTS.length; index += 18) {
    const axisPoint = MILESTONE_SNAKE_PATH_POINTS[index];
    if (
      axisPoint.x >= expanded.x &&
      axisPoint.x <= expanded.x + expanded.width &&
      axisPoint.y >= expanded.y &&
      axisPoint.y <= expanded.y + expanded.height
    ) {
      penalty += 120;
    }
  }

  return penalty;
}

export function buildSnakeMilestoneLayouts(
  milestones: MilestoneTimelineItem[],
): MilestoneSnakeLayout[] {
  const entries = milestones.map((entry, originalIndex) => {
    const progress = mapSnakeTimelineOffset(entry.offset);
    return {
      entry,
      originalIndex,
      point: interpolateSnakePoint(progress),
    };
  });
  const markerRects = entries.map(({ point }) => ({
    x: point.x - 14,
    y: point.y - 14,
    width: 28,
    height: 28,
  }));
  const orderedEntries = entries
    .map((entry) => {
      const nearest = entries.reduce((best, other) => {
        if (other.originalIndex === entry.originalIndex) return best;
        return Math.min(
          best,
          Math.hypot(other.point.x - entry.point.x, other.point.y - entry.point.y),
        );
      }, Number.POSITIVE_INFINITY);
      return { ...entry, nearest };
    })
    .sort((left, right) => left.nearest - right.nearest);
  const placed: Array<{ x: number; y: number; width: number; height: number }> = [];
  const layouts: MilestoneSnakeLayout[] = new Array(milestones.length);

  orderedEntries.forEach(({ entry, originalIndex, point }) => {
    const candidates = snakeLabelCandidates(point, entry.milestone.title);
    const best = candidates
      .map((candidate) => {
        const rect = {
          x: candidate.label.boxX,
          y: candidate.label.boxY,
          width: candidate.label.boxWidth,
          height: candidate.label.boxHeight,
        };
        const collisionPenalty = placed.reduce((sum, occupied) => {
          const overlap = rectOverlap(rect, occupied);
          const gap = rectGap(rect, occupied);
          return sum + overlap * 80 + (gap < 26 ? (26 - gap) * 160 : 0);
        }, 0);
        const markerPenalty = markerRects.reduce((sum, marker, markerIndex) => {
          if (markerIndex === originalIndex) return sum;
          return sum + rectOverlap(rect, marker) * 80;
        }, 0);
        const distancePenalty =
          Math.hypot(
            candidate.label.connectorX - point.x,
            candidate.label.connectorY - point.y,
          ) * 0.18;
        const chronologicalPenalty = originalIndex * 0.4;
        return {
          ...candidate,
          score:
            collisionPenalty +
            markerPenalty +
            distancePenalty +
            chronologicalPenalty +
            candidate.preference +
            candidate.clampPenalty +
            snakeAxisPenalty(candidate.label, point),
        };
      })
      .sort((left, right) => left.score - right.score)[0];

    placed.push({
      x: best.label.boxX,
      y: best.label.boxY,
      width: best.label.boxWidth,
      height: best.label.boxHeight,
    });

    layouts[originalIndex] = {
      entry,
      point,
      label: best.label,
      lines: best.lines,
    };
  });

  return layouts;
}

export function buildSnakeMilestonePointLayouts(
  milestones: MilestoneTimelineItem[],
): MilestoneSnakePointLayout[] {
  return milestones.map((entry) => {
    const progress = mapSnakeTimelineOffset(entry.offset);
    return {
      entry,
      point: interpolateSnakePoint(progress),
    };
  });
}

export function milestoneTimelineTodayOffsetByCount(
  milestones: StructureMilestone[],
  today: Date,
) {
  if (milestones.length === 0) return null;
  const todayTime = today.getTime();
  const beforeToday = milestones.filter((entry) => {
    const dueTime = entry.milestone.dueDate
      ? startOfDay(new Date(entry.milestone.dueDate)).getTime()
      : Number.NaN;
    return Number.isFinite(dueTime) && dueTime < todayTime;
  }).length;

  return beforeToday / milestones.length;
}

export function compressMilestoneTimelineOffset(
  dueTime: number,
  minTime: number,
  todayTime: number,
  maxTime: number,
  todayOffset: number | null,
) {
  const totalRange = maxTime - minTime;
  const dateOffset = totalRange === 0 ? 0.5 : (dueTime - minTime) / totalRange;

  if (
    todayOffset === null ||
    !Number.isFinite(todayOffset) ||
    todayTime <= minTime ||
    todayTime >= maxTime
  ) {
    return Math.max(0, Math.min(1, dateOffset));
  }

  if (dueTime <= todayTime) {
    const beforeRange = todayTime - minTime;
    const beforeProgress = beforeRange === 0 ? 1 : (dueTime - minTime) / beforeRange;
    return Math.max(0, Math.min(1, beforeProgress * todayOffset));
  }

  const afterRange = maxTime - todayTime;
  const afterProgress = afterRange === 0 ? 0 : (dueTime - todayTime) / afterRange;
  return Math.max(
    0,
    Math.min(1, todayOffset + afterProgress * (1 - todayOffset)),
  );
}

export function createMilestoneTimelineModel({
  milestones,
  lanes,
  today,
  timelineStart,
  timelineEnd,
  laneIdByMilestoneId,
  minTrackWidth = 1040,
  todayOffsetMode = "calendar",
}: {
  milestones: StructureMilestone[];
  lanes: MilestoneTimelineLane[];
  today: Date;
  timelineStart: Date;
  timelineEnd: Date;
  laneIdByMilestoneId?: Map<string, string>;
  minTrackWidth?: number;
  todayOffsetMode?: MilestoneTimelineTodayOffsetMode;
}): MilestoneTimelineModel {
  const datedMilestones = milestones.filter(
    (entry) =>
      entry.milestone.dueDate &&
      !Number.isNaN(new Date(entry.milestone.dueDate).getTime()),
  );
  const visibleMilestones = datedMilestones.filter((entry) => {
    const dueDate = startOfDay(new Date(entry.milestone.dueDate as string));
    return dueDate >= timelineStart && dueDate <= timelineEnd;
  });
  const minTime = timelineStart.getTime();
  const maxTime = timelineEnd.getTime();
  const range = maxTime - minTime;
  const todayTime = today.getTime();
  const todayOffset =
    todayTime >= minTime && todayTime <= maxTime
      ? todayOffsetMode === "milestone-count"
        ? milestoneTimelineTodayOffsetByCount(visibleMilestones, today)
        : range === 0
          ? 0
          : (todayTime - minTime) / range
      : null;

  if (visibleMilestones.length === 0) {
    return {
      lanes: [],
      startDate: timelineStart.toISOString(),
      endDate: timelineEnd.toISOString(),
      todayDate: today.toISOString(),
      trackWidth: minTrackWidth,
      laneHeight: 154,
      todayOffset,
      hasMilestonesOutsideRange: datedMilestones.length > 0,
    };
  }

  const laneById = new Map(
    lanes.map((lane) => [
      lane.id,
      { ...lane, items: [] as MilestoneTimelineItem[] },
    ]),
  );
  const fallbackLane =
    laneById.get("all") ??
    laneById.get("unassigned") ??
    ({
      id: "unassigned",
      code: "",
      title: "Вехи",
      items: [] as MilestoneTimelineItem[],
    } satisfies MilestoneTimelineLane);

  visibleMilestones.forEach((entry) => {
    const dueTime = startOfDay(
      new Date(entry.milestone.dueDate as string),
    ).getTime();
    const offset = compressMilestoneTimelineOffset(
      dueTime,
      minTime,
      todayTime,
      maxTime,
      todayOffset,
    );
    const targetLane =
      laneById.get(laneIdByMilestoneId?.get(entry.milestone.id) ?? "") ??
      fallbackLane;
    targetLane.items.push({
      ...entry,
      offset,
      side: "top",
      level: 0,
      labelShiftPx: 0,
    });
  });

  if (!laneById.has(fallbackLane.id) && fallbackLane.items.length > 0) {
    laneById.set(fallbackLane.id, fallbackLane);
  }

  const modelLanes = Array.from(laneById.values()).filter(
    (lane) => lane.items.length > 0,
  );
  const maxLaneMilestones = Math.max(
    1,
    ...modelLanes.map((lane) => lane.items.length),
  );
  const trackWidth = Math.max(minTrackWidth, maxLaneMilestones * 150);

  modelLanes.forEach((lane) => {
    lane.items.sort(
      (left, right) =>
        String(left.milestone.dueDate ?? "").localeCompare(
          String(right.milestone.dueDate ?? ""),
        ) || left.milestone.sortOrder - right.milestone.sortOrder,
    );

    lane.items.forEach((item, index) => {
      item.side = index % 2 === 0 ? "top" : "bottom";
      item.level = 0;
      item.labelShiftPx = 0;
    });
  });

  return {
    lanes: modelLanes,
    startDate: new Date(minTime).toISOString(),
    endDate: new Date(maxTime).toISOString(),
    todayDate: today.toISOString(),
    trackWidth,
    laneHeight: 146,
    todayOffset,
    hasMilestonesOutsideRange: datedMilestones.length > visibleMilestones.length,
  };
}
