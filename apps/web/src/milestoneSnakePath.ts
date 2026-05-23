export type MilestoneSnakeRawPoint = {
  x: number;
  y: number;
};

export type MilestoneSnakePathPoint = MilestoneSnakeRawPoint & {
  distance: number;
};

export const MILESTONE_SNAKE_WIDTH = 1120;
export const MILESTONE_SNAKE_HEIGHT = 560;

const SEGMENT_SAMPLES = 56;

const referenceBounds = {
  minX: 80,
  maxX: 1375,
  minY: 80,
  maxY: 660,
};

const canvasBounds = {
  left: 54,
  right: 1068,
  top: 40,
  bottom: 520,
};

const referencePath = {
  start: { x: 80, y: 520 },
  segments: [
    { to: { x: 80, y: 200 } },
    {
      c1: { x: 80, y: 80 },
      c2: { x: 300, y: 80 },
      to: { x: 300, y: 200 },
    },
    { to: { x: 300, y: 213 } },
    { to: { x: 300, y: 525 } },
    {
      c1: { x: 300, y: 660 },
      c2: { x: 505, y: 660 },
      to: { x: 505, y: 525 },
    },
    { to: { x: 505, y: 205 } },
    {
      c1: { x: 505, y: 85 },
      c2: { x: 715, y: 85 },
      to: { x: 715, y: 205 },
    },
    { to: { x: 715, y: 213 } },
    { to: { x: 715, y: 520 } },
    {
      c1: { x: 715, y: 655 },
      c2: { x: 950, y: 655 },
      to: { x: 950, y: 520 },
    },
    { to: { x: 950, y: 513 } },
    { to: { x: 950, y: 200 } },
    {
      c1: { x: 950, y: 80 },
      c2: { x: 1170, y: 80 },
      to: { x: 1170, y: 200 },
    },
    { to: { x: 1170, y: 213 } },
    { to: { x: 1170, y: 520 } },
    {
      c1: { x: 1170, y: 655 },
      c2: { x: 1375, y: 655 },
      to: { x: 1375, y: 520 },
    },
    { to: { x: 1375, y: 213 } },
  ],
};

function mapReferencePoint(point: MilestoneSnakeRawPoint): MilestoneSnakeRawPoint {
  const scaleX =
    (canvasBounds.right - canvasBounds.left) /
    (referenceBounds.maxX - referenceBounds.minX);
  const scaleY =
    (canvasBounds.bottom - canvasBounds.top) /
    (referenceBounds.maxY - referenceBounds.minY);
  return {
    x: canvasBounds.left + (point.x - referenceBounds.minX) * scaleX,
    y: canvasBounds.top + (point.y - referenceBounds.minY) * scaleY,
  };
}

type ReferencePathSegment =
  | {
      to: MilestoneSnakeRawPoint;
      c1?: never;
      c2?: never;
    }
  | {
      c1: MilestoneSnakeRawPoint;
      c2: MilestoneSnakeRawPoint;
      to: MilestoneSnakeRawPoint;
    };

function cubicBezierPoint(
  from: MilestoneSnakeRawPoint,
  c1: MilestoneSnakeRawPoint,
  c2: MilestoneSnakeRawPoint,
  to: MilestoneSnakeRawPoint,
  progress: number,
) {
  const inverse = 1 - progress;
  return {
    x:
      inverse ** 3 * from.x +
      3 * inverse ** 2 * progress * c1.x +
      3 * inverse * progress ** 2 * c2.x +
      progress ** 3 * to.x,
    y:
      inverse ** 3 * from.y +
      3 * inverse ** 2 * progress * c1.y +
      3 * inverse * progress ** 2 * c2.y +
      progress ** 3 * to.y,
  };
}

function linePoint(
  from: MilestoneSnakeRawPoint,
  to: MilestoneSnakeRawPoint,
  progress: number,
) {
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

export function sampleMilestoneSnakePath(): MilestoneSnakePathPoint[] {
  const points: MilestoneSnakePathPoint[] = [];
  let previous = mapReferencePoint(referencePath.start);
  let distance = 0;
  points.push({ ...previous, distance });

  referencePath.segments.forEach((segment: ReferencePathSegment) => {
    const from = previous;
    const to = mapReferencePoint(segment.to);
    const c1 = "c1" in segment ? mapReferencePoint(segment.c1) : null;
    const c2 = "c2" in segment ? mapReferencePoint(segment.c2) : null;
    for (let sample = 1; sample <= SEGMENT_SAMPLES; sample += 1) {
      const progress = sample / SEGMENT_SAMPLES;
      const current =
        c1 && c2
          ? cubicBezierPoint(from, c1, c2, to, progress)
          : linePoint(from, to, progress);
      distance += Math.hypot(current.x - previous.x, current.y - previous.y);
      points.push({ ...current, distance });
      previous = current;
    }
  });

  return points;
}
