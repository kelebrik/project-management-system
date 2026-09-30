export type DecisionStatus = "PROPOSED" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUPERSEDED";

export type Decision = {
  id: string;
  projectId: string;
  title: string;
  context: string;
  decision: string;
  status: DecisionStatus;
  decidedBy: string | null;
  decidedAt: string | null;
  createdByName: string | null;
  approverUserId: string | null;
  approverName: string | null;
  requestedAt: string | null;
  approvalComment: string | null;
  answeredAt: string | null;
  issueId: string | null;
  raidItemId: string | null;
  wbsItemId: string | null;
  changeRequestId: string | null;
  supersedesId: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type DecisionFilter = "all" | "mine" | DecisionStatus;

/** Waiting for an answer first, then drafts, then the rest by the latest change. */
const ORDER: Record<DecisionStatus, number> = { PENDING_APPROVAL: 0, PROPOSED: 1, APPROVED: 2, REJECTED: 3, SUPERSEDED: 4 };

export function filterDecisions(decisions: Decision[], filter: DecisionFilter, userId: string | null) {
  return decisions
    .filter((decision) =>
      filter === "all" ? true : filter === "mine" ? decision.status === "PENDING_APPROVAL" && decision.approverUserId === userId : decision.status === filter,
    )
    .sort((left, right) => ORDER[left.status] - ORDER[right.status] || right.updatedAt.localeCompare(left.updatedAt));
}

/** The decision that replaced this one, if any. */
export function supersededBy(decisions: Decision[], id: string) {
  return decisions.find((decision) => decision.supersedesId === id) ?? null;
}
