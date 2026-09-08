export type AutomationLink = { id: string; code: string; title: string; href: string };
export type MilestoneReadiness = AutomationLink & {
  dueDate: string | null;
  state: "complete" | "ready" | "blocked" | "unknown";
  remaining: AutomationLink[];
  blockers: Array<{ id: string; title: string; href: string }>;
  warnings: string[];
};
export type ReconciliationRow = AutomationLink & {
  jiraKey: string;
  jiraStatus: string | null;
  syncedAt: string | null;
  currentStatus: string;
  proposedStatus: string | null;
  currentOwner: string;
  proposedOwner: string | null;
  expectedUpdatedAt: string;
  expectedJiraUpdatedAt: string | null;
  warnings: string[];
  actionable: boolean;
};
export type AutomationInsight = {
  generatedAt: string;
  readiness: MilestoneReadiness[];
  reconciliation: ReconciliationRow[];
};
export type WeeklyChange = {
  id: string;
  projectId: string;
  projectCode: string;
  title: string;
  field: string;
  before: string;
  after: string;
  at: string;
  actor: string;
  href: string;
  source: "journal" | "wbs";
};
export type WeeklyBrief = {
  from: string;
  to: string;
  projectCount: number;
  changes: WeeklyChange[];
  warnings: string[];
};
export type ScenarioPatch = { id: string; startDate?: string; dueDate?: string; workDays?: number };
export type ScenarioResult = {
  fingerprint: string;
  generatedAt: string;
  beforeFinish: string | null;
  afterFinish: string | null;
  beforeCriticalIds: string[];
  afterCriticalIds: string[];
  warnings: string[];
  changes: Array<AutomationLink & {
    beforeStart: string | null;
    afterStart: string | null;
    beforeFinish: string | null;
    afterFinish: string | null;
    checkpoint: boolean;
  }>;
};
export type MeetingDraft = {
  id: string;
  kind: "TASK" | "ISSUE" | "RISK";
  title: string;
  owner: string;
  dueDate: string;
  source: string;
};

/** Deterministic fallback: extract only explicit labels; never invent dates or people. */
export function parseMeetingNotes(text: string): MeetingDraft[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20).map((source, index) => {
    const kind = /^(?:[-*•\d.)\s]*)(?:риск|risk)\s*:/i.test(source) ? "RISK"
      : /^(?:[-*•\d.)\s]*)(?:вопрос|issue|решение)\s*:/i.test(source) ? "ISSUE" : "TASK";
    const owner = source.match(/(?:ответственный|исполнитель|owner)\s*:\s*([^;|\n]+)/i)?.[1]?.trim() ?? "";
    const rawDate = source.match(/(?:срок|до|due)\s*:\s*(\d{4}-\d{2}-\d{2}|\d{2}\.\d{2}\.\d{4})/i)?.[1] ?? "";
    const date = rawDate.includes(".") ? rawDate.split(".").reverse().join("-") : rawDate;
    const dueDate = date && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date ? date : "";
    const title = source.replace(/^[-*•\d.)\s]+/, "").replace(/^(?:задача|поручение|task|риск|risk|вопрос|issue|решение)\s*:\s*/i, "")
      .split(/\s*[;|]\s*(?:ответственный|исполнитель|owner|срок|до|due)\s*:/i)[0].trim();
    return { id: `note-${index}`, kind, title, owner, dueDate, source };
  });
}
