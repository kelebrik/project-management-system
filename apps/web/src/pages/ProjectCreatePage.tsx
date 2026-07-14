import { useState, type FormEvent } from "react";
import { usePageContext } from "./PageContext";
import { FieldError } from "../components/FieldError";
import type { RagStatus } from "../app/domainTypes";

export function ProjectCreatePage() {
  const ctx = usePageContext();
  const {
    activeProjectTree,
    createProject,
    newProjectForm,
    ragOptionLabel,
    setNewProjectForm,
  } = ctx;

  const [formErrors, setFormErrors] = useState<{
    code?: string;
    name?: string;
  }>({});

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const nextErrors: { code?: string; name?: string } = {};
    if (!newProjectForm.code.trim()) nextErrors.code = "Укажите код проекта";
    if (!newProjectForm.name.trim())
      nextErrors.name = "Укажите наименование проекта";
    if (nextErrors.code || nextErrors.name) {
      event.preventDefault();
      setFormErrors(nextErrors);
      return;
    }
    setFormErrors({});
    createProject(event);
  };

  return (
                <article className="panel project-card">
                  <div className="panel-title">
                    <div>
                      <h2>Создать проект</h2>
                      <p>Быстрый ввод нового проекта с базовыми полями проектного офиса</p>
                    </div>
                  </div>
                    <form
                      className="form-grid compact-form"
                      onSubmit={handleSubmit}
                      noValidate
                    >
                      <div className="form-section-title span-2">Основное</div>
                      <label>
                        Код
                      <input
                        className={formErrors.code ? "field-invalid" : ""}
                        aria-invalid={formErrors.code ? true : undefined}
                        aria-describedby={
                          formErrors.code ? "new-project-code-error" : undefined
                        }
                        value={newProjectForm.code}
                        onChange={(event) => {
                          if (formErrors.code)
                            setFormErrors((current) => ({
                              ...current,
                              code: undefined,
                            }));
                          setNewProjectForm({
                            ...newProjectForm,
                            code: event.target.value,
                          });
                        }}
                        placeholder="CRM"
                      />
                      <FieldError
                        id="new-project-code-error"
                        message={formErrors.code}
                      />
                    </label>
                    <label>
                      Наименование
                      <input
                        className={formErrors.name ? "field-invalid" : ""}
                        aria-invalid={formErrors.name ? true : undefined}
                        aria-describedby={
                          formErrors.name ? "new-project-name-error" : undefined
                        }
                        value={newProjectForm.name}
                        onChange={(event) => {
                          if (formErrors.name)
                            setFormErrors((current) => ({
                              ...current,
                              name: undefined,
                            }));
                          setNewProjectForm({
                            ...newProjectForm,
                            name: event.target.value,
                          });
                        }}
                        placeholder="Миграция CRM"
                      />
                      <FieldError
                        id="new-project-name-error"
                        message={formErrors.name}
                      />
                    </label>
                    <div className="form-section-title span-2">Базовый план</div>
                    <label className="span-2">
                      Скопировать из проекта
                      <select
                        value={newProjectForm.copyBaselineFromProjectId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            copyBaselineFromProjectId: event.target.value,
                          })
                        }
                      >
                        <option value="">Не копировать, создать тестовую структуру</option>
                        {activeProjectTree.map((item) => (
                          <option key={item.id} value={item.id}>
                            {"- ".repeat(item.level)}
                            {item.code} - {item.name}
                          </option>
                        ))}
                      </select>
                      <span className="form-note">
                        Новый проект получит структуру, связи, даты и календари
                        из последнего активного базового плана выбранного проекта.
                      </span>
                    </label>
                    <label>
                      Родительский проект
                      <select
                        value={newProjectForm.parentId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">Корень</option>
                        {activeProjectTree.map((item) => (
                          <option key={item.id} value={item.id}>
                            {"- ".repeat(item.level)}
                            {item.code} - {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Порядок
                      <input
                        type="number"
                        value={newProjectForm.sortOrder}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sortOrder: event.target.value,
                          })
                        }
                          />
                        </label>
                      <div className="form-section-title span-2">Команда и статус</div>
                      <label>
                        Портфель
                      <input
                        value={newProjectForm.portfolio}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            portfolio: event.target.value,
                          })
                        }
                        placeholder="Цифровая трансформация"
                      />
                    </label>
                    <label>
                      РП
                      <input
                        value={newProjectForm.projectManager}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            projectManager: event.target.value,
                          })
                        }
                        placeholder="Руководитель проекта"
                      />
                    </label>
                    <label>
                      Спонсор
                      <input
                        value={newProjectForm.sponsor}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sponsor: event.target.value,
                          })
                        }
                        placeholder="Финансовый директор / ИТ-директор"
                      />
                    </label>
                    <label>
                      Индикатор
                      <select
                        value={newProjectForm.rag}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            rag: event.target.value as RagStatus,
                          })
                        }
                      >
                        <option value="GREEN">{ragOptionLabel("GREEN")}</option>
                        <option value="AMBER">{ragOptionLabel("AMBER")}</option>
                          <option value="RED">{ragOptionLabel("RED")}</option>
                        </select>
                      </label>
                      <div className="form-section-title span-2">Сроки</div>
                      <label>
                        Старт
                      <input
                        type="date"
                        value={newProjectForm.startDate}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            startDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Целевая дата
                      <input
                        type="date"
                        value={newProjectForm.targetDate}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            targetDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Прогресс
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newProjectForm.progress}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            progress: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Отклонение сроков
                      <input
                        type="number"
                        value={newProjectForm.scheduleVariance}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            scheduleVariance: event.target.value,
                          })
                        }
                          />
                        </label>
                      <div className="form-section-title span-2">Управленческая сводка</div>
                      <label className="span-2">
                        Сводка
                      <textarea
                        value={newProjectForm.summary}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            summary: event.target.value,
                          })
                        }
                        rows={2}
                      />
                    </label>
                    <div className="form-actions span-2">
                      <button type="submit">Создать проект</button>
                    </div>
                  </form>
                </article>
              );
}
