import {
  addCalendarMonths,
  signedDaysUntil,
  signedWorkingDaysUntil,
  startOfDay,
} from "./dateUtils";
import type { WbsItem } from "./domainTypes";
import {
  createMilestoneTimelineModel,
  milestoneStateLabel,
  type MilestoneTimelineItem,
  type StructureMilestone,
} from "./milestoneTimeline";

function isTimelineCheckpoint(item: WbsItem) {
  return item.type === "MILESTONE" || item.type === "GOAL";
}

const STALE_PHASE_HIDE_DAYS = 21;
const DAY_MS = 86_400_000;

export function createStructureMilestones(wbsItems: WbsItem[]) {
  return wbsItems
    .filter(isTimelineCheckpoint)
    .map((milestone) => {
      const calendarDaysLeft = signedDaysUntil(milestone.dueDate);
      const workDaysLeft = signedWorkingDaysUntil(milestone.dueDate);
      const milestoneDue = milestone.dueDate
        ? startOfDay(new Date(milestone.dueDate))
        : null;
      const itemsBeforeMilestone = milestoneDue
        ? wbsItems.filter(
            (item) =>
              !isTimelineCheckpoint(item) &&
              item.dueDate &&
              startOfDay(new Date(item.dueDate)) <= milestoneDue,
          )
        : [];
      const state = milestoneStateLabel(milestone, itemsBeforeMilestone);

      return {
        milestone,
        calendarDaysLeft,
        workDaysLeft,
        state,
      };
    })
    .sort((left, right) =>
      String(left.milestone.dueDate ?? "").localeCompare(
        String(right.milestone.dueDate ?? ""),
      ),
    );
}

export function createMilestoneTimeline(
  wbsItems: WbsItem[],
  structureMilestones: StructureMilestone[],
  todaySource = new Date(),
) {
  const itemById = new Map(wbsItems.map((item) => [item.id, item]));
  const phases = wbsItems
    .filter((item) => item.type === "PHASE")
    .sort((left, right) => left.sortOrder - right.sortOrder);
  const today = startOfDay(todaySource);
  const timelineStart = startOfDay(addCalendarMonths(today, -2));
  const timelineEnd = startOfDay(addCalendarMonths(today, 4));
  const allMilestoneDates = structureMilestones
    .map((entry) =>
      entry.milestone.dueDate
        ? startOfDay(new Date(entry.milestone.dueDate))
        : null,
    )
    .filter(
      (value): value is Date => value !== null && !Number.isNaN(value.getTime()),
    );
  const allTimelineStart =
    allMilestoneDates.length > 0
      ? new Date(Math.min(...allMilestoneDates.map((value) => value.getTime())))
      : timelineStart;
  const allTimelineEnd =
    allMilestoneDates.length > 0
      ? new Date(Math.max(...allMilestoneDates.map((value) => value.getTime())))
      : timelineEnd;
  const phaseIdForMilestone = (milestone: WbsItem) => {
    let currentId = milestone.parentId;
    const visited = new Set<string>();
    while (currentId && !visited.has(currentId)) {
      visited.add(currentId);
      const current = itemById.get(currentId);
      if (!current) break;
      if (current.type === "PHASE") return current.id;
      currentId = current.parentId;
    }
    return null;
  };

  const laneIdByMilestoneId = new Map(
    structureMilestones.map((entry) => [
      entry.milestone.id,
      phaseIdForMilestone(entry.milestone) ?? "unassigned",
    ]),
  );
  const milestonesByPhaseLaneId = new Map<string, StructureMilestone[]>();
  structureMilestones.forEach((entry) => {
    const laneId = laneIdByMilestoneId.get(entry.milestone.id) ?? "unassigned";
    milestonesByPhaseLaneId.set(laneId, [
      ...(milestonesByPhaseLaneId.get(laneId) ?? []),
      entry,
    ]);
  });
  const phaseLanes =
    phases.length > 0
      ? [
          ...phases.map((phase) => ({
            id: phase.id,
            code: phase.code,
            title: phase.title,
            items: [] as MilestoneTimelineItem[],
          })),
          {
            id: "unassigned",
            code: "",
            title: "Без фазы",
            items: [] as MilestoneTimelineItem[],
          },
        ]
      : [
          {
            id: "unassigned",
            code: "",
            title: "Все вехи",
            items: [] as MilestoneTimelineItem[],
          },
        ];
  const staleCutoffTime = today.getTime() - STALE_PHASE_HIDE_DAYS * DAY_MS;
  const stalePhaseLaneIds = new Set(
    phaseLanes
      .filter((lane) => lane.id !== "unassigned")
      .filter((lane) => {
        const laneMilestones = milestonesByPhaseLaneId.get(lane.id) ?? [];
        return (
          laneMilestones.length > 0 &&
          laneMilestones.every((entry) => {
            if (entry.milestone.status !== "DONE" || !entry.milestone.dueDate) {
              return false;
            }
            const dueDate = startOfDay(new Date(entry.milestone.dueDate));
            return (
              !Number.isNaN(dueDate.getTime()) &&
              dueDate.getTime() < staleCutoffTime
            );
          })
        );
      })
      .map((lane) => lane.id),
  );
  const byPhaseMilestones = structureMilestones.filter(
    (entry) => !stalePhaseLaneIds.has(laneIdByMilestoneId.get(entry.milestone.id) ?? ""),
  );
  const byPhaseLanes = phaseLanes.filter(
    (lane) => !stalePhaseLaneIds.has(lane.id),
  );
  const byPhase = createMilestoneTimelineModel({
    milestones: byPhaseMilestones,
    lanes: byPhaseLanes,
    today,
    timelineStart,
    timelineEnd,
    laneIdByMilestoneId,
  });
  const all = createMilestoneTimelineModel({
    milestones: structureMilestones,
    lanes: [
      {
        id: "all",
        code: "",
        title: "Все вехи",
        items: [] as MilestoneTimelineItem[],
      },
    ],
    today,
    timelineStart: allTimelineStart,
    timelineEnd: allTimelineEnd,
    laneIdByMilestoneId: new Map(
      structureMilestones.map((entry) => [entry.milestone.id, "all"]),
    ),
    minTrackWidth: byPhase.trackWidth,
    todayOffsetMode: "milestone-count",
  });

  return {
    byPhase: {
      ...byPhase,
      hiddenStaleLaneCount: stalePhaseLaneIds.size,
    },
    all,
  };
}
