import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { apiClient } from "../../api/client";
import { isInternalHref, notificationText, type NotificationItem } from "../../app/automationRules";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/automation-rules.css";

const POLL_MS = 60_000;

/** Moves inside the application the way the browser's back and forward do, so the route and project follow the path. */
function openInApp(href: string) {
  if (!isInternalHref(href)) return;
  window.history.pushState(null, "", href);
  window.dispatchEvent(new PopStateEvent("popstate"));
  if (href.includes("#")) window.dispatchEvent(new HashChangeEvent("hashchange"));
}

/** The bell in the header: what the project rules told this person. Checked every minute while the tab is visible. */
export function NotificationsBell() {
  const { t, formatters } = useI18n();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    apiClient
      .get<{ items: NotificationItem[]; unread: number }>("/api/notifications")
      .then((answer) => {
        setItems(answer.items);
        setUnread(answer.unread);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let timer: number | undefined;
    const schedule = () => {
      window.clearTimeout(timer);
      if (document.visibilityState !== "visible") return;
      timer = window.setTimeout(() => {
        load();
        schedule();
      }, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
      schedule();
    };
    load();
    schedule();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load]);

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

  const markRead = async (body: { ids: string[] } | { all: true }) => {
    await apiClient.post("/api/notifications/read", body).catch(() => undefined);
    load();
  };
  const follow = (item: NotificationItem) => {
    setOpen(false);
    if (!item.readAt) void markRead({ ids: [item.id] });
    openInApp(item.href);
  };

  return (
    <div className="notifications-bell" ref={rootRef}>
      <button aria-expanded={open} aria-label={unread > 0 ? t("ui.bell.unread", { count: unread }) : t("ui.bell.label")} className="notifications-bell-button" onClick={() => setOpen((value) => !value)} type="button">
        <Bell aria-hidden="true" size={17} />
        {unread > 0 && <span className="notifications-bell-count">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="notifications-panel" role="dialog" aria-label={t("ui.bell.label")}>
          <div className="notifications-panel-head">
            <strong>{t("ui.bell.label")}</strong>
            {unread > 0 && (
              <button className="link-button" onClick={() => void markRead({ all: true })} type="button">
                {t("ui.bell.readAll")}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="notifications-empty">{t("ui.bell.empty")}</p>
          ) : (
            <ul>
              {items.map((item) => (
                <li className={item.readAt ? "" : "unread"} key={item.id}>
                  <button onClick={() => follow(item)} type="button">
                    <span className="notifications-project">{item.params.projectCode}</span>
                    <span>{notificationText(item.params, t, (value) => formatters.date(value))}</span>
                    <time dateTime={item.createdAt}>{formatters.date(item.createdAt)}</time>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
