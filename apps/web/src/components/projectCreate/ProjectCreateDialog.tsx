import type { WbsImportPlanSummary } from "@pms/shared";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { apiClient } from "../../api/client";
import { selectedBusinessUnitId } from "../../app/businessUnitContext";
import { suggestProjectCode } from "../../app/projectCode";
import { businessUnitForProjectCreation, type BusinessUnitOption } from "../../app/projectCreation";
import type { ProjectStructureCopyOption } from "../../app/projectStructureCopy";
import { EMPLOYEE_NAMES_LIST_ID } from "../../hooks/useEmployeeDirectory";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { newImportKey, useWbsTableReader } from "../../hooks/useWbsTableReader";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import { EmployeeNamesList } from "../EmployeeNamesList";
import { FieldError } from "../FieldError";
import { ProjectStructureCopyField } from "../ProjectStructureCopyField";
import { WbsImportPlanView, WbsTableColumnsPreview, WbsTableSourceInputs } from "../wbsTable/WbsTableReader";
import "../../styles/project-create.css";

type Step = 1 | 2 | 3;
type StructureSource = "standard" | "copy" | "table";
type Errors = Partial<Record<"businessUnitId" | "name" | "code" | "projectManager" | "startDate" | "targetDate" | "confirmUnit", string>>;

/**
 * Creating a project: a dialog in the middle of the page, in three steps.
 * 1, the project: portfolio (business unit), name, code, manager, start and
 * finish, all required. 2, the team: business customer, product owner, HW and
 * SW TPM, all optional. 3, the Structure: the standard one, copies of other
 * projects, or a table from Excel or Google Sheets, checked before creating.
 */
export function ProjectCreateDialog() {
  const { t } = useI18n();
  const { closeProjectCreate, createProject, currentUser, newProjectForm, projects, setNewProjectForm } = usePageContext();
  const containerRef = useFocusTrap<HTMLDivElement>(true, closeProjectCreate);
  const [step, setStep] = useState<Step>(1);
  const [units, setUnits] = useState<BusinessUnitOption[]>([]);
  const [copyOptions, setCopyOptions] = useState<ProjectStructureCopyOption[]>([]);
  const [copyOptionsError, setCopyOptionsError] = useState<string | null>(null);
  const [loadingCopies, setLoadingCopies] = useState(true);
  const [codeTouched, setCodeTouched] = useState(false);
  const [managerTouched, setManagerTouched] = useState(false);
  const [unitConfirmed, setUnitConfirmed] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [source, setSource] = useState<StructureSource>("standard");
  const [plan, setPlan] = useState<WbsImportPlanSummary | null>(null);
  const [importKey, setImportKey] = useState(newImportKey);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const reader = useWbsTableReader(() => {
    setPlan(null);
    setImportKey(newImportKey());
  });

  // The server makes the creator the manager unless they are an administrator; the field says so.
  const managerLocked = Boolean(currentUser && currentUser.role !== "ADMIN");
  const takenCodes = useMemo(() => projects.map((project: { code: string }) => project.code), [projects]);
  const code = codeTouched ? newProjectForm.code : newProjectForm.name.trim() ? suggestProjectCode(newProjectForm.name, takenCodes) : "";
  const projectManager = managerLocked ? currentUser!.name : managerTouched ? newProjectForm.projectManager : newProjectForm.projectManager || currentUser?.name || "";
  const form = { ...newProjectForm, code, projectManager };
  const update = (patch: Partial<typeof newProjectForm>) => setNewProjectForm({ ...form, ...patch });
  const clear = (field: keyof Errors) => errors[field] && setErrors((current) => ({ ...current, [field]: undefined }));

  // The unit the page works in is the expected one; creating elsewhere is confirmed here, not in another dialog.
  const contextUnitId = selectedBusinessUnitId();
  const chosenUnit = units.find((unit) => unit.id === form.businessUnitId);
  const needsUnitConfirmation = Boolean(chosenUnit && units.length > 1 && chosenUnit.id !== contextUnitId);

  useEffect(() => {
    let cancelled = false;
    void apiClient
      .get<BusinessUnitOption[]>("/api/business-units", t("create.unitsError"))
      .then((answer) => {
        if (cancelled) return;
        setUnits(answer);
        setNewProjectForm((current: typeof newProjectForm) => {
          const unit = businessUnitForProjectCreation(answer, current.businessUnitId || selectedBusinessUnitId());
          return !unit || current.businessUnitId === unit.id ? current : { ...current, businessUnitId: unit.id, portfolio: unit.name };
        });
      })
      .catch((error: unknown) => !cancelled && setFailure(error instanceof Error ? error.message : t("create.unitsError")));
    void apiClient
      .get<ProjectStructureCopyOption[]>("/api/projects/structure-copy-options", t("create.structureError"))
      .then((answer) => !cancelled && setCopyOptions(answer))
      .catch(() => !cancelled && setCopyOptionsError(t("create.copyError")))
      .finally(() => !cancelled && setLoadingCopies(false));
    return () => {
      cancelled = true;
    };
  }, [setNewProjectForm, t]);

  const stepOneErrors = (): Errors => {
    const next: Errors = {};
    if (!form.businessUnitId) next.businessUnitId = t("create.unitRequired");
    if (!form.name.trim()) next.name = t("create.nameRequired");
    if (form.code.trim().length < 2) next.code = t("create.codeRequired");
    if (!form.projectManager.trim()) next.projectManager = t("create.managerRequired");
    if (!form.startDate) next.startDate = t("create.startRequired");
    if (!form.targetDate) next.targetDate = t("create.targetRequired");
    else if (form.startDate && form.startDate > form.targetDate) next.targetDate = t("create.datesOrder");
    if (needsUnitConfirmation && !unitConfirmed) next.confirmUnit = t("create.confirmUnitRequired");
    return next;
  };

  const next = () => {
    if (step === 1) {
      const found = stepOneErrors();
      setErrors(found);
      if (Object.values(found).some(Boolean)) return;
      setNewProjectForm(form);
    }
    setStep((current) => (current < 3 ? ((current + 1) as Step) : current));
  };

  const checkTable = async () => {
    if (!reader.parsed) return;
    setBusy(true);
    setFailure(null);
    try {
      setPlan(await apiClient.post<WbsImportPlanSummary>("/api/wbs-import/preview", { rows: reader.parsed.rows }, t("ui.wbsTable.failed")));
    } catch (error) {
      setFailure(error instanceof Error ? error.message : t("ui.wbsTable.failed"));
    } finally {
      setBusy(false);
    }
  };

  const tableReady = source !== "table" || Boolean(plan && plan.errors.length === 0 && plan.creates.length > 0);
  const copyReady = source !== "copy" || form.copyCurrentStructureFrom.length > 0;

  const create = async () => {
    setBusy(true);
    setFailure(null);
    const result = await createProject(form, {
      onFieldError: (field: string, message: string) => {
        if (field !== "code") return;
        setErrors({ code: message });
        setStep(1);
      },
      structure: source === "table" ? { source, importRows: reader.parsed?.rows, importKey } : { source },
    });
    setBusy(false);
    if (!result.ok) {
      setFailure(result.error);
      if (result.importSummary) setPlan(result.importSummary);
    }
  };

  const field = (name: keyof Errors, label: string, input: React.ReactNode, wide = false) => (
    <label className={wide ? "span-2" : ""}>
      {label}
      {input}
      <FieldError id={`new-project-${name}-error`} message={errors[name]} />
    </label>
  );
  const invalid = (name: keyof Errors) => (errors[name] ? { className: "field-invalid", "aria-invalid": true as const, "aria-describedby": `new-project-${name}-error` } : {});

  return createPortal(
    <div className="project-create-backdrop" onMouseDown={(event) => event.target === event.currentTarget && closeProjectCreate()}>
      <div aria-labelledby="project-create-title" aria-modal="true" className="project-create-dialog" ref={containerRef} role="dialog" tabIndex={-1}>
        <div className="project-create-head">
          <h2 id="project-create-title">{t("create.title")}</h2>
          <button aria-label={t("create.close")} className="project-create-close" onClick={closeProjectCreate} type="button">
            <X size={16} />
          </button>
        </div>
        <ol className="project-create-steps" aria-label={t("create.stepsLabel")}>
          {([1, 2, 3] as const).map((value) => (
            <li aria-current={step === value ? "step" : undefined} key={value}>
              {t(value === 1 ? "create.stepAbout" : value === 2 ? "create.stepTeam" : "create.stepStructure")}
            </li>
          ))}
        </ol>
        <EmployeeNamesList />
        <div className="form-grid compact-form project-create-body">
          {step === 1 && (
            <>
              {field("businessUnitId", t("fields.portfolio"), (
                <select
                  {...invalid("businessUnitId")}
                  value={form.businessUnitId}
                  onChange={(event) => {
                    const unit = units.find((candidate) => candidate.id === event.currentTarget.value);
                    clear("businessUnitId");
                    setUnitConfirmed(false);
                    update({ businessUnitId: unit?.id ?? "", portfolio: unit?.name ?? "", parentId: "" });
                  }}
                >
                  <option value="">{t("create.chooseUnit")}</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>{unit.name}</option>
                  ))}
                </select>
              ), true)}
              {needsUnitConfirmation && chosenUnit && (
                <label className="span-2 project-create-confirm">
                  <input checked={unitConfirmed} onChange={(event) => { setUnitConfirmed(event.target.checked); clear("confirmUnit"); }} type="checkbox" />
                  {t("create.confirmUnit", { unit: chosenUnit.name })}
                  <FieldError id="new-project-confirmUnit-error" message={errors.confirmUnit} />
                </label>
              )}
              {field("name", t("fields.name"), (
                <input {...invalid("name")} autoFocus value={form.name} placeholder={t("create.namePlaceholder")} onChange={(event) => { clear("name"); update({ name: event.target.value }); }} />
              ), true)}
              {field("code", t("fields.code"), (
                <input {...invalid("code")} value={form.code} placeholder="CRM" onChange={(event) => { setCodeTouched(true); clear("code"); update({ code: event.target.value }); }} />
              ))}
              {field("projectManager", t("fields.pm"), (
                <input
                  {...invalid("projectManager")}
                  list={EMPLOYEE_NAMES_LIST_ID}
                  readOnly={managerLocked}
                  title={managerLocked ? t("create.managerIsYou") : undefined}
                  value={form.projectManager}
                  onChange={(event) => { setManagerTouched(true); clear("projectManager"); update({ projectManager: event.target.value }); }}
                />
              ))}
              {field("startDate", t("fields.start"), (
                <input {...invalid("startDate")} type="date" value={form.startDate} onChange={(event) => { clear("startDate"); clear("targetDate"); update({ startDate: event.target.value }); }} />
              ))}
              {field("targetDate", t("fields.targetDate"), (
                <input {...invalid("targetDate")} type="date" value={form.targetDate} onChange={(event) => { clear("targetDate"); update({ targetDate: event.target.value }); }} />
              ))}
              <p className="form-note span-2">{t("create.codeNote")}</p>
            </>
          )}
          {step === 2 && (
            <>
              <p className="form-note span-2">{t("create.teamNote")}</p>
              {([["sponsor", "fields.sponsor"], ["productOwner", "fields.productOwner"], ["hwTpm", "fields.hwTpm"], ["swTpm", "fields.swTpm"]] as const).map(([key, label]) => (
                <label key={key}>
                  {t(label)}
                  <input list={EMPLOYEE_NAMES_LIST_ID} value={form[key]} onChange={(event) => update({ [key]: event.target.value })} />
                </label>
              ))}
            </>
          )}
          {step === 3 && (
            <>
              <fieldset className="span-2 project-create-sources">
                <legend>{t("create.structureSource")}</legend>
                {(["standard", "copy", "table"] as const).map((value) => (
                  <label key={value}>
                    <input checked={source === value} name="structure-source" onChange={() => { setSource(value); setFailure(null); }} type="radio" />
                    <span>
                      <strong>{t(`create.source.${value}`)}</strong>
                      <small>{t(`create.source.${value}Hint`)}</small>
                    </span>
                  </label>
                ))}
              </fieldset>
              {source === "copy" && (
                <div className="form-field span-2">
                  <ProjectStructureCopyField
                    error={copyOptionsError}
                    isLoading={loadingCopies}
                    options={copyOptions}
                    value={form.copyCurrentStructureFrom}
                    onChange={(copyCurrentStructureFrom) => update({ copyCurrentStructureFrom })}
                  />
                  <span className="form-note">{t("create.copyHelp")}</span>
                </div>
              )}
              {source === "table" && (
                <div className="span-2 project-create-table">
                  <p className="wbs-table-hint">{t("ui.wbsTable.importHint")}</p>
                  <WbsTableSourceInputs busy={busy} reader={reader} />
                  {reader.error && <p className="automation-error" role="alert">{reader.error}</p>}
                  <WbsTableColumnsPreview busy={busy} reader={reader} />
                  {reader.table && (
                    <div className="wbs-table-actions">
                      <button disabled={busy || !reader.ready} onClick={() => void checkTable()} type="button">
                        {t("ui.wbsTable.check")}
                      </button>
                    </div>
                  )}
                  {plan && <WbsImportPlanView fieldLabel={reader.fieldLabel} plan={plan} />}
                </div>
              )}
            </>
          )}
        </div>
        {failure && <p className="automation-error project-create-failure" role="alert">{failure}</p>}
        <div className="project-create-actions">
          {step > 1 && (
            <button className="secondary-button" disabled={busy} onClick={() => setStep((current) => (current - 1) as Step)} type="button">
              {t("create.back")}
            </button>
          )}
          {step < 3 ? (
            <button onClick={next} type="button">{t("create.next")}</button>
          ) : (
            <button disabled={busy || !tableReady || !copyReady} onClick={() => void create()} type="button">
              {busy ? t("create.creating") : t("create.title")}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
