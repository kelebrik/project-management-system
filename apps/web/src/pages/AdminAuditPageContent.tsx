import { usePageContext } from "./PageContext";

export function AdminAuditPageContent() {
  const ctx = usePageContext();
  const {
    auditActionLabel,
    auditEvents,
    auditObjectLabel,
    dateTime,
    reloadAuditEvents,
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
                        <div className="audit-row" key={event.id}>
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
