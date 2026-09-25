import { EMPLOYEE_NAMES_LIST_ID, useEmployeeDirectory } from "../hooks/useEmployeeDirectory";

/** Suggests people from the directory to any input with list={EMPLOYEE_NAMES_LIST_ID}. */
export function EmployeeNamesList() {
  const employees = useEmployeeDirectory();
  return (
    <datalist id={EMPLOYEE_NAMES_LIST_ID}>
      {employees.map((employee) => (
        <option key={employee.id} value={employee.name}>
          {employee.department}
        </option>
      ))}
    </datalist>
  );
}
