import { useI18n } from "../i18n/I18nProvider";
import { Plus, Save, Table2, Trash2 } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { apiClient } from "../api/client";
import { usePageContext } from "./PageContext";
import { useConfirm } from "../hooks/useConfirm";
import { SaveStateIndicator } from "../components/SaveStateIndicator";

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


export function ProjectBusinessRequirementsPage() {
  const { t, tCount } = useI18n();
  const tEffect = useEffectEvent(t);
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
        tEffect("requirements.loadError"),
      )
      .then((data) => {
        if (cancelled) return;
        setTable(normalizeTable(data));
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : tEffect("requirements.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [project?.id, setError]);

  useEffect(() => {
    (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = dirty;
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      (window as Window & { __pmsUnsaved?: boolean }).__pmsUnsaved = false;
    };
  }, [dirty]);

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
        title: t("requirements.column", { count: current.columns.length + 1 }),
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
        t("requirements.saveError"),
      );
      setDirty(false);
      setNotice(t("requirements.saved"));
    } catch (error) {
      setError(error instanceof Error ? error.message : t("requirements.saveError"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="panel project-card project-module-page business-requirements-page">
      <div className="panel-title">
        <div>
          <h2>{t("requirements.title")}</h2>
          <p>{t("requirements.description")}</p>
        </div>
        <div className="business-requirements-actions">
          <button type="button" onClick={addRow} disabled={!canEdit}>
            <Plus size={16} />
            {t("requirements.addRow")}
          </button>
          <button type="button" onClick={addColumn} disabled={!canEdit}>
            <Table2 size={16} />
            {t("requirements.addColumn")}
          </button>
          <button type="button" onClick={() => void saveTable()} disabled={!canEdit || !dirty}>
            <Save size={16} />
            {saving ? t("fields.saving") : t("fields.save")}
          </button>
        </div>
      </div>

      <div className="business-requirements-status">
        <span>{loading ? t("requirements.loading") : `${tCount("table.rows", rowCount)}, ${tCount("table.columns", columnCount)}`}</span>
        <SaveStateIndicator saving={saving} dirty={dirty} />
      </div>

      <div className="business-requirements-table-shell" tabIndex={canEdit ? 0 : -1}>
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
                  aria-label={t("requirements.columnName", { title: column.title })}
                />
                <button
                  type="button"
                  title={t("requirements.deleteColumn")}
                  aria-label={t("requirements.deleteColumnName", { title: column.title })}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("requirements.deleteColumnConfirm"),
                        message: t("requirements.deleteColumnMessage"),
                        confirmLabel: t("fields.delete"),
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
                  title={t("requirements.deleteRow")}
                  aria-label={t("requirements.deleteRowNumber", { count: rowIndex + 1 })}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: t("requirements.deleteRowConfirm"),
                        confirmLabel: t("fields.delete"),
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
                  aria-label={t("requirements.cell", { count: rowIndex + 1, title: column.title })}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
    </article>
  );
}
