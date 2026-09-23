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
    auditEvents,
    dateTime,
    reloadAuditEvents,
    restoreWbsTombstone,
  } = ctx;

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <p>{uiText("ui.admin.recentSystemEvents")}</p>
                      </div>
                      <button type="button" onClick={() => void reloadAuditEvents()}>
                        {uiText("ui.admin.refresh")}
                      </button>
                    </div>
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
                          {uiText("ui.admin.noAuditEvents")}
                        </div>
                      )}
                    </div>
                  </article>
              );
}
