export type MilestoneSnakeRawPoint = {
  x: number;
  y: number;
};

export type MilestoneSnakePathPoint = MilestoneSnakeRawPoint & {
  distance: number;
};

export const MILESTONE_SNAKE_WIDTH = 1120;
export const MILESTONE_SNAKE_HEIGHT = 792;

const SEGMENT_SAMPLES = 42;

const referenceBounds = {
  minX: 58,
  maxX: 1636,
  minY: 50,
  maxY: 937,
};

const canvasBounds = {
  left: 68,
  right: 1054,
  top: 54,
  bottom: 724,
};

const referencePath = {
  start: { x: 58, y: 937 },
  segments: [
    {
      c1: { x: 82, y: 850 },
      c2: { x: 104, y: 822 },
      to: { x: 101, y: 710 },
    },
    {
      c1: { x: 98, y: 582 },
      c2: { x: 90, y: 510 },
      to: { x: 132, y: 431 },
    },
    {
      c1: { x: 181, y: 356 },
      c2: { x: 245, y: 332 },
      to: { x: 286, y: 365 },
    },
    {
      c1: { x: 352, y: 421 },
      c2: { x: 390, y: 543 },
      to: { x: 440, y: 636 },
    },
    {
      c1: { x: 493, y: 735 },
      c2: { x: 613, y: 845 },
      to: { x: 715, y: 835 },
    },
    {
      c1: { x: 825, y: 825 },
      c2: { x: 817, y: 671 },
      to: { x: 780, y: 551 },
    },
    {
      c1: { x: 735, y: 404 },
      c2: { x: 642, y: 262 },
      to: { x: 634, y: 162 },
    },
    {
      c1: { x: 626, y: 70 },
      c2: { x: 720, y: 28 },
      to: { x: 803, y: 32 },
    },
    {
      c1: { x: 914, y: 37 },
      c2: { x: 977, y: 155 },
      to: { x: 1046, y: 275 },
    },
    {
      c1: { x: 1138, y: 433 },
      c2: { x: 1242, y: 610 },
      to: { x: 1378, y: 655 },
    },
    {
      c1: { x: 1462, y: 682 },
      c2: { x: 1503, y: 654 },
      to: { x: 1493, y: 573 },
    },
    {
      c1: { x: 1483, y: 494 },
      c2: { x: 1406, y: 372 },
      to: { x: 1392, y: 272 },
    },
    {
      c1: { x: 1378, y: 170 },
      c2: { x: 1486, y: 102 },
      to: { x: 1636, y: 50 },
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
