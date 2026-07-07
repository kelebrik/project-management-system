import { usePageContext } from "./PageContext";

export function AdminTemplatesPageContent() {
  const { saveSystemSettings, savingSystemSettings, setSystemSettingsDraft, systemSettingsDraft } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: шаблоны Структуры</h2>
                      <p>Базовые наборы работ для создания новых проектов</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      JSON шаблонов
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
                        {savingSystemSettings ? "Сохраняю..." : "Сохранить шаблоны"}
                      </button>
                    </div>
                  </form>
                </article>
              );
}

export function AdminRagPageContent() {
  const { saveSystemSettings, savingSystemSettings, setSystemSettingsDraft, systemSettingsDraft } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: формулы RAG</h2>
                      <p>Правила расчета зеленого, желтого и красного статуса проекта</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      Зеленый
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
                      Желтый
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
                      Красный
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
                        {savingSystemSettings ? "Сохраняю..." : "Сохранить формулы"}
                      </button>
                    </div>
                  </form>
                </article>
              );
}

export function AdminWorkflowsPageContent() {
  const { saveSystemSettings, savingSystemSettings, setSystemSettingsDraft, systemSettingsDraft } = usePageContext();
  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: workflow согласований</h2>
                      <p>Маршруты согласования обзора, базового плана и закрытия проекта</p>
                    </div>
                  </div>
                  <form className="form-grid admin-settings-form" onSubmit={saveSystemSettings}>
                    <label className="span-2">
                      Обзор для руководства
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
                      Базовый план
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
                      Закрытие проекта
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
                        {savingSystemSettings ? "Сохраняю..." : "Сохранить workflow"}
                      </button>
                    </div>
                  </form>
                </article>
              );
}
