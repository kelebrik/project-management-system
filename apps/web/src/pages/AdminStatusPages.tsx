import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

export function AdminHealthPageContent() {
  const { t } = useI18n();
  const { adminHealth, dateTime, reloadAdminHealth } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>{t("admin.health.description")}</p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminHealth()}>
                      {t("admin.refresh")}
                    </button>
                  </div>
                  <div className="admin-status-grid">
                    <div className="metric-card">
                      <span>API</span>
                      <b>{adminHealth?.ok ? t("admin.health.ok") : t("admin.health.error")}</b>
                      <small>{t("admin.health.started", { date: dateTime(adminHealth?.startedAt ?? null) })}</small>
                    </div>
                    <div className="metric-card">
                      <span>{t("admin.health.database")}</span>
                      <b>{adminHealth?.database ?? t("admin.health.unknown")}</b>
                      <small>{t("admin.health.latency", { count: adminHealth?.databaseLatencyMs ?? 0 })}</small>
                    </div>
                    <div className="metric-card">
                      <span>{t("admin.health.environment")}</span>
                      <b>{adminHealth?.nodeEnv ?? "development"}</b>
                      <small>{t("admin.health.uptime", { count: adminHealth?.uptimeSeconds ?? 0 })}</small>
                    </div>
                  </div>
                </article>
              );
}

export function AdminBackupsPageContent() {
  const { t } = useI18n();
  const { backupStatus, dateTime, fileSize, reloadAdminHealth } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>{t("admin.backups.description")}</p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminHealth()}>
                      {t("admin.refresh")}
                    </button>
                  </div>
                  <div className="admin-status-grid">
                    <div className="metric-card span-2">
                      <span>{t("admin.backups.directory")}</span>
                      <b>{backupStatus?.backupDir ?? t("fields.notSet")}</b>
                      <small>{backupStatus?.message ?? t("admin.backups.noData")}</small>
                    </div>
                    <div className="metric-card">
                      <span>{t("admin.backups.files")}</span>
                      <b>{backupStatus?.totalBackups ?? 0}</b>
                      <small>{t("admin.backups.retention", { count: backupStatus?.retentionDays ?? 0 })}</small>
                    </div>
                    <div className="metric-card">
                      <span>{t("admin.backups.latest")}</span>
                      <b>{backupStatus?.latestBackup?.file ?? t("admin.backups.notFound")}</b>
                      <small>
                        {backupStatus?.latestBackup
                          ? `${dateTime(backupStatus.latestBackup.updatedAt)} / ${fileSize(
                              backupStatus.latestBackup.sizeBytes,
                            )}`
                          : t("admin.backups.noFile")}
                      </small>
                    </div>
                    <div className="metric-card span-2">
                      <span>Checksum</span>
                      <b>{backupStatus?.latestChecksum ?? t("admin.backups.notFound")}</b>
                      <small>{t("admin.backups.restore")}</small>
                    </div>
                  </div>
                </article>
              );
}

export function AdminConfigPageContent() {
  const { t } = useI18n();
  const { configTransferText, exportAdminConfig, importAdminConfig, importingConfig, setConfigTransferText } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>{t("admin.config.description")}</p>
                    </div>
                    <div className="panel-title-actions">
                      <button type="button" onClick={() => void exportAdminConfig()}>
                        {t("admin.config.export")}
                      </button>
                      <button
                        type="button"
                        onClick={() => void importAdminConfig()}
                        disabled={importingConfig || !configTransferText.trim()}
                      >
                        {importingConfig ? t("admin.config.importing") : t("admin.config.import")}
                      </button>
                    </div>
                  </div>
                  <textarea
                    className="admin-config-textarea"
                    value={configTransferText}
                    onChange={(event) => setConfigTransferText(event.target.value)}
                    placeholder={t("admin.config.placeholder")}
                  />
                </article>
              );
}
