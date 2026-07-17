import { usePageContext } from "./PageContext";

export function AdminHealthPageContent() {
  const { adminHealth, dateTime, reloadAdminHealth } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>Техническое состояние приложения и подключений</p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminHealth()}>
                      Обновить
                    </button>
                  </div>
                  <div className="admin-status-grid">
                    <div className="metric-card">
                      <span>API</span>
                      <b>{adminHealth?.ok ? "В норме" : "Ошибка"}</b>
                      <small>Запущен: {dateTime(adminHealth?.startedAt ?? null)}</small>
                    </div>
                    <div className="metric-card">
                      <span>База данных</span>
                      <b>{adminHealth?.database ?? "неизвестно"}</b>
                      <small>Latency: {adminHealth?.databaseLatencyMs ?? 0} мс</small>
                    </div>
                    <div className="metric-card">
                      <span>Окружение</span>
                      <b>{adminHealth?.nodeEnv ?? "development"}</b>
                      <small>Uptime: {adminHealth?.uptimeSeconds ?? 0} сек.</small>
                    </div>
                  </div>
                </article>
              );
}

export function AdminBackupsPageContent() {
  const { backupStatus, dateTime, fileSize, reloadAdminHealth } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>Состояние каталога backup и последнего архивного файла</p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminHealth()}>
                      Обновить
                    </button>
                  </div>
                  <div className="admin-status-grid">
                    <div className="metric-card span-2">
                      <span>Каталог backup</span>
                      <b>{backupStatus?.backupDir ?? "не задан"}</b>
                      <small>{backupStatus?.message ?? "Нет данных"}</small>
                    </div>
                    <div className="metric-card">
                      <span>Файлы</span>
                      <b>{backupStatus?.totalBackups ?? 0}</b>
                      <small>Retention: {backupStatus?.retentionDays ?? 0} дн.</small>
                    </div>
                    <div className="metric-card">
                      <span>Последний backup</span>
                      <b>{backupStatus?.latestBackup?.file ?? "не найден"}</b>
                      <small>
                        {backupStatus?.latestBackup
                          ? `${dateTime(backupStatus.latestBackup.updatedAt)} / ${fileSize(
                              backupStatus.latestBackup.sizeBytes,
                            )}`
                          : "Файл отсутствует"}
                      </small>
                    </div>
                    <div className="metric-card span-2">
                      <span>Checksum</span>
                      <b>{backupStatus?.latestChecksum ?? "не найден"}</b>
                      <small>Restore выполняется ops-скриптом с RESTORE_CONFIRM=yes</small>
                    </div>
                  </div>
                </article>
              );
}

export function AdminConfigPageContent() {
  const { configTransferText, exportAdminConfig, importAdminConfig, importingConfig, setConfigTransferText } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>Перенос ролей, справочников и системных настроек между средами</p>
                    </div>
                    <div className="panel-title-actions">
                      <button type="button" onClick={() => void exportAdminConfig()}>
                        Экспортировать
                      </button>
                      <button
                        type="button"
                        onClick={() => void importAdminConfig()}
                        disabled={importingConfig || !configTransferText.trim()}
                      >
                        {importingConfig ? "Импортирую..." : "Импортировать"}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="admin-config-textarea"
                    value={configTransferText}
                    onChange={(event) => setConfigTransferText(event.target.value)}
                    placeholder="JSON конфигурации"
                  />
                </article>
              );
}
