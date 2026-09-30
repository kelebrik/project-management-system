/** A row a message points to: a structure row, an open issue, a risk or problem (with its RAID type), or a Jira key. */
export type FactRef = { kind: "wbs" | "issue" | "risk" | "jira"; id: string; label: string; type?: string };
