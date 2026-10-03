import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

export function AdminTemplatesPageContent() {
  const { t } = useI18n();
  const { saveSystemSettings, savingSystemSettings, setSystemSettingsDraft, systemSettingsDraft } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>{t("admin.templates.description")}</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      {t("admin.templates.json")}
                      <textarea
                        className="admin-config-textarea"
                        value={systemSettingsDraft.wbsTemplates}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            wbsTemplates: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingSystemSettings}>
                        {savingSystemSettings ? t("fields.saving") : t("admin.templates.save")}
                      </button>
                    </div>
                  </form>
                </article>
              );
}
