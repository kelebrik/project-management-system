/**
 * The editing sessions this tab took part in, by person and project, as the
 * answers to its saves named them, and the projects whose finished sessions
 * still have to be asked about. Kept in the tab only: another tab's sessions
 * are its own, and a tab that is gone left its sessions to the server.
 */
type Edited = { sessionIds: Set<string>; lastSaveAt: number };

const edited = new Map<string, Edited>();
const toAsk = new Set<string>();
const listeners = new Set<(projectId: string) => void>();
let currentUser: string | null = null;

const key = (userId: string, projectId: string) => `${userId}:${projectId}`;

/** The person signed in: only their sessions are worked with; another person's are forgotten. */
export function setShiftSessionUser(userId: string | null) {
  if (userId === currentUser) return;
  currentUser = userId;
  edited.clear();
  toAsk.clear();
}

/** Notes a session a save joined, under the person the server named, whatever page is shown by now. */
export function noteShiftSession(projectId: string, sessionId: string, actorId: string, now = Date.now()) {
  const entry = edited.get(key(actorId, projectId)) ?? { sessionIds: new Set<string>(), lastSaveAt: now };
  entry.sessionIds.add(sessionId);
  entry.lastSaveAt = Math.max(entry.lastSaveAt, now);
  edited.set(key(actorId, projectId), entry);
  if (actorId === currentUser) for (const listener of listeners) listener(projectId);
}

/** The signed-in person's sessions this tab took part in, in the project. */
export function editedShiftSessions(projectId: string) {
  return currentUser ? edited.get(key(currentUser, projectId)) ?? null : null;
}

/** Takes the project's sessions to end them; saves after this start a new set. They are to be asked about until that is done. */
export function takeShiftSessions(projectId: string) {
  if (!currentUser) return [];
  const entry = edited.get(key(currentUser, projectId));
  edited.delete(key(currentUser, projectId));
  if (entry) toAsk.add(key(currentUser, projectId));
  return entry ? [...entry.sessionIds] : [];
}

/** Puts sessions back that could not be ended, to try again later. */
export function restoreShiftSessions(projectId: string, sessionIds: string[]) {
  if (!currentUser) return;
  for (const sessionId of sessionIds) noteShiftSession(projectId, sessionId, currentUser);
}

/** Whether the project's finished sessions are still to be asked about. */
export function shiftSessionsToAsk(projectId: string) {
  return currentUser ? toAsk.has(key(currentUser, projectId)) : false;
}

/** The project's finished sessions were asked about. */
export function shiftSessionsAsked(projectId: string) {
  if (currentUser) toAsk.delete(key(currentUser, projectId));
}

/** Hears every session the signed-in person joined. */
export function onShiftSession(listener: (projectId: string) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
