export const GANTT_ROW_HEIGHT = 24;
export const GANTT_LINK_ENDPOINT_GAP_PERCENT = 0.12;

export const GANTT_LINK_STUB_PERCENT = 1.15;
const GANTT_LINK_DETOUR_PERCENT = 2.6;
const GANTT_LINK_RADIUS_X = 0.42;
const GANTT_LINK_RADIUS_Y = 7;

type GanttDependencyPathInput = {
  fromSide: "start" | "end";
  fromX: number;
  fromY: number;
  toSide: "start" | "end";
  toX: number;
  toY: number;
};

type GanttDependencyPathPoint = {
  x: number;
  y: number;
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function ganttPathNumber(value: number) {
  return Number(value.toFixed(2));
}

export function ganttPathDirection(side: "start" | "end") {
  return side === "end" ? 1 : -1;
}

export function ganttTargetDirection(side: "start" | "end") {
  return side === "start" ? 1 : -1;
}

function pushGanttPathPoint(
  points: GanttDependencyPathPoint[],
  x: number,
  y: number,
) {
  const next = { x: ganttPathNumber(x), y: ganttPathNumber(y) };
  const previous = points.at(-1);
  if (previous && previous.x === next.x && previous.y === next.y) return;
  points.push(next);
}

function ganttTargetRowBoundary(fromY: number, toY: number) {
  const targetRow = Math.max(0, Math.floor(toY / GANTT_ROW_HEIGHT));
  return toY > fromY
    ? targetRow * GANTT_ROW_HEIGHT
    : (targetRow + 1) * GANTT_ROW_HEIGHT;
}

function ganttDependencyPathPoints(line: GanttDependencyPathInput) {
  const sourceDirection = ganttPathDirection(line.fromSide);
  const targetDirection = ganttTargetDirection(line.toSide);
  const sourceStubX = clampNumber(
    line.fromX + sourceDirection * GANTT_LINK_STUB_PERCENT,
    0,
    100,
  );
  const targetStubX = clampNumber(
    line.toX - targetDirection * GANTT_LINK_STUB_PERCENT,
    0,
    100,
  );
  const hasForwardClearance =
    sourceDirection === targetDirection &&
    (targetStubX - sourceStubX) * sourceDirection >=
      GANTT_LINK_STUB_PERCENT * 0.7;
  const sameRow = Math.abs(line.toY - line.fromY) < 1;
  const points: GanttDependencyPathPoint[] = [];
  const targetBoundaryY = sameRow
    ? line.toY
    : ganttTargetRowBoundary(line.fromY, line.toY);

  pushGanttPathPoint(points, line.fromX, line.fromY);
  pushGanttPathPoint(points, sourceStubX, line.fromY);

  if (hasForwardClearance && !sameRow) {
    const middleX = (sourceStubX + targetStubX) / 2;
    pushGanttPathPoint(points, middleX, line.fromY);
    pushGanttPathPoint(points, middleX, targetBoundaryY);
    pushGanttPathPoint(points, targetStubX, targetBoundaryY);
  } else if (hasForwardClearance && sameRow) {
    const laneY =
      line.fromY < GANTT_ROW_HEIGHT
        ? line.fromY + GANTT_ROW_HEIGHT * 0.52
        : line.fromY - GANTT_ROW_HEIGHT * 0.52;
    const middleX = (sourceStubX + targetStubX) / 2;
    pushGanttPathPoint(points, sourceStubX, laneY);
    pushGanttPathPoint(points, middleX, laneY);
    pushGanttPathPoint(points, targetStubX, laneY);
  } else if (sameRow) {
    const laneY =
      line.fromY < GANTT_ROW_HEIGHT
        ? line.fromY + GANTT_ROW_HEIGHT * 0.52
        : line.fromY - GANTT_ROW_HEIGHT * 0.52;
    const detourBase =
      sourceDirection > 0
        ? Math.max(line.fromX, line.toX)
        : Math.min(line.fromX, line.toX);
    const detourX = clampNumber(
      detourBase + sourceDirection * GANTT_LINK_DETOUR_PERCENT,
      0.4,
      99.6,
    );
    pushGanttPathPoint(points, sourceStubX, laneY);
    pushGanttPathPoint(points, detourX, laneY);
    pushGanttPathPoint(points, targetStubX, laneY);
  } else {
    pushGanttPathPoint(points, sourceStubX, targetBoundaryY);
    pushGanttPathPoint(points, targetStubX, targetBoundaryY);
  }

  pushGanttPathPoint(points, targetStubX, line.toY);
  pushGanttPathPoint(points, line.toX, line.toY);

  return points;
}

export function ganttRoundedDependencyPath(points: GanttDependencyPathPoint[]) {
  if (points.length < 2) return "";
  const path = [`M ${points[0].x} ${points[0].y}`];

  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const next = points[index + 1];
    const previousHorizontal = previous.y === current.y;
    const nextHorizontal = next.y === current.y;

    if (previousHorizontal === nextHorizontal) {
      path.push(`L ${current.x} ${current.y}`);
      continue;
    }

    const previousDistance = previousHorizontal
      ? Math.abs(current.x - previous.x)
      : Math.abs(current.y - previous.y);
    const nextDistance = nextHorizontal
      ? Math.abs(next.x - current.x)
      : Math.abs(next.y - current.y);
    const beforeRadius = Math.min(
      previousHorizontal ? GANTT_LINK_RADIUS_X : GANTT_LINK_RADIUS_Y,
      previousDistance / 2,
    );
    const afterRadius = Math.min(
      nextHorizontal ? GANTT_LINK_RADIUS_X : GANTT_LINK_RADIUS_Y,
      nextDistance / 2,
    );
    const before = {
      x: previousHorizontal
        ? current.x - Math.sign(current.x - previous.x) * beforeRadius
        : current.x,
      y: previousHorizontal
        ? current.y
        : current.y - Math.sign(current.y - previous.y) * beforeRadius,
    };
    const after = {
      x: nextHorizontal
        ? current.x + Math.sign(next.x - current.x) * afterRadius
        : current.x,
      y: nextHorizontal
        ? current.y
        : current.y + Math.sign(next.y - current.y) * afterRadius,
    };

    path.push(`L ${ganttPathNumber(before.x)} ${ganttPathNumber(before.y)}`);
    path.push(
      `Q ${current.x} ${current.y} ${ganttPathNumber(after.x)} ${ganttPathNumber(after.y)}`,
    );
  }

  const last = points.at(-1);
  if (last) path.push(`L ${last.x} ${last.y}`);
  return path.join(" ");
}

export function ganttDependencyPath(line: GanttDependencyPathInput) {
  return ganttRoundedDependencyPath(ganttDependencyPathPoints(line));
}
