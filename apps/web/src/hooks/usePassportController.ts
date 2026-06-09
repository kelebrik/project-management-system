import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { PassportRow, ProjectUiState } from "../app/domainTypes";

type SaveProjectUiState = (patch: ProjectUiState) => Promise<void>;

type UsePassportControllerOptions = {
  projectId: string | null;
  passportRows: PassportRow[];
  setPassportRows: Dispatch<SetStateAction<PassportRow[]>>;
  setSavingPassportRows: Dispatch<SetStateAction<boolean>>;
  saveProjectUiState: SaveProjectUiState;
  refreshProject: (projectId?: string) => Promise<void>;
  setError: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
};

export function usePassportController({
  projectId,
  passportRows,
  setPassportRows,
  setSavingPassportRows,
  saveProjectUiState,
  refreshProject,
  setError,
  setNotice,
}: UsePassportControllerOptions) {
  const updatePassportRow = useCallback(
    (rowId: string, patch: Partial<PassportRow>) => {
      setPassportRows((currentRows) =>
        currentRows.map((row) =>
          row.id === rowId ? { ...row, ...patch } : row,
        ),
      );
    },
    [setPassportRows],
  );

  const addPassportRow = useCallback(
    (afterIndex: number) => {
      const nextRow: PassportRow = {
        id: `passport-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        field: "Новое поле",
        description: "",
      };
      setPassportRows((currentRows) => [
        ...currentRows.slice(0, afterIndex + 1),
        nextRow,
        ...currentRows.slice(afterIndex + 1),
      ]);
    },
    [setPassportRows],
  );

  const deletePassportRow = useCallback(
    (rowId: string) => {
      setPassportRows((currentRows) =>
        currentRows.length <= 1
          ? currentRows
          : currentRows.filter((row) => row.id !== rowId),
      );
    },
    [setPassportRows],
  );

  const savePassportRows = useCallback(async () => {
    if (!projectId) return;
    setSavingPassportRows(true);
    setError(null);
    setNotice(null);
    try {
      const rows = passportRows.map((row) => ({
        ...row,
        field: row.field.trim() || "Поле",
        description: row.description.trim(),
      }));
      await saveProjectUiState({ passportRows: rows });
      setPassportRows(rows);
      await refreshProject(projectId);
      setNotice("Паспорт проекта сохранен");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Не удалось сохранить паспорт проекта",
      );
    } finally {
      setSavingPassportRows(false);
    }
  }, [
    passportRows,
    projectId,
    refreshProject,
    saveProjectUiState,
    setError,
    setNotice,
    setPassportRows,
    setSavingPassportRows,
  ]);

  return {
    updatePassportRow,
    addPassportRow,
    deletePassportRow,
    savePassportRows,
  };
}
