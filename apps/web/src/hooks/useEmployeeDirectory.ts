import { useEffect, useState } from "react";
import { apiClient } from "../api/client";

export type DirectoryEmployee = { id: string; name: string; department: string };

/** Id of the shared <datalist> that name fields use to offer people from the directory. */
export const EMPLOYEE_NAMES_LIST_ID = "pms-employee-names";

/**
 * The people directory kept on the leave schedule, for pickers in other
 * modules. It reloads when the window regains focus, so someone just added on
 * the leave schedule shows up without reloading the page.
 */
export function useEmployeeDirectory() {
  const [employees, setEmployees] = useState<DirectoryEmployee[]>([]);
  useEffect(() => {
    let cancelled = false;
    const load = () =>
      apiClient
        .get<DirectoryEmployee[]>("/api/employees")
        .then((list) => {
          if (!cancelled) setEmployees(list);
        })
        // The directory is a convenience: without it the field stays free text.
        .catch(() => undefined);
    void load();
    window.addEventListener("focus", load);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", load);
    };
  }, []);
  return employees;
}
