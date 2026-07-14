import { ClipboardPaste, Plus, Save, Table2, Trash2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
  type CSSProperties,
} from "react";
import { apiClient } from "../api/client";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";

type RequirementColumn = {
  id: string;
  title: string;
};

type RequirementRow = {
  id: string;
  cells: Record<string, string>;
};

type BusinessRequirementsTable = {
  id: string;
  projectId: string;
  columns: RequirementColumn[];
  rows: RequirementRow[];
  updatedAt: string;
};

const DEFAULT_COLUMNS: RequirementColumn[] = [
  { id: "col_1", title: "ID" },
  { id: "col_2", title: "Бизнес-требование" },
  { id: "col_3", title: "Приоритет" },
  { id: "col_4", title: "Статус" },
  { id: "col_5", title: "Комментарий" },
];

function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyRow(columns: RequirementColumn[]): RequirementRow {
  return {
    id: makeId("row"),
    cells: Object.fromEntries(columns.map((column) => [column.id, ""])),
  };
}

function normalizeTable(data: BusinessRequirementsTable | null) {
  const columns = data?.columns.length ? data.columns : DEFAULT_COLUMNS;
  const rows = data?.rows.length
    ? data.rows.map((row) => ({
        ...row,
        cells: {
          ...Object.fromEntries(columns.map((column) => [column.id, ""])),
          ...row.cells,
        },
      }))
    : [emptyRow(columns), emptyRow(columns), emptyRow(columns)];
  return { columns, rows };
}

function parseClipboardGrid(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .filter((row, index, rows) => row.length > 0 || index < rows.length - 1)
    .map((row) => row.split("\t"));
}

export function ProjectBusinessRequirementsPage() {
  const { isReadOnly, project, setError, setNotice } = usePageContext();
  const confirm = useConfirm();
  const [{ columns, rows }, setTable] = useState(() => normalizeTable(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!project?.id) return;
    let cancelled = false;
    setLoading(true);
    setDirty(false);
    apiClient
      .get<BusinessRequirementsTable>(
        `/api/projects/${project.id}/business-requirements`,
        "Не удалось загрузить бизнес-требования",
      )
      .then((data) => {
        if (cancelled) return;
        setTable(normalizeTable(data));
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Не удалось загрузить бизнес-требования");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, setError]);

  const columnCount = columns.length;
  const rowCount = rows.length;
  const canEdit = !isReadOnly && !loading && !saving;
  const tableTemplate = useMemo(
    () => `56px repeat(${Math.max(1, columnCount)}, minmax(180px, 1fr))`,
    [columnCount],
  );

  const updateCell = (rowId: string, columnId: string, value: string) => {
    setTable((current) => ({
      columns: current.columns,
      rows: current.rows.map((row) =>
        row.id === rowId ? { ...row, cells: { ...row.cells, [columnId]: value } } : row,
      ),
    }));
    setDirty(true);
  };

  const updateColumnTitle = (columnId: string, title: string) => {
    setTable((current) => ({
      columns: current.columns.map((column) =>
        column.id === columnId ? { ...column, title } : column,
      ),
      rows: current.rows,
    }));
    setDirty(true);
  };

  const addRow = () => {
    setTable((current) => ({
      columns: current.columns,
      rows: [...current.rows, emptyRow(current.columns)],
    }));
    setDirty(true);
  };

  const addColumn = () => {
    setTable((current) => {
      const column = {
        id: makeId("col"),
        title: `Столбец ${current.columns.length + 1}`,
      };
      return {
        columns: [...current.columns, column],
        rows: current.rows.map((row) => ({
          ...row,
          cells: { ...row.cells, [column.id]: "" },
        })),
      };
    });
    setDirty(true);
  };

  const deleteRow = (rowId: string) => {
    if (rows.length <= 1) return;
    setTable((current) => ({
      columns: current.columns,
      rows: current.rows.filter((row) => row.id !== rowId),
    }));
    setDirty(true);
  };

  const deleteColumn = (columnId: string) => {
    if (columns.length <= 1) return;
    setTable((current) => ({
      columns: current.columns.filter((column) => column.id !== columnId),
      rows: current.rows.map((row) => ({
        ...row,
        cells: Object.fromEntries(
          Object.entries(row.cells).filter(([cellColumnId]) => cellColumnId !== columnId),
        ),
      })),
    }));
    setDirty(true);
  };

  const saveTable = async () => {
    if (!project?.id) return;
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiClient.put<BusinessRequirementsTable>(
        `/api/projects/${project.id}/business-requirements`,
        { columns, rows },
        "Не удалось сохранить бизнес-требования",
      );
      setDirty(false);
      setNotice("Бизнес-требования сохранены");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось сохранить бизнес-требования");
    } finally {
      setSaving(false);
    }
  };

  const replaceTableFromClipboard = (clipboardText: string) => {
    const pastedGrid = parseClipboardGrid(clipboardText);
    if (pastedGrid.length === 0) return;

    const columnCount = Math.max(...pastedGrid.map((row) => row.length));
    if (columnCount === 0) return;

    const headerRow = pastedGrid[0] ?? [];
    const nextColumns = Array.from({ length: columnCount }, (_, columnIndex) => ({
      id: makeId("col"),
      title: headerRow[columnIndex]?.trim() || `Столбец ${columnIndex + 1}`,
    }));
    const bodyRows = pastedGrid.slice(1);
    const nextRows = (bodyRows.length ? bodyRows : [[]]).map((pastedRow) => ({
      id: makeId("row"),
      cells: Object.fromEntries(
        nextColumns.map((column, columnIndex) => [column.id, pastedRow[columnIndex] ?? ""]),
      ),
    }));

    setTable({ columns: nextColumns, rows: nextRows });
    setDirty(true);
    setNotice(`Вставлена таблица: ${nextRows.length} строк, ${nextColumns.length} столбцов`);
  };

  const pasteTableFromClipboard = async () => {
    if (!canEdit) return;
    setError(null);
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText || !/[\t\n\r]/.test(clipboardText)) {
        setError("В буфере обмена нет табличных данных");
        return;
      }
      replaceTableFromClipboard(clipboardText);
    } catch {
      setError("Браузер не дал доступ к буферу обмена");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!canEdit) return;
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText || !/[\t\n\r]/.test(clipboardText)) return;

    event.preventDefault();
    replaceTableFromClipboard(clipboardText);
  };

  return (
    <article className="panel project-card project-module-page business-requirements-page">
      <div className="panel-title">
        <div>
          <h2>Бизнес требования</h2>
          <p>Бизнес-требования проекта.</p>
        </div>
        <div className="business-requirements-actions">
          <button type="button" onClick={addRow} disabled={!canEdit}>
            <Plus size={16} />
            Добавить строку
          </button>
          <button type="button" onClick={addColumn} disabled={!canEdit}>
            <Table2 size={16} />
            Добавить столбец
          </button>
          <button type="button" onClick={() => void pasteTableFromClipboard()} disabled={!canEdit}>
            <ClipboardPaste size={16} />
            Вставить Excel
          </button>
          <button type="button" onClick={() => void saveTable()} disabled={!canEdit || !dirty}>
            <Save size={16} />
            {saving ? "Сохраняю..." : "Сохранить"}
          </button>
        </div>
      </div>

      <div className="business-requirements-status">
        <span>{loading ? "Загрузка..." : `${rowCount} строк, ${columnCount} столбцов`}</span>
        <span className={dirty ? "dirty" : "saved"}>{dirty ? "Есть несохраненные изменения" : "Сохранено"}</span>
      </div>

      <div className="business-requirements-table-shell" onPaste={handlePaste} tabIndex={canEdit ? 0 : -1}>
        <div
          className="business-requirements-table"
          style={{ "--requirements-template": tableTemplate } as CSSProperties}
        >
          <div className="requirements-row requirements-head">
            <div className="requirements-corner" />
            {columns.map((column) => (
              <div className="requirements-column-title" key={column.id}>
                <input
                  value={column.title}
                  disabled={!canEdit}
                  onChange={(event) => updateColumnTitle(column.id, event.target.value)}
                  aria-label={`Название столбца ${column.title}`}
                />
                <button
                  type="button"
                  title="Удалить столбец"
                  aria-label={`Удалить столбец ${column.title}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Удалить столбец?",
                        message: "Столбец и его значения будут удалены.",
                        confirmLabel: "Удалить",
                      })
                    ) {
                      deleteColumn(column.id);
                    }
                  }}
                  disabled={!canEdit || columns.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div className="requirements-row" key={row.id}>
              <div className="requirements-row-number">
                <span>{rowIndex + 1}</span>
                <button
                  type="button"
                  title="Удалить строку"
                  aria-label={`Удалить строку ${rowIndex + 1}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Удалить строку?",
                        confirmLabel: "Удалить",
                      })
                    ) {
                      deleteRow(row.id);
                    }
                  }}
                  disabled={!canEdit || rows.length <= 1}
                >
                  <Trash2 size={14} />
                </button>
              </div>
              {columns.map((column) => (
                <textarea
                  key={column.id}
                  value={row.cells[column.id] ?? ""}
                  disabled={!canEdit}
                  onChange={(event) => updateCell(row.id, column.id, event.target.value)}
                  aria-label={`Строка ${rowIndex + 1}, ${column.title}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
