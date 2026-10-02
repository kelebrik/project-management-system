import type { CSSProperties } from "react";
import type { MilestoneTimelineModel } from "./milestoneTimeline";

/** Where the title of a phase lane sits on the milestone timeline: away from its markers, near the centre. */
const PHASE_LABEL_MAX_WIDTH_PX = 320;
const PHASE_LABEL_MIN_WIDTH_PX = 96;
const PHASE_POINT_GAP_PX = 28;
const PHASE_TIMELINE_LEFT_PX = 8;
const PHASE_TIMELINE_RIGHT_PX = 42;

export function phaseTimelineLeft(offset: number) {
  return `calc(${PHASE_TIMELINE_LEFT_PX}px + ${(offset * 100).toFixed(3)}% - ${(offset * (PHASE_TIMELINE_LEFT_PX + PHASE_TIMELINE_RIGHT_PX)).toFixed(3)}px)`;
}

function phaseTimelineCenter(centerOffset: number, width: number) {
  return `calc(${PHASE_TIMELINE_LEFT_PX}px + ${(centerOffset * 100).toFixed(3)}% - ${(centerOffset * (PHASE_TIMELINE_LEFT_PX + PHASE_TIMELINE_RIGHT_PX)).toFixed(3)}px - ${(width / 2).toFixed(3)}px)`;
}

function phaseAxisTitlePreferredWidth(code: string | undefined, title: string) {
  const codeWidth = code ? Math.max(28, code.length * 8 + 18) : 0;
  const titleWidth = Math.ceil(title.length * 8);
  return Math.min(
    PHASE_LABEL_MAX_WIDTH_PX,
    Math.max(PHASE_LABEL_MIN_WIDTH_PX, codeWidth + titleWidth + 36),
  );
}

export function phaseAxisTitleStyle(
  lane: MilestoneTimelineModel["lanes"][number],
  trackWidth: number,
) {
  const preferredWidth = phaseAxisTitlePreferredWidth(lane.code, lane.title);
  const usableWidth = Math.max(
    0,
    trackWidth - PHASE_TIMELINE_LEFT_PX - PHASE_TIMELINE_RIGHT_PX,
  );
  const protectedRanges = lane.items
    .map((item) => {
      const center = item.offset * usableWidth;
      return {
        start: Math.max(0, center - PHASE_POINT_GAP_PX),
        end: Math.min(usableWidth, center + PHASE_POINT_GAP_PX),
      };
    })
    .sort((left, right) => left.start - right.start);

  const gaps: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  protectedRanges.forEach((range) => {
    if (range.start > cursor) {
      gaps.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  });
  if (cursor < usableWidth) {
    gaps.push({ start: cursor, end: usableWidth });
  }

  const minimumWidth = Math.min(PHASE_LABEL_MIN_WIDTH_PX, preferredWidth, usableWidth);
  const eligibleGaps = gaps.filter((gap) => gap.end - gap.start >= minimumWidth);
  const candidateGaps = eligibleGaps.length > 0 ? eligibleGaps : gaps;
  const timelineCenter = usableWidth / 2;
  const placements = candidateGaps
    .map((gap) => {
      const availableWidth = Math.max(0, gap.end - gap.start);
      const width = Math.min(preferredWidth, availableWidth);
      const idealLeft = timelineCenter - width / 2;
      const left = Math.min(
        Math.max(idealLeft, gap.start),
        Math.max(gap.start, gap.end - width),
      );
      return {
        left,
        width,
        centerDistance: Math.abs(left + width / 2 - timelineCenter),
      };
    })
    .sort((left, right) =>
      eligibleGaps.length > 0
        ? left.centerDistance - right.centerDistance ||
          right.width - left.width ||
          left.left - right.left
        : right.width - left.width ||
          left.centerDistance - right.centerDistance ||
          left.left - right.left,
    );
  const placement = placements[0] ?? {
    left: Math.max(0, timelineCenter - Math.min(preferredWidth, usableWidth) / 2),
    width: Math.min(preferredWidth, usableWidth),
    centerDistance: 0,
  };
  const centerOffset =
    usableWidth > 0 ? (placement.left + placement.width / 2) / usableWidth : 0;

  return {
    "--milestone-axis-title-left": phaseTimelineCenter(centerOffset, placement.width),
    "--milestone-axis-title-width": `${Math.round(placement.width)}px`,
  } as CSSProperties;
}
