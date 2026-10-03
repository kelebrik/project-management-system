import { useI18n } from "../i18n/I18nProvider";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { usePageContext } from "./PageContext";
import { FieldError } from "../components/FieldError";
import { apiClient } from "../api/client";
import { selectedBusinessUnitId } from "../app/businessUnitContext";
import {
  businessUnitForProjectCreation,
  type BusinessUnitOption,
} from "../app/projectCreation";
import { suggestProjectCode } from "../app/projectCode";
import type { ProjectStructureCopyOption } from "../app/projectStructureCopy";
import { ProjectStructureCopyField } from "../components/ProjectStructureCopyField";

type FormErrors = {
  businessUnitId?: string;
  code?: string;
  name?: string;
  projectManager?: string;
  targetDate?: string;
};

/**
 * A new project in two steps: what it is (name, business unit, manager,
 * dates) and where its Structure comes from. Everything else (sponsor, summary,
 * parent project) is optional and folded away; it can be filled in later.
 */
export function ProjectCreatePage() {
  const { t } = useI18n();
  const { activeProjectTree, createProject, currentUser, newProjectForm, projects, setError, setNewProjectForm } = usePageContext();

  const [businessUnits, setBusinessUnits] = useState<BusinessUnitOption[]>([]);
  const [copyOptions, setCopyOptions] = useState<ProjectStructureCopyOption[]>([]);
  const [copyOptionsError, setCopyOptionsError] = useState<string | null>(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(true);
  const [step, setStep] = useState<"about" | "structure">("about");
  const [showMore, setShowMore] = useState(false);
  // Once someone types a code or a manager, the form stops filling them in.
  const [codeTouched, setCodeTouched] = useState(false);
  const [managerTouched, setManagerTouched] = useState(false);
  const [formErrors, setFormErrors] = useState<FormErrors>({});

  const takenCodes = useMemo(() => projects.map((project) => project.code), [projects]);
  const suggestedCode = useMemo(() => suggestProjectCode(newProjectForm.name, takenCodes), [newProjectForm.name, takenCodes]);
  const code = codeTouched ? newProjectForm.code : newProjectForm.name.trim() ? suggestedCode : "";
  const projectManager = managerTouched ? newProjectForm.projectManager : newProjectForm.projectManager || currentUser?.name || "";
  const form = { ...newProjectForm, code, projectManager };
  const update = (patch: Partial<typeof newProjectForm>) => setNewProjectForm({ ...form, ...patch });
  const clearError = (field: keyof FormErrors) => {
    if (formErrors[field]) setFormErrors((current) => ({ ...current, [field]: undefined }));
  };

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<BusinessUnitOption[]>("/api/business-units", t("create.unitsError"))
      .then((units) => {
        if (cancelled) return;
        setBusinessUnits(units);
        setNewProjectForm((current) => {
          const selectedUnit = businessUnitForProjectCreation(units, current.businessUnitId || selectedBusinessUnitId());
          if (!selectedUnit || current.businessUnitId === selectedUnit.id) return current;
          return { ...current, businessUnitId: selectedUnit.id, portfolio: selectedUnit.name };
        });
      })
      .catch((error: unknown) => {
        if (!cancelled) setError(error instanceof Error ? error.message : t("create.unitsError"));
      });

    void apiClient
      .get<ProjectStructureCopyOption[]>("/api/projects/structure-copy-options", t("create.structureError"))
      .then((structures) => {
        if (cancelled) return;
        setCopyOptions(structures);
        setCopyOptionsError(null);
      })
      .catch(() => {
        if (!cancelled) setCopyOptionsError(t("create.copyError"));
      })
      .finally(() => {
        if (!cancelled) setIsLoadingOptions(false);
      });
    return () => {
      cancelled = true;
    };
  }, [setError, setNewProjectForm, t]);

  const aboutErrors = (): FormErrors => {
    const errors: FormErrors = {};
    if (!form.name.trim()) errors.name = t("create.nameRequired");
    if (form.code.trim().length < 2) errors.code = t("create.codeRequired");
    if (!form.businessUnitId) errors.businessUnitId = t("create.unitRequired");
    if (!form.projectManager.trim()) errors.projectManager = t("create.managerRequired");
    if (form.startDate && form.targetDate && form.startDate > form.targetDate) errors.targetDate = t("create.datesOrder");
    return errors;
  };

  const goToStructure = () => {
    const errors = aboutErrors();
    setFormErrors(errors);
    if (Object.values(errors).some(Boolean)) {
      if (errors.code) setShowMore(true);
      return;
    }
    setNewProjectForm(form);
    setStep("structure");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    if (step === "about") {
      event.preventDefault();
      goToStructure();
      return;
    }
    void createProject(event, (field, message) => {
      if (field !== "code") return;
      setFormErrors({ code: message });
      setShowMore(true);
      setStep("about");
    });
  };

  const singleUnit = businessUnits.length === 1;
  // On the last step too: the confirmation before creating points at this field.
  const businessUnitField = (
    <label className="project-create-business-unit">
      {t("fields.portfolio")}
      <select
        value={form.businessUnitId}
        aria-invalid={formErrors.businessUnitId ? true : undefined}
        onChange={(event) => {
          const selectedUnit = businessUnits.find((unit) => unit.id === event.currentTarget.value);
          clearError("businessUnitId");
          update({ businessUnitId: selectedUnit?.id ?? "", portfolio: selectedUnit?.name ?? "", parentId: "" });
        }}
      >
        <option value="">{t("create.chooseUnit")}</option>
        {businessUnits.map((unit) => (
          <option value={unit.id} key={unit.id}>
            {unit.name}
          </option>
        ))}
      </select>
      <FieldError id="new-project-business-unit-error" message={formErrors.businessUnitId} />
    </label>
  );

  return (
    <article className="panel project-card">
      <div className="panel-title">
        <div>
          <h2>{t("create.title")}</h2>
          <p>{t("create.description")}</p>
        </div>
      </div>
      <ol className="project-create-steps" aria-label={t("create.stepsLabel")}>
        <li aria-current={step === "about" ? "step" : undefined}>{t("create.stepAbout")}</li>
        <li aria-current={step === "structure" ? "step" : undefined}>{t("create.stepStructure")}</li>
      </ol>
      <form className="form-grid compact-form" onSubmit={handleSubmit} noValidate>
        {step === "about" ? (
          <>
            <label className="span-2">
              {t("fields.name")}
              <input
                autoFocus
                className={formErrors.name ? "field-invalid" : ""}
                aria-invalid={formErrors.name ? true : undefined}
                aria-describedby={formErrors.name ? "new-project-name-error" : undefined}
                value={form.name}
                onChange={(event) => {
                  clearError("name");
                  update({ name: event.target.value });
                }}
                placeholder={t("create.namePlaceholder")}
              />
              <FieldError id="new-project-name-error" message={formErrors.name} />
            </label>
            {!singleUnit && businessUnitField}
            <label>
              {t("fields.pm")}
              <input
                className={formErrors.projectManager ? "field-invalid" : ""}
                aria-invalid={formErrors.projectManager ? true : undefined}
                value={form.projectManager}
                onChange={(event) => {
                  setManagerTouched(true);
                  clearError("projectManager");
                  update({ projectManager: event.target.value });
                }}
                placeholder={t("fields.manager")}
              />
              <FieldError id="new-project-manager-error" message={formErrors.projectManager} />
            </label>
            <label>
              {t("fields.start")}
              <input
                type="date"
                value={form.startDate}
                onChange={(event) => {
                  clearError("targetDate");
                  update({ startDate: event.target.value });
                }}
              />
            </label>
            <label>
              {t("fields.targetDate")}
              <input
                type="date"
                className={formErrors.targetDate ? "field-invalid" : ""}
                aria-invalid={formErrors.targetDate ? true : undefined}
                value={form.targetDate}
                onChange={(event) => {
                  clearError("targetDate");
                  update({ targetDate: event.target.value });
                }}
              />
              <FieldError id="new-project-target-error" message={formErrors.targetDate} />
            </label>
            <details className="span-2 project-create-more" open={showMore} onToggle={(event) => setShowMore(event.currentTarget.open)}>
              <summary>{t("create.more")}</summary>
              <div className="form-grid compact-form">
                <label>
                  {t("fields.code")}
                  <input
                    className={formErrors.code ? "field-invalid" : ""}
                    aria-invalid={formErrors.code ? true : undefined}
                    aria-describedby={formErrors.code ? "new-project-code-error" : "new-project-code-note"}
                    value={form.code}
                    onChange={(event) => {
                      setCodeTouched(true);
                      clearError("code");
                      update({ code: event.target.value });
                    }}
                    placeholder="CRM"
                  />
                  <FieldError id="new-project-code-error" message={formErrors.code} />
                  {!formErrors.code && <span id="new-project-code-note" className="form-note">{t("create.codeNote")}</span>}
                </label>
                <label>
                  {t("fields.sponsor")}
                  <input value={form.sponsor} onChange={(event) => update({ sponsor: event.target.value })} placeholder={t("create.sponsorPlaceholder")} />
                </label>
                <label>
                  {t("fields.parentProject")}
                  <select value={form.parentId} onChange={(event) => update({ parentId: event.target.value })}>
                    <option value="">{t("fields.root")}</option>
                    {activeProjectTree
                      .filter((item) => item.businessUnitId === form.businessUnitId)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {"- ".repeat(item.level)}
                          {item.code} - {item.name}
                        </option>
                      ))}
                  </select>
                </label>
                <label className="span-2">
                  {t("fields.summary")}
                  <textarea value={form.summary} onChange={(event) => update({ summary: event.target.value })} rows={2} />
                </label>
              </div>
            </details>
            <div className="form-actions span-2">
              <button type="submit">{t("create.next")}</button>
            </div>
          </>
        ) : (
          <>
            <div className="form-field span-2">
              <span className="form-field-label">{t("create.copy")}</span>
              <ProjectStructureCopyField
                error={copyOptionsError}
                isLoading={isLoadingOptions}
                options={copyOptions}
                value={form.copyCurrentStructureFrom}
                onChange={(copyCurrentStructureFrom) => update({ copyCurrentStructureFrom })}
              />
              <span className="form-note">{t("create.copyHelp")}</span>
              <span className="form-note">{t("create.defaultStructureNote")}</span>
            </div>
            {businessUnitField}
            <div className="form-actions span-2">
              <button type="button" className="secondary-button" onClick={() => setStep("about")}>
                {t("create.back")}
              </button>
              <button type="submit">{t("create.title")}</button>
            </div>
          </>
        )}
      </form>
    </article>
  );
}
