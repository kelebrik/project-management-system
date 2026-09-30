export const LESSON_CATEGORIES = ["CUSTOMER", "SUPPLIER", "RESOURCES", "ESTIMATE", "TECHNICAL", "EXTERNAL", "OTHER", "GOOD_PRACTICE"] as const;
export type LessonCategory = (typeof LESSON_CATEGORIES)[number];

export type LessonDraft = {
  category: LessonCategory;
  title: string;
  text: string;
  recommendation: string;
  sourceKind: "MANUAL" | "SHIFT" | "RISK" | "ISSUE" | "DECISION";
  sourceRef: string | null;
};

export type Lesson = LessonDraft & { id: string; projectId: string; createdByName: string | null; createdAt: string };
export type LessonWithProject = Lesson & { project: { id: string; code: string; name: string; status: string } };
