import { Plus, Save, Table2 } from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ClipboardEvent,
  type CSSProperties,
} from "react";
import { apiClient } from "../api/client";
import { usePageContext } from "./PageContext";

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
  const [{ columns, rows }, setTable] = useState(() => normalizeTable(null));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [activeCell, setActiveCell] = useState<{ rowIndex: number; columnIndex: number } | null>(
    null,
  );

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

  const handlePaste = (event: ClipboardEvent<HTMLDivElement>) => {
    if (!canEdit || !activeCell) return;
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!clipboardText || !/[\t\n\r]/.test(clipboardText)) return;
    const pastedGrid = parseClipboardGrid(clipboardText);
    if (pastedGrid.length === 0) return;

    event.preventDefault();
    setTable((current) => {
      let nextColumns = [...current.columns];
      const requiredColumnCount = activeCell.columnIndex + Math.max(...pastedGrid.map((row) => row.length));
      while (nextColumns.length < requiredColumnCount) {
        nextColumns = [
          ...nextColumns,
          {
            id: makeId("col"),
            title: `Столбец ${nextColumns.length + 1}`,
          },
        ];
      }

      let nextRows = current.rows.map((row) => ({
        ...row,
        cells: { ...row.cells },
      }));
      const requiredRowCount = activeCell.rowIndex + pastedGrid.length;
      while (nextRows.length < requiredRowCount) {
        nextRows = [...nextRows, emptyRow(nextColumns)];
      }

      pastedGrid.forEach((pastedRow, pastedRowIndex) => {
        const targetRow = nextRows[activeCell.rowIndex + pastedRowIndex];
        if (!targetRow) return;
        pastedRow.forEach((value, pastedColumnIndex) => {
          const targetColumn = nextColumns[activeCell.columnIndex + pastedColumnIndex];
          if (!targetColumn) return;
          targetRow.cells[targetColumn.id] = value;
        });
      });

      nextRows = nextRows.map((row) => ({
        ...row,
        cells: {
          ...Object.fromEntries(nextColumns.map((column) => [column.id, ""])),
          ...row.cells,
        },
      }));
      return { columns: nextColumns, rows: nextRows };
    });
    setDirty(true);
    setNotice(`Вставлено строк: ${pastedGrid.length}`);
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

      <div className="business-requirements-table-shell" onPaste={handlePaste}>
        <div
          className="business-requirements-table"
          style={{ "--requirements-template": tableTemplate } as CSSProperties}
        >
          <div className="requirements-row requirements-head">
            <div className="requirements-corner" />
            {columns.map((column) => (
              <input
                key={column.id}
                value={column.title}
                disabled={!canEdit}
                onChange={(event) => updateColumnTitle(column.id, event.target.value)}
                aria-label={`Название столбца ${column.title}`}
              />
            ))}
          </div>
          {rows.map((row, rowIndex) => (
            <div className="requirements-row" key={row.id}>
              <div className="requirements-row-number">{rowIndex + 1}</div>
              {columns.map((column, columnIndex) => (
                <textarea
                  key={column.id}
                  value={row.cells[column.id] ?? ""}
                  disabled={!canEdit}
                  onFocus={() => setActiveCell({ rowIndex, columnIndex })}
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
