import { useEffect, useState } from "react";
import { apiClient } from "../../api/client";
import type { LeaveEmployee } from "../../app/leaveScheduleModel";
import { useConfirm } from "../../hooks/useConfirm";
import { useI18n } from "../../i18n/I18nProvider";
import { LeaveDialog } from "./LeaveDialog";

type EmployeeDraft = Pick<LeaveEmployee, "name" | "department" | "isActive" | "userId">;
type SystemUser = { id: string; name: string; email: string; isActive: boolean };

function UserSelect({
  value,
  users,
  employees,
  employeeId,
  onChange,
}: {
  value: string | null;
  users: SystemUser[];
  employees: LeaveEmployee[];
  employeeId: string | null;
  onChange: (userId: string | null) => void;
}) {
  const { t } = useI18n();
  const holders = new Map(
    employees.filter((employee) => employee.userId && employee.id !== employeeId).map((employee) => [employee.userId, employee.name]),
  );
  // Active users can be picked; a switched-off user stays listed only while this person is linked to them.
  const options = users.filter((user) => user.isActive || user.id === value);
  return (
    <select aria-label={t("ui.leave.systemUser")} value={value ?? ""} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">{t("ui.leave.notLinked")}</option>
      {options.map((user) => {
        const label = `${user.name} · ${user.email}`;
        const holder = holders.get(user.id);
        return (
          <option disabled={Boolean(holder)} key={user.id} value={user.id}>
            {holder
              ? t("ui.leave.userTakenBy", { name: label, employee: holder })
              : user.isActive
                ? label
                : t("ui.leave.userDisabled", { name: label })}
          </option>
        );
      })}
    </select>
  );
}

function EmployeeRow({
  employee,
  employees,
  users,
  departmentsListId,
  onSave,
  onRemove,
}: {
  employee: LeaveEmployee;
  employees: LeaveEmployee[];
  users: SystemUser[];
  departmentsListId: string;
  onSave: (patch: EmployeeDraft) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<EmployeeDraft>({
    name: employee.name,
    department: employee.department,
    isActive: employee.isActive,
    userId: employee.userId,
  });
  const changed =
    draft.name.trim() !== employee.name ||
    draft.department.trim() !== employee.department ||
    draft.isActive !== employee.isActive ||
    draft.userId !== employee.userId;
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
      <td>
        <UserSelect
          employeeId={employee.id}
          employees={employees}
          onChange={(userId) => setDraft({ ...draft, userId })}
          users={users}
          value={draft.userId}
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
  const [userId, setUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<SystemUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  // A flag, so the message follows the language and the list is fetched once per opening.
  const [usersFailed, setUsersFailed] = useState(false);
  const departmentsListId = "leave-departments";

  // System users are loaded only here, so their e-mails never reach the schedule itself.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<SystemUser[]>("/api/users")
      .then((list) => {
        if (!cancelled) setUsers(list);
      })
      .catch(() => {
        if (!cancelled) setUsersFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
        className="leave-inline-form leave-employee-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void guard(async () => {
            await onCreate({ name: name.trim(), department: department.trim(), isActive: true, userId });
            setName("");
            setUserId(null);
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
        <UserSelect
          employeeId={null}
          employees={employees}
          onChange={(nextUserId) => {
            setUserId(nextUserId);
            // Picking a user fills in the name when it has not been typed yet.
            const user = users.find((candidate) => candidate.id === nextUserId);
            if (user && !name.trim()) setName(user.name);
          }}
          users={users}
          value={userId}
        />
        <button className="primary" disabled={!name.trim()} type="submit">
          {t("ui.leave.addEmployee")}
        </button>
      </form>
      {(error || usersFailed) && (
        <p className="leave-form-error" role="alert">
          {error ?? t("ui.leave.usersLoadFailed")}
        </p>
      )}
      <table className="leave-table">
        <thead>
          <tr>
            <th>{t("ui.leave.name")}</th>
            <th>{t("ui.leave.department")}</th>
            <th>{t("ui.leave.systemUser")}</th>
            <th>{t("ui.leave.active")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <EmployeeRow
              departmentsListId={departmentsListId}
              employee={employee}
              employees={employees}
              key={`${employee.id}:${employee.name}:${employee.department}:${employee.isActive}:${employee.userId ?? ""}`}
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
              users={users}
            />
          ))}
        </tbody>
      </table>
    </LeaveDialog>
  );
}
