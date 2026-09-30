import { X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import { daysOffSummary, linkLabel, type DateDriverLink, type DateDrivers } from "../../app/dateDrivers";
import { useOpenFactRef } from "../../hooks/useOpenFactRef";
import { useI18n } from "../../i18n/I18nProvider";

/**
 * What holds a row's dates: the link that sets the start or the finish, the
 * other links that do not, the duration and the days off it spans, the
 * children of a summary row, or a date set by hand.
 */
export function DateDriversPopover({ itemId, anchor, onClose }: { itemId: string; anchor: HTMLElement | null; onClose: () => void }) {
  const { t, formatters } = useI18n();
  const openRef = useOpenFactRef();
  const [drivers, setDrivers] = useState<DateDrivers | null>(null);
  const [error, setError] = useState("");
  const panelRef = useRef<HTMLDivElement | null>(null);
  // Placed over the page next to the value, so table cells do not clip it.
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor?.getBoundingClientRect();
      if (!rect) return;
      const width = panelRef.current?.offsetWidth ?? 380;
      setPosition({ top: rect.bottom + 4, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)) });
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [anchor, drivers]);

  useEffect(() => {
    let active = true;
    apiClient
      .get<DateDrivers>(`/api/wbs-items/${encodeURIComponent(itemId)}/date-drivers`, t("ui.drivers.failed"))
      .then((answer) => active && setDrivers(answer))
      .catch((failure) => active && setError(failure instanceof Error ? failure.message : t("ui.drivers.failed")));
    return () => {
      active = false;
    };
  }, [itemId, t]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    const onPointer = (event: PointerEvent) =>
      panelRef.current && !panelRef.current.contains(event.target as Node) && !anchor?.contains(event.target as Node) && onClose();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    panelRef.current?.focus();
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [anchor, onClose]);

  const linkRow = (link: DateDriverLink) => (
    <li className={link.binding ? "binding" : ""} key={`${link.predecessorId}-${link.type}`}>
      <button
        className="link-button"
        onClick={() => {
          onClose();
          openRef({ kind: "wbs", id: link.predecessorId, label: link.code });
        }}
        type="button"
      >
        {link.code} {link.title}
      </button>{" "}
      <span className="date-driver-meta">
        ({linkLabel(link)}) → {formatters.date(link.date)}
        {link.binding ? ` · ${t("ui.drivers.sets")}` : ""}
      </span>
    </li>
  );

  const offs = drivers ? daysOffSummary(drivers.finish.daysOff) : null;
  return createPortal(
    <div aria-label={t("ui.drivers.title")} className="date-drivers-popover" ref={panelRef} role="dialog" style={position} tabIndex={-1}>
      <div className="date-drivers-head">
        <strong>{t("ui.drivers.title")}</strong>
        <button aria-label={t("ui.drivers.close")} className="date-drivers-close" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </div>
      {error && <p className="automation-error">{error}</p>}
      {!drivers && !error && <p>{t("ui.drivers.loading")}</p>}
      {drivers && (
        <>
          <section>
            <h4>
              {drivers.kind === "CHECKPOINT" ? t("ui.drivers.date") : t("ui.drivers.start")}: {formatters.date(drivers.kind === "CHECKPOINT" ? drivers.dueDate : drivers.startDate)}
            </h4>
            <p>{t(`ui.drivers.setBy.${drivers.start.setBy}`)}</p>
            {drivers.children?.earliest && drivers.kind === "SUMMARY" && (
              <p>
                {t("ui.drivers.earliestChild")} {drivers.children.earliest.code} {drivers.children.earliest.title} — {formatters.date(drivers.children.earliest.date)}
              </p>
            )}
            {drivers.start.links.length > 0 && <ul className="date-driver-links">{drivers.start.links.map(linkRow)}</ul>}
          </section>
          {drivers.kind !== "CHECKPOINT" && (
            <section>
              <h4>
                {t("ui.drivers.finish")}: {formatters.date(drivers.dueDate)}
              </h4>
              <p>
                {drivers.finish.setBy === "DURATION"
                  ? t("ui.drivers.duration", { days: drivers.finish.durationWorkDays ?? 0 })
                  : t(`ui.drivers.setBy.${drivers.finish.setBy}`)}
              </p>
              {drivers.children?.latest && drivers.kind === "SUMMARY" && (
                <p>
                  {t("ui.drivers.latestChild")} {drivers.children.latest.code} {drivers.children.latest.title} — {formatters.date(drivers.children.latest.date)}
                </p>
              )}
              {drivers.finish.links.length > 0 && <ul className="date-driver-links">{drivers.finish.links.map(linkRow)}</ul>}
              {offs && drivers.finish.daysOff.count > 0 && (
                <p className="date-driver-daysoff">
                  {t("ui.drivers.daysOff", { weekends: offs.weekends, holidays: offs.other })}
                  {offs.holidays.length > 0 &&
                    `: ${offs.holidays.map((entry) => `${formatters.date(entry.date)}${entry.description ? ` (${entry.description})` : ""}`).join(", ")}`}
                </p>
              )}
            </section>
          )}
          {!drivers.consistent && <p className="automation-warning">{t("ui.drivers.inconsistent")}</p>}
        </>
      )}
    </div>,
    document.body,
  );
}
