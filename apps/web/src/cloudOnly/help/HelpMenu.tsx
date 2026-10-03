import { PUBLIC_DEMO_USER_ID } from "@pms/shared";
import { LifeBuoy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import type { CurrentUser } from "../../app/adminTypes";
import { RELEASE_NOTES } from "./releaseNotes";
import { useHelpText } from "./texts";
import "./help.css";

type Report = {
  id: string;
  createdAt: string;
  author: string;
  message: string;
  page: string | null;
  status: "OPEN" | "DONE";
  statusChangedBy: string | null;
};

const latestNote = RELEASE_NOTES[0]?.date ?? "";
const seenKey = (user: CurrentUser) => `pms-whats-new-seen:${user.id === PUBLIC_DEMO_USER_ID ? "demo" : user.id}`;

/**
 * The help button of the cloud build: what's new, reporting a problem and, for
 * administrators, the reports people sent. A dot marks release notes not yet
 * read in this browser.
 */
export function HelpMenu({ user }: { user: CurrentUser }) {
  const { locale, text } = useHelpText();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"menu" | "news" | "report" | "reports">("menu");
  const [seen, setSeen] = useState(() => window.localStorage.getItem(seenKey(user)) ?? "");
  const [openCount, setOpenCount] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAdmin = user.role === "ADMIN";
  const canReport = user.id !== PUBLIC_DEMO_USER_ID;
  const unreadNews = latestNote > seen;

  const loadCount = useCallback(() => {
    if (!isAdmin) return;
    apiClient
      .get<{ openCount: number }>("/api/problem-reports")
      .then((answer) => setOpenCount(answer.openCount))
      .catch(() => undefined);
  }, [isAdmin]);

  useEffect(() => loadCount(), [loadCount]);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);

  const openNews = () => {
    setView("news");
    window.localStorage.setItem(seenKey(user), latestNote);
    setSeen(latestNote);
  };

  return (
    <div className="help-menu" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-label={text("menu")}
        className="notifications-bell-button"
        onClick={() => {
          setOpen((value) => !value);
          setView("menu");
        }}
        title={text("menu")}
        type="button"
      >
        <LifeBuoy aria-hidden="true" size={17} />
        {(unreadNews || openCount > 0) && <span className="help-menu-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="notifications-panel help-panel" role="dialog" aria-label={text("menu")}>
          {view === "menu" && (
            <ul className="help-menu-items">
              <li>
                <button type="button" onClick={openNews}>
                  {text("whatsNew")}
                  {unreadNews && <span className="help-menu-dot inline" aria-hidden="true" />}
                </button>
              </li>
              {canReport && (
                <li>
                  <button type="button" onClick={() => setView("report")}>
                    {text("report")}
                  </button>
                </li>
              )}
              {isAdmin && (
                <li>
                  <button type="button" onClick={() => setView("reports")}>
                    {text("reports")} {openCount > 0 && <span className="notifications-bell-count inline">{openCount}</span>}
                  </button>
                </li>
              )}
            </ul>
          )}
          {view !== "menu" && (
            <div className="notifications-panel-head">
              <strong>{text(view === "news" ? "whatsNew" : view === "report" ? "report" : "reports")}</strong>
              <button className="link-button" onClick={() => setView("menu")} type="button">
                {text("back")}
              </button>
            </div>
          )}
          {view === "news" && (
            <div className="help-news">
              {RELEASE_NOTES.map((note) => (
                <section key={note.date}>
                  <time dateTime={note.date}>{new Date(`${note.date}T00:00:00`).toLocaleDateString(locale === "en" ? "en-GB" : "ru-RU")}</time>
                  <h4>{note[locale === "en" ? "en" : "ru"].title}</h4>
                  <ul>
                    {note[locale === "en" ? "en" : "ru"].points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
          {view === "report" && <ReportForm />}
          {view === "reports" && <ReportList onCount={setOpenCount} />}
        </div>
      )}
    </div>
  );
}

function ReportForm() {
  const { locale, text } = useHelpText();
  const [message, setMessage] = useState("");
  const [attach, setAttach] = useState(true);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (message.trim().length < 10) {
      setError(text("tooShort"));
      return;
    }
    setState("sending");
    setError(null);
    try {
      await apiClient.post(
        "/api/problem-reports",
        {
          message: message.trim(),
          ...(attach ? { page: window.location.pathname.slice(0, 300), context: { viewport: `${window.innerWidth}x${window.innerHeight}`, locale } } : {}),
        },
        text("failed"),
      );
      setState("sent");
    } catch (sendError) {
      setState("idle");
      setError(sendError instanceof Error ? sendError.message : text("failed"));
    }
  };

  if (state === "sent") return <p className="help-sent">{text("sent")}</p>;
  return (
    <div className="help-report">
      <p>{text("reportHint")}</p>
      <textarea aria-label={text("report")} autoFocus maxLength={4000} onChange={(event) => setMessage(event.target.value)} rows={5} value={message} />
      <label className="help-attach">
        <input checked={attach} onChange={(event) => setAttach(event.target.checked)} type="checkbox" />
        {text("attach")}
      </label>
      {error && <p className="help-error" role="alert">{error}</p>}
      <button disabled={state === "sending"} onClick={() => void send()} type="button">
        {state === "sending" ? text("sending") : text("send")}
      </button>
    </div>
  );
}

function ReportList({ onCount }: { onCount: (count: number) => void }) {
  const { locale, text } = useHelpText();
  const [items, setItems] = useState<Report[]>([]);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    apiClient
      .get<{ items: Report[]; openCount: number }>(`/api/problem-reports${all ? "?status=all" : ""}`)
      .then((answer) => {
        setItems(answer.items);
        onCount(answer.openCount);
      })
      .catch(() => undefined);
  }, [all, onCount]);

  useEffect(() => load(), [load]);

  const setStatus = async (id: string, status: "OPEN" | "DONE") => {
    await apiClient.patch(`/api/problem-reports/${id}`, { status }).catch(() => undefined);
    load();
  };

  return (
    <div className="help-reports">
      <button className="link-button" onClick={() => setAll((value) => !value)} type="button">
        {all ? text("showOpen") : text("showAll")}
      </button>
      {items.length === 0 ? (
        <p className="notifications-empty">{text("noReports")}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li className={item.status === "DONE" ? "done" : ""} key={item.id}>
              <div className="help-report-meta">
                <strong>{item.author}</strong>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale === "en" ? "en-GB" : "ru-RU")}</time>
              </div>
              <p>{item.message}</p>
              {item.page && <code>{item.page}</code>}
              <div className="help-report-actions">
                {item.status === "DONE" && item.statusChangedBy && (
                  <span>
                    {text("resolvedBy")}: {item.statusChangedBy}
                  </span>
                )}
                <button onClick={() => void setStatus(item.id, item.status === "DONE" ? "OPEN" : "DONE")} type="button">
                  {item.status === "DONE" ? text("reopen") : text("done")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
