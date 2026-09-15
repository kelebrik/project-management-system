import { useI18n } from "../i18n/I18nProvider";
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
  const { t } = useI18n();
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
        t("create.unitsError"),
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
            error instanceof Error ? error.message : t("create.unitsError"),
          );
        }
      });

    void apiClient
      .get<ProjectStructureCopyOption[]>(
        "/api/projects/structure-copy-options",
        t("create.structureError"),
      )
      .then((structures) => {
        if (cancelled) return;
        setCopyOptions(structures);
        setCopyOptionsError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setCopyOptionsError(
            t("create.copyError"),
          );
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setError, setNewProjectForm, t]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    const nextErrors: { businessUnitId?: string; code?: string; name?: string } = {};
    if (!newProjectForm.code.trim()) nextErrors.code = t("create.codeRequired");
    if (!newProjectForm.name.trim())
      nextErrors.name = t("create.nameRequired");
    if (!newProjectForm.businessUnitId)
      nextErrors.businessUnitId = t("create.unitRequired");
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
                      <h2>{t("create.title")}</h2>
                      <p>{t("create.description")}</p>
                    </div>
                  </div>
                    <form
                      className="form-grid compact-form"
                      onSubmit={handleSubmit}
                      noValidate
                    >
                      <div className="form-section-title span-2">{t("create.basics")}</div>
                      <label>
                        {t("fields.code")}
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
                      {t("fields.name")}
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
                        placeholder={t("create.namePlaceholder")}
                      />
                      <FieldError
                        id="new-project-name-error"
                        message={formErrors.name}
                      />
                    </label>
                    <div className="form-section-title span-2">{t("fields.structure")}</div>
                    <div className="form-field span-2">
                      <span className="form-field-label">{t("create.copy")}</span>
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
                        {t("create.copyHelp")}
                      </span>
                    </div>
                    <label>
                      {t("fields.parentProject")}
                      <select
                        value={newProjectForm.parentId}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            parentId: event.target.value,
                          })
                        }
                      >
                        <option value="">{t("fields.root")}</option>
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
                      {t("fields.order")}
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
                      <div className="form-section-title span-2">{t("create.team")}</div>
                    <label className="project-create-business-unit">
                      {t("fields.portfolio")}
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
                        <option value="">{t("create.chooseUnit")}</option>
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
                      {t("fields.pm")}
                      <input
                        value={newProjectForm.projectManager}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            projectManager: event.target.value,
                          })
                        }
                        placeholder={t("fields.manager")}
                      />
                    </label>
                    <label>
                      {t("fields.sponsor")}
                      <input
                        value={newProjectForm.sponsor}
                        onChange={(event) =>
                          setNewProjectForm({
                            ...newProjectForm,
                            sponsor: event.target.value,
                          })
                        }
                        placeholder={t("create.sponsorPlaceholder")}
                      />
                    </label>
                    <label>
                      {t("fields.rag")}
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
                      <div className="form-section-title span-2">{t("create.dates")}</div>
                      <label>
                        {t("fields.start")}
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
                      {t("fields.targetDate")}
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
                      {t("fields.progress")}
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
                      {t("create.variance")}
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
                      <div className="form-section-title span-2">{t("create.managementSummary")}</div>
                      <label className="span-2">
                        {t("fields.summary")}
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
                      <button type="submit">{t("create.title")}</button>
                    </div>
                  </form>
                </article>
              );
}
