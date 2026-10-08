import { useMemo, useState, type FormEvent } from "react";
import { emptyAuditFilters, useAuditLog, type AuditFilters } from "../hooks/useAuditLog";
import { auditLabelCatalog } from "../i18n/auditLabels";
import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

function auditChangeText(value: string | null | undefined, notSet: string) {
  if (!value) return notSet;
  return value.length > 120 ? `${value.slice(0, 117)}...` : value;
}

function canRestoreTombstone(event: { wbsTombstone?: { restoredAt: string | null; expiresAt: string } | null }) {
  const tombstone = event.wbsTombstone;
  return Boolean(
    tombstone &&
      !tombstone.restoredAt &&
      new Date(tombstone.expiresAt).getTime() > Date.now(),
  );
}

export function AdminAuditPageContent() {
  const {
    t: uiText,
    labels: { auditActionLabel, auditFieldLabel, auditObjectLabel },
  } = useInterfaceTranslation();
  const ctx = usePageContext();
  const {
    dateTime,
    reloadAuditEvents,
    restoreWbsTombstone,
  } = ctx;
  const projects: Array<{ id: string; code: string; name: string }> = ctx.projects ?? [];
  const journal = useAuditLog(ctx.auditEvents, reloadAuditEvents);
  const auditEvents = journal.events;
  const [draft, setDraft] = useState<AuditFilters>(emptyAuditFilters);
  const actionOptions = useMemo(
    () => Object.keys(auditLabelCatalog.actions)
      .map((action) => ({ action, label: auditActionLabel(action) }))
      .sort((left, right) => left.label.localeCompare(right.label)),
    [auditActionLabel],
  );
  const updateDraft = (patch: Partial<AuditFilters>) => setDraft((current) => ({ ...current, ...patch }));
  const submitFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void journal.applyFilters(draft);
  };
  const resetFilters = () => {
    setDraft(emptyAuditFilters);
    void journal.applyFilters(emptyAuditFilters);
  };

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <p>{uiText("ui.admin.recentSystemEvents")}</p>
                      </div>
                      <button type="button" onClick={() => void journal.refresh()} disabled={journal.loading}>
                        {uiText("ui.admin.refresh")}
                      </button>
                    </div>
                    <form className="audit-filters" onSubmit={submitFilters} aria-label={uiText("ui.admin.auditFilters")}>
                      <label>
                        {uiText("ui.admin.auditFrom")}
                        <input type="date" value={draft.from} max={draft.to || undefined} onChange={(event) => updateDraft({ from: event.target.value })} />
                      </label>
                      <label>
                        {uiText("ui.admin.auditTo")}
                        <input type="date" value={draft.to} min={draft.from || undefined} onChange={(event) => updateDraft({ to: event.target.value })} />
                      </label>
                      <label>
                        {uiText("ui.admin.auditProject")}
                        <select value={draft.projectId} onChange={(event) => updateDraft({ projectId: event.target.value })}>
                          <option value="">{uiText("ui.admin.auditAll")}</option>
                          {projects.map((project) => (
                            <option value={project.id} key={project.id}>{project.code} · {project.name}</option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {uiText("ui.admin.user")}
                        <input value={draft.actor} placeholder={uiText("ui.admin.auditActorPlaceholder")} onChange={(event) => updateDraft({ actor: event.target.value })} />
                      </label>
                      <label>
                        {uiText("ui.admin.action")}
                        <select value={draft.action} onChange={(event) => updateDraft({ action: event.target.value })}>
                          <option value="">{uiText("ui.admin.auditAll")}</option>
                          {actionOptions.map((option) => (
                            <option value={option.action} key={option.action}>{option.label}</option>
                          ))}
                        </select>
                      </label>
                      <div className="audit-filter-actions">
                        <button type="submit" className="primary" disabled={journal.loading}>{uiText("ui.admin.auditApply")}</button>
                        <button type="button" onClick={resetFilters} disabled={journal.loading}>{uiText("ui.admin.auditReset")}</button>
                      </div>
                    </form>
                    {journal.error && <p className="form-error" role="alert">{journal.error}</p>}
                    <div className="audit-table">
                      <div className="audit-head">
                        <span>{uiText("ui.admin.time")}</span>
                        <span>{uiText("ui.admin.action")}</span>
                        <span>{uiText("ui.admin.user")}</span>
                        <span>{uiText("ui.admin.object")}</span>
                        <span>IP</span>
                      </div>
                      {auditEvents.map((event) => (
                        <div className="audit-entry" key={event.id}>
                          <div className="audit-row">
                            <span>{dateTime(event.createdAt)}</span>
                            <strong>{auditActionLabel(event.action)}</strong>
                            <span>
                              {event.actorName || event.actorEmail || uiText("ui.admin.system")}
                            </span>
                            <span>
                              {auditObjectLabel(event)}
                              {event.objectId ? `: ${event.objectId}` : ""}
                            </span>
                            <span>{event.ipAddress || uiText("ui.admin.notSetNeuter")}</span>
                          </div>
                          {event.changes && event.changes.length > 0 && (
                            <div className="audit-changes">
                              {event.changes.map((change) => (
                                <span className="audit-change" key={change.id}>
                                  <b>{auditFieldLabel(change.field)}</b>
                                  <em>{auditChangeText(change.oldText, uiText("ui.admin.notSetNeuter"))}</em>
                                  <i aria-hidden="true">-&gt;</i>
                                  <em>{auditChangeText(change.newText, uiText("ui.admin.notSetNeuter"))}</em>
                                </span>
                              ))}
                            </div>
                          )}
                          {event.wbsTombstone && (
                            <div className="audit-tombstone">
                              <span>
                                {event.wbsTombstone.restoredAt
                                  ? uiText("ui.admin.tombstoneRestored", { date: dateTime(event.wbsTombstone.restoredAt) })
                                  : uiText("ui.admin.tombstoneDeleted", {
                                      count: event.wbsTombstone.itemCount,
                                      date: dateTime(event.wbsTombstone.expiresAt),
                                    })}
                              </span>
                              {canRestoreTombstone(event) && (
                                <button
                                  type="button"
                                  onClick={() => void restoreWbsTombstone(event.wbsTombstone!.id)}
                                >
                                  {uiText("ui.admin.restore")}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {auditEvents.length === 0 && (
                        <div className="empty-state">
                          {uiText(journal.filtered ? "ui.admin.noFilteredAuditEvents" : "ui.admin.noAuditEvents")}
                        </div>
                      )}
                    </div>
                    {auditEvents.length > 0 && (
                      <div className="audit-more">
                        <span>{uiText("ui.admin.auditShown", { count: auditEvents.length })}</span>
                        {journal.hasMore && (
                          <button type="button" onClick={() => void journal.loadMore()} disabled={journal.loading}>
                            {uiText("ui.admin.auditLoadMore")}
                          </button>
                        )}
                      </div>
                    )}
                  </article>
              );
}
