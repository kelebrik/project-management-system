export type MilestoneSnakeRawPoint = {
  x: number;
  y: number;
};

export type MilestoneSnakePathPoint = MilestoneSnakeRawPoint & {
  distance: number;
};

export const MILESTONE_SNAKE_WIDTH = 1120;
export const MILESTONE_SNAKE_HEIGHT = 792;

const SEGMENT_SAMPLES = 56;

const referenceBounds = {
  minX: 0,
  maxX: MILESTONE_SNAKE_WIDTH,
  minY: 0,
  maxY: MILESTONE_SNAKE_HEIGHT,
};

const canvasBounds = {
  left: 0,
  right: MILESTONE_SNAKE_WIDTH,
  top: 0,
  bottom: MILESTONE_SNAKE_HEIGHT,
};

const referencePath = {
  start: { x: 38, y: 746 },
  segments: [
    {
      c1: { x: 46, y: 678 },
      c2: { x: 48, y: 648 },
      to: { x: 76, y: 604 },
    },
    {
      c1: { x: 118, y: 526 },
      c2: { x: 80, y: 430 },
      to: { x: 172, y: 362 },
    },
    {
      c1: { x: 252, y: 302 },
      c2: { x: 338, y: 336 },
      to: { x: 386, y: 450 },
    },
    {
      c1: { x: 438, y: 578 },
      c2: { x: 508, y: 736 },
      to: { x: 630, y: 702 },
    },
    {
      c1: { x: 758, y: 666 },
      c2: { x: 692, y: 486 },
      to: { x: 650, y: 366 },
    },
    {
      c1: { x: 600, y: 214 },
      c2: { x: 612, y: 58 },
      to: { x: 750, y: 34 },
    },
    {
      c1: { x: 880, y: 12 },
      c2: { x: 940, y: 172 },
      to: { x: 1006, y: 292 },
    },
    {
      c1: { x: 1096, y: 456 },
      c2: { x: 1138, y: 612 },
      to: { x: 1024, y: 652 },
    },
    {
      c1: { x: 936, y: 684 },
      c2: { x: 846, y: 612 },
      to: { x: 790, y: 530 },
    },
    {
      c1: { x: 724, y: 432 },
      c2: { x: 816, y: 312 },
      to: { x: 922, y: 230 },
    },
    {
      c1: { x: 1002, y: 168 },
      c2: { x: 1056, y: 112 },
      to: { x: 1090, y: 62 },
    },
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

export function sampleMilestoneSnakePath(): MilestoneSnakePathPoint[] {
  const points: MilestoneSnakePathPoint[] = [];
  let previous = mapReferencePoint(referencePath.start);
  let distance = 0;
  points.push({ ...previous, distance });

  referencePath.segments.forEach((segment) => {
    const from = previous;
    const c1 = mapReferencePoint(segment.c1);
    const c2 = mapReferencePoint(segment.c2);
    const to = mapReferencePoint(segment.to);
    for (let sample = 1; sample <= SEGMENT_SAMPLES; sample += 1) {
      const current = cubicBezierPoint(from, c1, c2, to, sample / SEGMENT_SAMPLES);
      distance += Math.hypot(current.x - previous.x, current.y - previous.y);
      points.push({ ...current, distance });
      previous = current;
    }
  });

  return points;
}
