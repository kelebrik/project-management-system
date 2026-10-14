import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import { ApiError, apiClient } from "../../api/client";
import { SCHEDULE_SHIFTS_CHANGED_EVENT } from "../../app/scheduleShiftNotice";
import {
  editedShiftSessions,
  onShiftSession,
  restoreShiftSessions,
  setShiftSessionUser,
  shiftSessionsAsked,
  shiftSessionsToAsk,
  takeShiftSessions,
} from "../../app/shiftSessions";
import { closeSessions, enterProject, mergePending, withoutShown, type Pending, type PendingAnswer, type SessionServer } from "../../app/shiftReasonQueue";
import { onStructureIdle, structureActive } from "../../app/structureStore";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import "../../styles/schedule-shifts.css";
import { ShiftReasonForm, type ShiftReason } from "./ShiftReasonForm";

/** The pages a structure is edited on: leaving them ends the editing session. */
const EDITING_VIEWS = new Set(["project-structure", "project-current-work", "project-gantt"]);
/** A pause this long ends the session too; a little past the server's 30 minutes, so the server agrees. */
const IDLE_MS = 30 * 60_000 + 5_000;
/** A question that could not be fetched is tried again after this long. */
const RETRY_MS = 60_000;
/** The server takes at most this many sessions to mark, and checkpoints to name, in one request. */
const REVIEW_CHUNK = 100;
const CHECKPOINT_CHUNK = 500;

const key = (sessionId: string, checkpointId: string) => `${sessionId}:${checkpointId}`;
const chunks = <T,>(items: T[], size: number) => Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
const projectPath = (projectId: string) => `/api/projects/${encodeURIComponent(projectId)}/schedule-shifts`;

/** Waits until the page's structure saves and their answers are done, so their sessions are known. */
function structureSettled() {
  if (!structureActive()) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const stop = onStructureIdle(() => {
      stop();
      resolve();
    });
  });
}

/**
 * Asks why milestones and goals moved past their baseline once an editing
 * session ends, not after each save: when the person leaves the Structure,
 * Current work or Gantt, switches project, pauses for 30 minutes, or comes back
 * to the project in a new tab. Each checkpoint shows its net move over the
 * session; one that went and came back is not asked about. One reason goes to
 * the checkpoints ticked; "without a reason" leaves the rest as they are, which
 * the Status page shows. Projects' questions wait their turn; one that could
 * not be fetched is tried again.
 */
export function ShiftReasonPrompt() {
  const { t, formatters } = useI18n();
  const ctx = usePageContext();
  const [queue, setQueue] = useState<Pending[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const pending = queue[0] ?? null;
  const userId = (ctx.currentUser?.id as string | undefined) ?? null;
  useEffect(() => setShiftSessionUser(userId), [userId]);

  const retries = useRef(new Map<string, number>());
  // Sessions this tab finished asking about: an answer read before that does not bring them back.
  const reviewed = useRef(new Set<string>());
  // A question to fetch again: set by the retry timer or the button, fetched by an effect. Coming back to a project is redone whole.
  const [retry, setRetry] = useState<{ projectId: string; kind: "ask" | "enter"; at: number } | null>(null);
  const [askFailed, setAskFailed] = useState<{ projectId: string; kind: "ask" | "enter" } | null>(null);
  const server: SessionServer = {
    pending: (id) => apiClient.get<PendingAnswer>(`${projectPath(id)}/pending`),
    close: (id, sessionId, body) => apiClient.post<{ closed: boolean }>(`${projectPath(id)}/sessions/${encodeURIComponent(sessionId)}/close`, body),
  };
  const tab = { settled: structureSettled, owns: (id: string, sessionId: string) => Boolean(editedShiftSessions(id)?.sessionIds.has(sessionId)) };

  // Reads the person's finished sessions of the project still to be asked about (or comes back to the project), and queues them.
  const ask = useEffectEvent(async (projectId: string, kind: "ask" | "enter") => {
    try {
      const answer = kind === "enter" ? await enterProject(projectId, server, tab) : await server.pending(projectId);
      shiftSessionsAsked(projectId);
      window.clearTimeout(retries.current.get(projectId));
      retries.current.delete(projectId);
      setAskFailed((current) => (current?.projectId === projectId ? null : current));
      const finished = reviewed.current;
      setQueue((current) => mergePending(current, answer, finished));
    } catch {
      // Still to be asked: tried again in a while, and said so.
      setAskFailed({ projectId, kind });
      window.clearTimeout(retries.current.get(projectId));
      retries.current.set(projectId, window.setTimeout(() => setRetry({ projectId, kind, at: Date.now() }), RETRY_MS));
    }
  });
  // Ends the sessions this tab took part in, once its saves are answered, then asks.
  const end = useEffectEvent(async (projectId: string, mode: "leave" | "idle") => {
    await structureSettled();
    const sessionIds = takeShiftSessions(projectId);
    const { keep } = await closeSessions(projectId, sessionIds, mode, server, (failure) => failure instanceof ApiError && failure.status === 404);
    if (keep.length > 0) restoreShiftSessions(projectId, keep);
    if (shiftSessionsToAsk(projectId)) await ask(projectId, "ask");
  });

  useEffect(() => {
    if (retry) queueMicrotask(() => void ask(retry.projectId, retry.kind));
  }, [retry]);

  // Leaving the editing pages or the project ends the session; entering a project asks about the person's earlier ones.
  const previous = useRef<{ projectId: string | null; view: string } | null>(null);
  const projectId = (ctx.selectedProjectId as string | null) ?? null;
  const view = String(ctx.activeView);
  useEffect(() => {
    if (!userId) return;
    const before = previous.current;
    previous.current = { projectId, view };
    if (before?.projectId && (before.projectId !== projectId || (EDITING_VIEWS.has(before.view) && !EDITING_VIEWS.has(view)))) {
      void end(before.projectId, "leave");
    }
    if (projectId && before?.projectId !== projectId && !editedShiftSessions(projectId)) void ask(projectId, "enter");
  }, [projectId, view, userId]);

  // A pause of 30 minutes after this tab's last save in a project ends its session there.
  useEffect(() => {
    const timers = new Map<string, number>();
    const pendingRetries = retries.current;
    const stop = onShiftSession((edited) => {
      window.clearTimeout(timers.get(edited));
      timers.set(edited, window.setTimeout(() => {
        timers.delete(edited);
        void end(edited, "idle");
      }, IDLE_MS));
    });
    return () => {
      stop();
      for (const timer of timers.values()) window.clearTimeout(timer);
      for (const timer of pendingRetries.values()) window.clearTimeout(timer);
    };
  }, []);

  // The next question's checkpoints are all ticked when it comes up.
  const shownProject = pending?.projectId ?? null;
  const shownSessions = pending?.sessions.map((session) => session.id).join() ?? "";
  const [ticked, setTicked] = useState<string | null>(null);
  if (pending && ticked !== `${shownProject}|${shownSessions}`) {
    setTicked(`${shownProject}|${shownSessions}`);
    setChosen(new Set(pending.sessions.flatMap((session) => session.steps.map((step) => key(session.id, step.checkpointId)))));
  }

  // Marks the question's sessions looked at, in parts the server takes, and moves on to the next project's.
  const finish = async (current: Pending) => {
    try {
      for (const part of chunks(current.sessions.map((session) => session.id), REVIEW_CHUNK)) {
        await apiClient.post(`${projectPath(current.projectId)}/sessions/review`, { sessionIds: part });
      }
      setError("");
      for (const session of current.sessions) reviewed.current.add(session.id);
      setQueue((items) => withoutShown(items, current));
      return true;
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.shifts.reasonFailed"));
      return false;
    }
  };

  if (!pending) {
    if (saved) {
      return (
        <aside className="shift-reason-prompt" role="status">
          <span>{t("ui.shifts.reasonSaved")}</span>
          <button aria-label={t("ui.shifts.reasonCancel")} className="shift-reason-close" onClick={() => setSaved(false)} type="button">
            <X size={14} />
          </button>
        </aside>
      );
    }
    if (!askFailed) return null;
    return (
      <aside className="shift-reason-prompt" role="status">
        <span>{t("ui.shifts.sessionAskFailed")}</span>
        <button onClick={() => setRetry({ ...askFailed, at: Date.now() })} type="button">
          {t("ui.shifts.sessionAskRetry")}
        </button>
      </aside>
    );
  }
  const shown = pending.sessions.flatMap((session) => session.steps.map((step) => ({ session, step })));
  const picked = shown.filter(({ session, step }) => chosen.has(key(session.id, step.checkpointId)));
  const pickedNotes = [...new Set(picked.flatMap(({ step }) => step.notes))];
  const submit = async (reason: ShiftReason) => {
    const bySession = new Map<string, string[]>();
    for (const { session, step } of picked) bySession.set(session.id, [...(bySession.get(session.id) ?? []), step.checkpointId]);
    let remaining = pending;
    try {
      for (const [sessionId, checkpointIds] of bySession) {
        for (const part of chunks(checkpointIds, CHECKPOINT_CHUNK)) {
          await apiClient.patch(`${projectPath(pending.projectId)}/reason`, { sessionId, checkpointIds: part, ...reason }, t("ui.shifts.reasonFailed"));
          // What got its reason leaves the list; a failure later keeps the rest.
          remaining = {
            ...remaining,
            sessions: remaining.sessions.map((session) => (session.id === sessionId ? { ...session, steps: session.steps.filter((step) => !part.includes(step.checkpointId)) } : session)),
          };
        }
      }
    } finally {
      if (remaining !== pending) {
        const updated = remaining;
        setQueue((items) => items.map((entry) => (entry === pending ? updated : entry)));
        window.dispatchEvent(new CustomEvent(SCHEDULE_SHIFTS_CHANGED_EVENT));
      }
    }
    if (remaining.sessions.every((session) => session.steps.length === 0) && (await finish(remaining))) setSaved(true);
  };
  const days = (value: number | null) => (value === null ? t("ui.shifts.dateSet") : formatters.signedDaysLabel(value));
  return (
    <aside aria-labelledby="shift-reason-title" className="shift-reason-prompt" role="dialog">
      <div className="shift-reason-head">
        <strong id="shift-reason-title">{t("ui.shifts.sessionPromptTitle")}</strong>
        <button aria-label={t("ui.shifts.reasonSkip")} className="shift-reason-close" onClick={() => void finish(pending)} type="button">
          <X size={14} />
        </button>
      </div>
      {pending.sessions.filter((session) => session.steps.length > 0).map((session) => (
        <section className="shift-reason-session" key={session.id}>
          {pending.sessions.length > 1 && (
            <small>{t("ui.shifts.sessionWhen", { from: formatters.dateTime(session.startedAt), to: formatters.dateTime(session.endedAt) })}</small>
          )}
          <ul className="shift-reason-list">
            {session.steps.map((step) => {
              const id = key(session.id, step.checkpointId);
              return (
                <li key={id}>
                  <label>
                    <input
                      aria-label={t("ui.shifts.sessionApply", { title: `${step.code} ${step.title}` })}
                      checked={chosen.has(id)}
                      onChange={(event) => setChosen((current) => {
                        const next = new Set(current);
                        if (event.target.checked) next.add(id);
                        else next.delete(id);
                        return next;
                      })}
                      type="checkbox"
                    />{" "}
                    {step.code} {step.title}:{" "}
                    <strong className="late">{days(step.deltaDays)}</strong>{" "}
                    {t("ui.shifts.pastBaseline", { baseline: formatters.date(step.baselineDate), date: formatters.date(step.newDate) })}
                  </label>
                  {step.notes.length > 0 && pickedNotes.length > 1 && <small> {t("ui.shifts.sessionNotes", { notes: step.notes.join("; ") })}</small>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
      <ShiftReasonForm
        cancelLabel={t("ui.shifts.reasonSkip")}
        initial={pickedNotes.length === 1 ? { category: "", text: pickedNotes[0]!, raidItemId: null } : null}
        key={shown.map(({ session, step }) => key(session.id, step.checkpointId)).join()}
        onCancel={() => void finish(pending)}
        onDone={() => undefined}
        onSubmit={async (reason) => {
          if (picked.length === 0) return;
          await submit(reason);
        }}
        projectId={pending.projectId}
        risks={pending.risks}
      />
    </aside>
  );
}
