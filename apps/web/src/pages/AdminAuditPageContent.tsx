import { usePageContext } from "./PageContext";

function auditChangeText(value: string | null | undefined) {
  if (!value) return "не задано";
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
  const ctx = usePageContext();
  const {
    auditActionLabel,
    auditEvents,
    auditFieldLabel,
    auditObjectLabel,
    dateTime,
    reloadAuditEvents,
    restoreWbsTombstone,
  } = ctx;

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <p>Последние системные события и изменения данных</p>
                      </div>
                      <button type="button" onClick={() => void reloadAuditEvents()}>
                        Обновить
                      </button>
                    </div>
                    <div className="audit-table">
                      <div className="audit-head">
                        <span>Время</span>
                        <span>Действие</span>
                        <span>Пользователь</span>
                        <span>Объект</span>
                        <span>IP</span>
                      </div>
                      {auditEvents.map((event) => (
                        <div className="audit-entry" key={event.id}>
                          <div className="audit-row">
                            <span>{dateTime(event.createdAt)}</span>
                            <strong>{auditActionLabel(event.action)}</strong>
                            <span>
                              {event.actorName || event.actorEmail || "Система"}
                            </span>
                            <span>
                              {auditObjectLabel(event)}
                              {event.objectId ? `: ${event.objectId}` : ""}
                            </span>
                            <span>{event.ipAddress || "не задано"}</span>
                          </div>
                          {event.changes && event.changes.length > 0 && (
                            <div className="audit-changes">
                              {event.changes.map((change) => (
                                <span className="audit-change" key={change.id}>
                                  <b>{auditFieldLabel(change.field)}</b>
                                  <em>{auditChangeText(change.oldText)}</em>
                                  <i aria-hidden="true">-&gt;</i>
                                  <em>{auditChangeText(change.newText)}</em>
                                </span>
                              ))}
                            </div>
                          )}
                          {event.wbsTombstone && (
                            <div className="audit-tombstone">
                              <span>
                                {event.wbsTombstone.restoredAt
                                  ? `Восстановлено: ${dateTime(event.wbsTombstone.restoredAt)}`
                                  : `Удалено элементов: ${event.wbsTombstone.itemCount}; хранится до ${dateTime(event.wbsTombstone.expiresAt)}`}
                              </span>
                              {canRestoreTombstone(event) && (
                                <button
                                  type="button"
                                  onClick={() => void restoreWbsTombstone(event.wbsTombstone!.id)}
                                >
                                  Восстановить
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                      {auditEvents.length === 0 && (
                        <div className="empty-state">
                          События аудита пока не записаны.
                        </div>
                      )}
                    </div>
                  </article>
              );
}
