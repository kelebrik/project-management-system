import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";

export function ProjectPassportPage() {
  const ctx = usePageContext();
  const confirm = useConfirm();
  const {
    addPassportRow,
    date,
    deletePassportRow,
    passportRows,
    project,
    projectTargetSummary,
    savePassportRows,
    savingPassportRows,
    updatePassportRow,
  } = ctx;

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <h2>Паспорт проекта</h2>
                        <p>Редактируемый набор полей паспорта проекта</p>
                      </div>
                      <button
                      type="button"
                      onClick={() => addPassportRow(passportRows.length - 1)}
                    >
                      + Добавить поле
                    </button>
                  </div>
                  <div className="passport-table">
                    <div className="passport-head">
                      <span>Поле</span>
                      <span>Описание</span>
                      <span />
                    </div>
                    <div className="passport-row passport-row-readonly">
                      <span>Стартовая цель</span>
                      <span>
                        {date(
                          projectTargetSummary?.initialTargetDate ??
                            project?.targetDate ??
                            null,
                        )}
                      </span>
                      <span aria-hidden="true" />
                    </div>
                    {passportRows.map((row, index) => (
                      <div className="passport-row" key={row.id}>
                        <input
                          value={row.field}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              field: event.target.value,
                            })
                          }
                          placeholder="Наименование поля"
                        />
                        <textarea
                          value={row.description}
                          onChange={(event) =>
                            updatePassportRow(row.id, {
                              description: event.target.value,
                            })
                          }
                          rows={1}
                          placeholder="Описание или значение"
                        />
                        <div className="passport-row-controls">
                          <button
                            type="button"
                            className="wbs-inline-insert-button"
                            onClick={() => addPassportRow(index)}
                            aria-label="Добавить поле ниже"
                            title="Добавить поле ниже"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            className="wbs-row-delete-button"
                            onClick={async () => {
                              if (
                                await confirm({
                                  title: "Удалить поле паспорта?",
                                  confirmLabel: "Удалить",
                                })
                              ) {
                                void deletePassportRow(row.id);
                              }
                            }}
                            aria-label="Удалить поле"
                            title="Удалить поле"
                          >
                            x
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="form-actions passport-actions">
                    <button
                      type="button"
                      onClick={() => void savePassportRows()}
                      disabled={savingPassportRows}
                    >
                      {savingPassportRows ? "Сохраняю..." : "Сохранить паспорт"}
                    </button>
                  </div>
                </article>
              );
}
