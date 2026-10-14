/**
 * What the question about schedule shifts does, apart from the page: which
 * finished editing sessions wait to be asked about, project by project, and
 * the steps of ending a session and of coming back to a project. The page
 * gives it the server and the tab's own knowledge.
 */
export type PendingStep = { checkpointId: string; code: string; title: string; deltaDays: number | null; previousDate: string | null; newDate: string | null; baselineDate: string | null; notes: string[] };
export type PendingSession = { id: string; startedAt: string; endedAt: string; steps: PendingStep[] };
export type Pending = { projectId: string; sessions: PendingSession[]; risks: Array<{ id: string; title: string }> };
export type PendingAnswer = Pending & { ownOpen: { id: string; lastActivityAt: string } | null };

/**
 * Adds a project's answer to the questions waiting: sessions already waiting
 * or shown stay as they are, and the others wait behind them, in one question
 * of the project. Answers may come in any order, so one never takes away what
 * another brought; sessions this tab already finished (`reviewed`) are not
 * asked about again, whatever an answer read before that says.
 */
export function mergePending(queue: Pending[], answer: Pending, reviewed: ReadonlySet<string> = new Set()): Pending[] {
  const known = new Set(queue.filter((entry) => entry.projectId === answer.projectId).flatMap((entry) => entry.sessions.map((session) => session.id)));
  const fresh = answer.sessions.filter((session) => !known.has(session.id) && !reviewed.has(session.id));
  if (fresh.length === 0) return queue;
  const waiting = queue.findIndex((entry, index) => index > 0 && entry.projectId === answer.projectId);
  if (waiting > 0) return queue.map((entry, index) => (index === waiting ? { ...entry, sessions: [...entry.sessions, ...fresh], risks: answer.risks } : entry));
  return [...queue, { ...answer, sessions: fresh }];
}

/** The queue once the question shown was answered or skipped: the next one comes up. */
export function withoutShown(queue: Pending[], shown: Pending) {
  return queue.filter((entry) => entry !== shown);
}

export type SessionServer = {
  pending(projectId: string): Promise<PendingAnswer>;
  close(projectId: string, sessionId: string, body: { mode: "leave" | "idle" | "stale"; lastActivityAt?: string }): Promise<{ closed: boolean }>;
};

export type TabSessions = {
  /** Waits until the tab's saves and their answers are done, so their sessions are known. */
  settled(): Promise<void>;
  /** Whether a save of this tab joined the session. */
  owns(projectId: string, sessionId: string): boolean;
};

/**
 * Coming back to a project: reads the person's finished sessions, and ends one
 * they left open in a tab that is gone, then reads again. The session is ended
 * only when this tab took no part in it, checked after the tab's saves under
 * way are answered (one may have just joined it), and only as the server saw
 * it then. Throws when a step fails, so the whole of it is tried again.
 */
export async function enterProject(projectId: string, server: SessionServer, tab: TabSessions): Promise<PendingAnswer> {
  await tab.settled();
  const answer = await server.pending(projectId);
  const own = answer.ownOpen;
  if (!own) return answer;
  await tab.settled();
  if (tab.owns(projectId, own.id)) return answer;
  const closed = await server.close(projectId, own.id, { mode: "stale", lastActivityAt: own.lastActivityAt });
  return closed.closed ? server.pending(projectId) : answer;
}

/**
 * Ends the sessions this tab took part in: a session the server does not know
 * as the person's is dropped, one another tab kept going is kept, and a failure
 * keeps the rest for later. Answers which to keep and whether all were tried.
 */
export async function closeSessions(projectId: string, sessionIds: string[], mode: "leave" | "idle", server: SessionServer, isNotFound: (failure: unknown) => boolean) {
  const keep: string[] = [];
  for (const [index, sessionId] of sessionIds.entries()) {
    try {
      const answer = await server.close(projectId, sessionId, { mode });
      if (!answer.closed) keep.push(sessionId);
    } catch (failure) {
      if (isNotFound(failure)) continue;
      return { keep: [...keep, ...sessionIds.slice(index)], done: false };
    }
  }
  return { keep, done: true };
}
