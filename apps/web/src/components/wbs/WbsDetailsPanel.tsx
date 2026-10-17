import { X } from "lucide-react";
import { useMemo, type KeyboardEvent, type ReactNode } from "react";
import type { WbsItem, WbsItemStatus } from "../../app/domainTypes";
import type { WbsFormState } from "../../app/formState";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import { ChecklistField } from "../ChecklistField";
import "../../styles/wbs-details.css";

const STATUS_OPTIONS: WbsItemStatus[] = ["NOT_STARTED", "IN_PROGRESS", "IN_REVIEW", "AT_RISK", "BLOCKED", "DONE", "CANCELLED"];

function percent(value: number | null | undefined) {
  return value === null || value === undefined ? null : `${Math.round(value)}%`;
}

/**
 * The card of the chosen task, on the right of the Structure and the Gantt
 * chart: it reads the row's fields and edits the two that change most often,
 * the status and the comment. It stays open while the two views change places.
 */
export function WbsDetailsPanel() {
  const ctx = usePageContext();
  const { t, formatters: { date }, labels: { wbsStatusLabel, wbsTypeLabel } } = useI18n();
  const { project, activeWbsItemId, wbsDrafts, saveWbsDraftPatch, isReadOnly, isClosedProject, setWbsDetailsOpen, fullscreenWorkspaceView } = ctx;
  const item: WbsItem | null = useMemo(
    () => (project?.wbsItems as WbsItem[] | undefined)?.find((row) => row.id === activeWbsItemId) ?? null,
    [project, activeWbsItemId],
  );
  const predecessors: string[] = useMemo(
    () =>
      item
        ? ((project?.wbsDependencies ?? []) as Array<{ successorId: string; predecessor: { code: string } }>)
            .filter((link) => link.successorId === item.id)
            .map((link) => link.predecessor.code)
        : [],
    [project, item],
  );
  const draft: WbsFormState | undefined = item ? (wbsDrafts as Record<string, WbsFormState> | undefined)?.[item.id] : undefined;
  const canEdit = !isReadOnly && !isClosedProject;
  const close = () => {
    setWbsDetailsOpen(false);
    // The focus goes back to the button that opened the card, not to the body.
    document.getElementById("wbs-details-toggle")?.focus();
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      close();
    }
  };
  const span = (from: string | null, to: string | null) => (from || to ? `${from ? date(from) : "…"} — ${to ? date(to) : "…"}` : null);
  const link = (url: string | null) =>
    url ? (
      <a href={url} target="_blank" rel="noreferrer">
        {url.replace(/^https?:\/\//u, "")}
      </a>
    ) : null;
  const field = (label: ReactNode, value: ReactNode, className?: string) => (
    <>
      <dt className={className ? `${className}-label` : undefined}>{label}</dt>
      <dd className={`${className ?? ""} ${value === null || value === undefined || value === "" ? "empty" : ""}`.trim() || undefined}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </dd>
    </>
  );

  return (
    <aside
      className={`wbs-details-panel ${fullscreenWorkspaceView ? "fullscreen" : ""}`.trim()}
      id="wbs-details-panel"
      aria-label={t("structure.cardTitle")}
      data-testid="wbs-details-panel"
      onKeyDown={onKey}
    >
      <div className="wbs-details-head">
        <h3>
          {item ? (
            <>
              <small>{item.code}</small>
              {item.title}
            </>
          ) : (
            t("structure.cardTitle")
          )}
        </h3>
        <button type="button" className="wbs-details-close" aria-label={t("structure.cardClose")} title={t("structure.cardClose")} onClick={close}>
          <X size={16} />
        </button>
      </div>
      <div className="wbs-details-body">
        {!item ? (
          <p className="wbs-details-empty">{t("structure.cardEmpty")}</p>
        ) : (
          <dl className="wbs-details-fields">
            {field(t("structure.card.type"), wbsTypeLabel(item.type))}
            {field(
              t("structure.card.status"),
              canEdit ? (
                <select
                  aria-label={t("structure.card.status")}
                  value={draft?.status ?? item.status}
                  onChange={(event) => saveWbsDraftPatch(item.id, { status: event.target.value as WbsItemStatus }, { silent: true })}
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option value={status} key={status}>
                      {wbsStatusLabel(status)}
                    </option>
                  ))}
                </select>
              ) : (
                wbsStatusLabel(draft?.status ?? item.status)
              ),
            )}
            {field(t("structure.card.owner"), draft?.owner ?? item.owner)}
            {field(t("structure.card.dates"), span(item.startDate, item.dueDate))}
            {field(t("structure.card.baseline"), span(item.baselineStartDate, item.baselineDueDate))}
            {field(t("structure.card.forecast"), span(item.forecastStartDate, item.forecastDueDate))}
            {field(t("structure.card.days"), item.workDays === null && item.calendarDays === null ? null : `${item.workDays ?? "—"} / ${item.calendarDays ?? "—"}`)}
            {field(t("structure.card.progress"), percent(item.progress))}
            {field(t("structure.card.effort"), percent(item.effortPercent))}
            {field(t("structure.card.calendar"), item.calendarCode)}
            {field(t("structure.card.priority"), item.priority)}
            {field(t("structure.card.predecessors"), predecessors.length > 0 ? predecessors.join(", ") : null)}
            {field("Jira", link(item.jiraTicketUrl))}
            {field("Mattermost", link(item.mattermostUrl))}
            {field(t("structure.card.closedAt"), item.closedAt ? date(item.closedAt) : null)}
            {field(t("structure.card.description"), item.description)}
            {field(
              t("structure.card.comment"),
              <ChecklistField
                itemLabel={(text) => t("checklist.item", { text })}
                label={t("structure.card.comment")}
                onCommit={(comment) => saveWbsDraftPatch(item.id, { comment }, { silent: true })}
                placeholder={t("checklist.placeholder")}
                readOnly={!canEdit}
                value={draft?.comment ?? item.comment ?? ""}
              />,
              "wbs-details-comment",
            )}
          </dl>
        )}
      </div>
    </aside>
  );
}
