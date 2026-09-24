import { useState } from "react";
import type { LeaveEmployee } from "../../app/leaveScheduleModel";
import { useConfirm } from "../../hooks/useConfirm";
import { useI18n } from "../../i18n/I18nProvider";
import { LeaveDialog } from "./LeaveDialog";

type EmployeeDraft = Pick<LeaveEmployee, "name" | "department" | "isActive">;

function EmployeeRow({
  employee,
  departmentsListId,
  onSave,
  onRemove,
}: {
  employee: LeaveEmployee;
  departmentsListId: string;
  onSave: (patch: EmployeeDraft) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EmployeeDraft>({
    name: employee.name,
    department: employee.department,
    isActive: employee.isActive,
  });
  const changed =
    draft.name.trim() !== employee.name ||
    draft.department.trim() !== employee.department ||
    draft.isActive !== employee.isActive;
  return (
    <tr className={employee.isActive ? "" : "archived"}>
      <td>
        <input
          aria-label={t("ui.leave.name")}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </td>
      <td>
        <input
          aria-label={t("ui.leave.department")}
          list={departmentsListId}
          value={draft.department}
          onChange={(event) => setDraft({ ...draft, department: event.target.value })}
        />
      </td>
      <td className="leave-check-cell">
        <input
          aria-label={t("ui.leave.active")}
          checked={draft.isActive}
          type="checkbox"
          onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
        />
      </td>
      <td className="leave-row-actions">
        <button
          className="primary"
          disabled={!changed || !draft.name.trim()}
          onClick={() => void onSave({ ...draft, name: draft.name.trim(), department: draft.department.trim() })}
          type="button"
        >
          {t("ui.leave.save")}
        </button>
        <button className="leave-danger-button" onClick={() => void onRemove()} type="button">
          {t("ui.leave.removeEmployee")}
        </button>
      </td>
    </tr>
  );
}

export function LeaveEmployeesDialog({
  employees,
  departments,
  onCreate,
  onUpdate,
  onRemove,
  onClose,
}: {
  employees: LeaveEmployee[];
  departments: string[];
  onCreate: (draft: EmployeeDraft) => Promise<void>;
  onUpdate: (employee: LeaveEmployee, patch: EmployeeDraft) => Promise<void>;
  onRemove: (employee: LeaveEmployee) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const confirm = useConfirm();
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const departmentsListId = "leave-departments";

  const guard = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  };

  return (
    <LeaveDialog closeLabel={t("ui.leave.close")} onClose={onClose} title={t("ui.leave.employees")} wide>
      <datalist id={departmentsListId}>
        {departments.map((value) => (
          <option key={value} value={value} />
        ))}
      </datalist>
      <form
        className="leave-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void guard(async () => {
            await onCreate({ name: name.trim(), department: department.trim(), isActive: true });
            setName("");
          });
        }}
      >
        <input
          aria-label={t("ui.leave.name")}
          placeholder={t("ui.leave.name")}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        <input
          aria-label={t("ui.leave.department")}
          list={departmentsListId}
          placeholder={t("ui.leave.department")}
          value={department}
          onChange={(event) => setDepartment(event.target.value)}
        />
        <button className="primary" disabled={!name.trim()} type="submit">
          {t("ui.leave.addEmployee")}
        </button>
      </form>
      {error && (
        <p className="leave-form-error" role="alert">
          {error}
        </p>
      )}
      <table className="leave-table">
        <thead>
          <tr>
            <th>{t("ui.leave.name")}</th>
            <th>{t("ui.leave.department")}</th>
            <th>{t("ui.leave.active")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <EmployeeRow
              departmentsListId={departmentsListId}
              employee={employee}
              key={`${employee.id}:${employee.name}:${employee.department}:${employee.isActive}`}
              onRemove={() =>
                guard(async () => {
                  const confirmed = await confirm({
                    title: t("ui.leave.removeEmployeeTitle", { name: employee.name }),
                    message: t("ui.leave.removeEmployeeMessage"),
                    confirmLabel: t("ui.leave.removeEmployee"),
                    tone: "danger",
                  });
                  if (confirmed) await onRemove(employee);
                })
              }
              onSave={(patch) => guard(() => onUpdate(employee, patch))}
            />
          ))}
        </tbody>
      </table>
    </LeaveDialog>
  );
}
