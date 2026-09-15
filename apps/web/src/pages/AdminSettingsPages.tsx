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

export function AdminRagPageContent() {
  const { t } = useI18n();
  const { saveSystemSettings, savingSystemSettings, setSystemSettingsDraft, systemSettingsDraft } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>{t("admin.rag.description")}</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      {t("admin.rag.green")}
                      <textarea
                        value={systemSettingsDraft.ragGreenFormula}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            ragGreenFormula: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      {t("admin.rag.amber")}
                      <textarea
                        value={systemSettingsDraft.ragAmberFormula}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            ragAmberFormula: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      {t("admin.rag.red")}
                      <textarea
                        value={systemSettingsDraft.ragRedFormula}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            ragRedFormula: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingSystemSettings}>
                        {savingSystemSettings ? t("fields.saving") : t("admin.rag.save")}
                      </button>
                    </div>
                  </form>
                </article>
              );
}

export function AdminWorkflowsPageContent() {
  const { t } = useI18n();
  const { saveSystemSettings, savingSystemSettings, setSystemSettingsDraft, systemSettingsDraft } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <p>{t("admin.workflow.description")}</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      {t("admin.workflow.overview")}
                      <textarea
                        value={systemSettingsDraft.overviewWorkflow}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            overviewWorkflow: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      {t("admin.workflow.baseline")}
                      <textarea
                        value={systemSettingsDraft.baselineWorkflow}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            baselineWorkflow: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="span-2">
                      {t("admin.workflow.closure")}
                      <textarea
                        value={systemSettingsDraft.projectCloseWorkflow}
                        onChange={(event) =>
                          setSystemSettingsDraft({
                            ...systemSettingsDraft,
                            projectCloseWorkflow: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit" disabled={savingSystemSettings}>
                        {savingSystemSettings ? t("fields.saving") : t("admin.workflow.save")}
                      </button>
                    </div>
                  </form>
                </article>
              );
}
