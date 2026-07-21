import { useEffect, useState, type FormEvent } from "react";
import { usePageContext } from "./PageContext";
import { FieldError } from "../components/FieldError";
import type { RagStatus } from "../app/domainTypes";
import { apiClient } from "../api/client";
import { selectedBusinessUnitId } from "../app/businessUnitContext";
import {
  businessUnitForProjectCreation,
  type BusinessUnitOption,
} from "../app/projectCreation";
import type { ProjectStructureCopyOption } from "../app/projectStructureCopy";
import { ProjectStructureCopyField } from "../components/ProjectStructureCopyField";

export function ProjectCreatePage() {
  const ctx = usePageContext();
  const {
    activeProjectTree,
    createProject,
    newProjectForm,
    ragOptionLabel,
    setError,
    setNewProjectForm,
  } = ctx;

  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [copyOptions, setCopyOptions] = useState<ProjectStructureCopyOption[]>([]);
  const [copyOptionsError, setCopyOptionsError] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);

  const [formErrors, setFormErrors] = useState<{
    businessUnitId?: string;
    code?: string;
    name?: string;
  }>({});

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<BusinessUnitOption[]>(
        "/api/business-units",
        "Не удалось загрузить бизнес-юниты",
      )
      .then((units) => {
        if (cancelled) return;
        setBusinessUnits(units);
        setNewProjectForm((current) => {
          const selectedUnit = businessUnitForProjectCreation(
            units,
            current.businessUnitId || selectedBusinessUnitId(),
          );
          if (!selectedUnit || current.businessUnitId === selectedUnit.id) return current;
          return {
            ...current,
            businessUnitId: selectedUnit.id,
            portfolio: selectedUnit.name,
          };
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setError(
            error instanceof Error ? error.message : "Не удалось загрузить бизнес-юниты",
          );
        }
      });

    void apiClient
      .get<ProjectStructureCopyOption[]>(
        "/api/projects/structure-copy-options",
        "Не удалось загрузить текущие Структуры проектов",
      )
      .then((structures) => {
        if (cancelled) return;
        setCopyOptions(structures);
        setCopyOptionsError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setCopyOptionsError(
            "Не удалось загрузить варианты копирования. Проект можно создать без копирования Структуры.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setError, setNewProjectForm]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const nextErrors: { businessUnitId?: string; code?: string; name?: string } = {};
    if (!newProjectForm.code.trim()) nextErrors.code = "Укажите код проекта";
    if (!newProjectForm.name.trim())
      nextErrors.name = "Укажите наименование проекта";
    if (!newProjectForm.businessUnitId)
      nextErrors.businessUnitId = "Выберите бизнес-юнит";
    if (nextErrors.code || nextErrors.name || nextErrors.businessUnitId) {
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
                    <div className="form-section-title span-2">Структура</div>
                    <div className="form-field span-2">
                      <span className="form-field-label">Скопировать из проекта</span>
                      <ProjectStructureCopyField
                        error={copyOptionsError}
                        isLoading={isLoadingOptions}
                        options={copyOptions}
                        value={newProjectForm.copyCurrentStructureFrom}
                        onChange={(copyCurrentStructureFrom) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            copyCurrentStructureFrom,
                          })
                        }
                      />
                      <span className="form-note">
                        Можно выбрать несколько проектов или отдельных фаз. Будут
                        скопированы текущая Структура, даты и внутренние связи.
                      </span>
                    </div>
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
                        {activeProjectTree
                          .filter(
                            (item) => item.businessUnitId === newProjectForm.businessUnitId,
                          )
                          .map((item) => (
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
                    <label className="project-create-business-unit">
                      Портфель
                      <select
                        value={newProjectForm.businessUnitId}
                        aria-invalid={formErrors.businessUnitId ? true : undefined}
                        onChange={(event) =>
                          {
                            const selectedUnit = businessUnits.find(
                              (unit) => unit.id === event.currentTarget.value,
                            );
                            if (formErrors.businessUnitId) {
                              setFormErrors((current) => ({
                                ...current,
                                businessUnitId: undefined,
                              }));
                            }
                            setNewProjectForm({
                              ...newProjectForm,
                              businessUnitId: selectedUnit?.id ?? "",
                              portfolio: selectedUnit?.name ?? "",
                              parentId: "",
                            });
                          }
                        }
                      >
                        <option value="">Выберите БЮ</option>
                        {businessUnits.map((unit) => (
                          <option value={unit.id} key={unit.id}>
                            {unit.name}
                          </option>
                        ))}
                      </select>
                      <FieldError
                        id="new-project-business-unit-error"
                        message={formErrors.businessUnitId}
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
