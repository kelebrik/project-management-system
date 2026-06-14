import {
  type ClipboardEvent as ReactClipboardEvent,
  type Dispatch,
  type KeyboardEventHandler,
  type MutableRefObject,
  type SetStateAction,
} from "react";

import type {
  WbsItemStatus,
  WbsItemType,
  WbsTreeItem,
} from "../app/domainTypes";
import {
  type WbsFormState,
  wbsToForm,
} from "../app/formState";
import { isHttpsUrl } from "../app/http";
import {
  editableKeyHandler,
  rememberEditableInitialValue,
} from "../app/editableFields";
import {
  WBS_COLUMN_FIELDS,
  type ProjectCalendarCode,
  type WbsTableColumn,
  type WbsTableColumnKey,
  type WbsSortState,
} from "../app/wbsTable";
import {
  resolveDraftPredecessorCode,
  wbsDraftDisplayLevel,
  wbsToneClass,
} from "../app/wbsTree";
import { wbsStatusLabel, wbsTypeLabel } from "../app/labels";
import type { WbsScheduleDriver } from "../wbsScheduleDriver";

type SaveWbsItem = (
  itemId: string,
  options?: {
    silent?: boolean;
    draftOverride?: WbsFormState;
    scheduleDriver?: WbsScheduleDriver;
  },
) => Promise<void>;

type SaveWbsDraftPatch = (
  itemId: string,
  patch: Partial<WbsFormState>,
  options?: { silent?: boolean; scheduleDriver?: WbsScheduleDriver },
) => void;

type UseWbsStructureTableControllerOptions = {
  activeWbsItemId: string | null;
  collapsedWbsIds: Set<string>;
  deleteWbsItem: (itemId: string) => Promise<void>;
  draftWbsCodes: Map<string, string>;
  insertWbsRow: (
    afterIndex: number,
    sourceRows?: WbsTreeItem[],
  ) => Promise<void>;
  orderedWbsColumns: WbsTableColumn[];
  saveWbsDraftPatch: SaveWbsDraftPatch;
  saveWbsItem: SaveWbsItem;
  selectedWbsIds: Set<string>;
  setDraggedWbsItemId: Dispatch<SetStateAction<string | null>>;
  setNotice: Dispatch<SetStateAction<string | null>>;
  setSelectedWbsIds: Dispatch<SetStateAction<Set<string>>>;
  setWbsDrafts: Dispatch<SetStateAction<Record<string, WbsFormState>>>;
  setWbsDropTargetId: Dispatch<SetStateAction<string | null>>;
  toggleWbsCollapse: (itemId: string) => void;
  updateWbsDraft: (itemId: string, patch: Partial<WbsFormState>) => void;
  visibleStructureWbsTree: WbsTreeItem[];
  wbsDrafts: Record<string, WbsFormState>;
  wbsDraftsRef: MutableRefObject<Record<string, WbsFormState>>;
  wbsSort: WbsSortState | null;
  wbsTree: WbsTreeItem[];
};

function normalizeWbsPasteValue(
  field: keyof WbsFormState,
  value: string,
): string | ProjectCalendarCode | WbsItemType | WbsItemStatus {
  const trimmedValue = value.trim();
  if (field === "type") {
    const matchedType = ([
      "PHASE",
      "WORK_PACKAGE",
      "DELIVERABLE",
      "MILESTONE",
      "GOAL",
      "TASK",
    ] as WbsItemType[]).find(
      (type) =>
        type.toLowerCase() === trimmedValue.toLowerCase() ||
        wbsTypeLabel(type).toLowerCase() === trimmedValue.toLowerCase(),
    );
    return matchedType ?? "TASK";
  }
  if (field === "status") {
    const matchedStatus = ([
      "NOT_STARTED",
      "IN_PROGRESS",
      "IN_REVIEW",
      "AT_RISK",
      "BLOCKED",
      "DONE",
      "CANCELLED",
    ] as WbsItemStatus[]).find(
      (status) =>
        status.toLowerCase() === trimmedValue.toLowerCase() ||
        wbsStatusLabel(status).toLowerCase() === trimmedValue.toLowerCase(),
    );
    return matchedStatus ?? "NOT_STARTED";
  }
  if (field === "calendarCode") {
    return trimmedValue.toUpperCase() === "CN" ? "CN" : "RU";
  }
  return trimmedValue;
}

export function useWbsStructureTableController({
  activeWbsItemId,
  collapsedWbsIds,
  deleteWbsItem,
  draftWbsCodes,
  insertWbsRow,
  orderedWbsColumns,
  saveWbsDraftPatch,
  saveWbsItem,
  selectedWbsIds,
  setDraggedWbsItemId,
  setNotice,
  setSelectedWbsIds,
  setWbsDrafts,
  setWbsDropTargetId,
  toggleWbsCollapse,
  updateWbsDraft,
  visibleStructureWbsTree,
  wbsDrafts,
  wbsDraftsRef,
  wbsSort,
  wbsTree,
}: UseWbsStructureTableControllerOptions) {
  const wbsEditKeyHandler = (
    itemId: string,
    scheduleDriver?: WbsScheduleDriver,
  ): KeyboardEventHandler =>
    editableKeyHandler({
      onEnter: () => {
        void saveWbsItem(itemId, { silent: true, scheduleDriver });
      },
      onEscape: () => {
        const currentItem = wbsTree.find((item) => item.id === itemId);
        if (!currentItem) return;
        setWbsDrafts(() => {
          const source = wbsToForm(currentItem);
          const nextDrafts = {
            ...wbsDraftsRef.current,
            [itemId]: {
              ...source,
              code: draftWbsCodes.get(itemId) ?? source.code,
            },
          };
          wbsDraftsRef.current = nextDrafts;
          return nextDrafts;
        });
      },
    });

  const isWbsCellDirty = (
    columnKey: WbsTableColumnKey,
    item: WbsTreeItem,
    draft: WbsFormState,
  ) => {
    const source = wbsToForm(item);
    if (columnKey === "structure") {
      return (
        draft.title !== source.title ||
        draftWbsCodes.get(item.id) !== item.code
      );
    }
    return WBS_COLUMN_FIELDS[columnKey].some(
      (field) => draft[field] !== source[field],
    );
  };

  const toggleWbsSelection = (itemId: string, checked: boolean) => {
    setSelectedWbsIds((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(itemId);
      } else {
        next.delete(itemId);
      }
      return next;
    });
  };

  const handleWbsPaste = (event: ReactClipboardEvent<HTMLDivElement>) => {
    const clipboardText = event.clipboardData.getData("text/plain");
    if (!activeWbsItemId || !clipboardText || !/[\t\n\r]/.test(clipboardText)) {
      return;
    }
    const tableRows = visibleStructureWbsTree;
    const startIndex = tableRows.findIndex(
      (item) => item.id === activeWbsItemId,
    );
    if (startIndex === -1) return;
    const pastedRows = clipboardText
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .filter((row) => row.length > 0)
      .map((row) => row.split("\t"));
    if (pastedRows.length === 0) return;
    event.preventDefault();
    setWbsDrafts((current) => {
      const next = { ...current };
      pastedRows.forEach((row, rowIndex) => {
        const item = tableRows[startIndex + rowIndex];
        if (!item || !next[item.id]) return;
        let draft = { ...next[item.id] };
        row.forEach((cellValue, columnIndex) => {
          const column = orderedWbsColumns[columnIndex];
          if (!column) return;
          const fields = WBS_COLUMN_FIELDS[column.key];
          const field = fields[0];
          if (!field) return;
          draft = {
            ...draft,
            [field]: normalizeWbsPasteValue(field, cellValue),
          };
        });
        next[item.id] = draft;
      });
      wbsDraftsRef.current = next;
      return next;
    });
    setNotice(`Вставлено строк из Excel: ${pastedRows.length}`);
  };

  const renderWbsCell = (
    columnKey: WbsTableColumnKey,
    item: WbsTreeItem,
    draft: WbsFormState,
  ) => {
    switch (columnKey) {
      case "structure":
        return (
          <div
            className="wbs-work-cell"
            style={{
              paddingLeft: `${wbsDraftDisplayLevel(item, draft) * 18 + 8}px`,
            }}
          >
            {item.children.length > 0 ? (
              <button
                type="button"
                className="tree-toggle"
                onClick={() => toggleWbsCollapse(item.id)}
                aria-label={
                  collapsedWbsIds.has(item.id)
                    ? "Раскрыть элемент Структуры"
                    : "Схлопнуть элемент Структуры"
                }
              >
                {collapsedWbsIds.has(item.id) ? "+" : "-"}
              </button>
            ) : (
              <span className="tree-spacer" />
            )}
            <input
              type="checkbox"
              className="wbs-row-select"
              checked={selectedWbsIds.has(item.id)}
              onChange={(event) =>
                toggleWbsSelection(item.id, event.target.checked)
              }
              onClick={(event) => event.stopPropagation()}
              aria-label={`Выбрать строку ${draft.code}`}
            />
            <span
              className={`wbs-color-dot ${
                item.type === "MILESTONE" || item.type === "GOAL"
                  ? "tone-o"
                  : wbsToneClass(item)
              }`}
            />
            <input
              className="wbs-code-input"
              readOnly
              value={draftWbsCodes.get(item.id) ?? draft.code}
            />
            <input
              className="wbs-title-input"
              value={draft.title}
              onChange={(event) =>
                updateWbsDraft(item.id, { title: event.target.value })
              }
              onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
              onKeyDown={wbsEditKeyHandler(item.id)}
              onBlur={() => void saveWbsItem(item.id, { silent: true })}
            />
          </div>
        );
      case "level":
        return (
          <div className="wbs-level-cell">
            <div
              className="wbs-level-stepper"
              aria-label="Изменить уровень вложения"
            >
              <button
                type="button"
                onClick={() => {
                  const currentLevel = draft.wbsLevel
                    ? Number(draft.wbsLevel)
                    : 1;
                  const nextLevel = String(Math.max(1, currentLevel - 1));
                  saveWbsDraftPatch(
                    item.id,
                    { wbsLevel: nextLevel },
                    { silent: true },
                  );
                }}
                aria-label="Уменьшить уровень вложения"
              >
                -
              </button>
              <button
                type="button"
                onClick={() => {
                  const currentLevel = draft.wbsLevel
                    ? Number(draft.wbsLevel)
                    : 1;
                  const nextLevel = String(Math.min(12, currentLevel + 1));
                  saveWbsDraftPatch(
                    item.id,
                    { wbsLevel: nextLevel },
                    { silent: true },
                  );
                }}
                aria-label="Увеличить уровень вложения"
              >
                +
              </button>
            </div>
            <input
              type="number"
              className="wbs-level-input"
              value={draft.wbsLevel}
              onChange={(event) =>
                updateWbsDraft(item.id, { wbsLevel: event.target.value })
              }
              onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
              onKeyDown={wbsEditKeyHandler(item.id)}
              onBlur={() => void saveWbsItem(item.id, { silent: true })}
            />
            <div className="wbs-row-controls">
              <button
                type="button"
                className="wbs-row-drag-handle"
                draggable={!wbsSort}
                onDragStart={(event) => {
                  if (wbsSort) {
                    event.preventDefault();
                    return;
                  }
                  setDraggedWbsItemId(item.id);
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("application/x-wbs-item", item.id);
                }}
                onDragEnd={() => {
                  setDraggedWbsItemId(null);
                  setWbsDropTargetId(null);
                }}
                aria-label={
                  wbsSort
                    ? "Перемещение строк доступно после отключения сортировки"
                    : "Перетащить строку Структуры"
                }
                title={
                  wbsSort
                    ? "Перемещение строк доступно после отключения сортировки"
                    : "Перетащить строку Структуры"
                }
              >
                ::
              </button>
              <button
                type="button"
                className="wbs-row-delete-button"
                onClick={() => deleteWbsItem(item.id)}
                aria-label="Удалить строку Структуры"
              >
                x
              </button>
            </div>
            <button
              type="button"
              className="wbs-inline-insert-button"
              onClick={() => {
                const afterIndex = visibleStructureWbsTree.findIndex(
                  (visibleItem) => visibleItem.id === item.id,
                );
                if (afterIndex >= 0) {
                  void insertWbsRow(afterIndex, visibleStructureWbsTree);
                }
              }}
              aria-label="Добавить строку Структуры ниже"
            >
              +
            </button>
          </div>
        );
      case "type":
        return (
          <select
            value={draft.type}
            onChange={(event) => {
              updateWbsDraft(item.id, {
                type: event.target.value as WbsItemType,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          >
            <option value="PHASE">{wbsTypeLabel("PHASE")}</option>
            <option value="WORK_PACKAGE">{wbsTypeLabel("WORK_PACKAGE")}</option>
            <option value="DELIVERABLE">{wbsTypeLabel("DELIVERABLE")}</option>
            <option value="MILESTONE">{wbsTypeLabel("MILESTONE")}</option>
            <option value="GOAL">{wbsTypeLabel("GOAL")}</option>
            <option value="TASK">{wbsTypeLabel("TASK")}</option>
          </select>
        );
      case "status":
        return (
          <select
            value={draft.status}
            onChange={(event) => {
              updateWbsDraft(item.id, {
                status: event.target.value as WbsItemStatus,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          >
            <option value="NOT_STARTED">{wbsStatusLabel("NOT_STARTED")}</option>
            <option value="IN_PROGRESS">{wbsStatusLabel("IN_PROGRESS")}</option>
            <option value="IN_REVIEW">{wbsStatusLabel("IN_REVIEW")}</option>
            <option value="AT_RISK">{wbsStatusLabel("AT_RISK")}</option>
            <option value="BLOCKED">{wbsStatusLabel("BLOCKED")}</option>
            <option value="DONE">{wbsStatusLabel("DONE")}</option>
            <option value="CANCELLED">{wbsStatusLabel("CANCELLED")}</option>
          </select>
        );
      case "owner":
        return (
          <input
            value={draft.owner}
            onChange={(event) =>
              updateWbsDraft(item.id, { owner: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "start":
        return (
          <input
            type="date"
            value={draft.startDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              updateWbsDraft(item.id, {
                startDate: nextDate,
                forecastStartDate: nextDate,
                excelStartDate: nextDate,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "dates")}
            onBlur={() =>
              void saveWbsItem(item.id, {
                silent: true,
                scheduleDriver: "dates",
              })
            }
          />
        );
      case "due":
        return (
          <input
            type="date"
            value={draft.dueDate}
            onChange={(event) => {
              const nextDate = event.target.value;
              updateWbsDraft(item.id, {
                dueDate: nextDate,
                forecastDueDate: nextDate,
                excelEndDate: nextDate,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "dates")}
            onBlur={() =>
              void saveWbsItem(item.id, {
                silent: true,
                scheduleDriver: "dates",
              })
            }
          />
        );
      case "workDays":
        return (
          <input
            type="number"
            value={draft.workDays}
            onChange={(event) =>
              updateWbsDraft(item.id, { workDays: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "workDays")}
            onBlur={() =>
              void saveWbsItem(item.id, {
                silent: true,
                scheduleDriver: "workDays",
              })
            }
          />
        );
      case "calendarDays":
        return (
          <input
            type="number"
            value={draft.calendarDays}
            onChange={(event) =>
              updateWbsDraft(item.id, { calendarDays: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "calendar":
        return (
          <select
            value={draft.calendarCode}
            onChange={(event) => {
              updateWbsDraft(item.id, {
                calendarCode: event.target.value as ProjectCalendarCode,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          >
            <option value="RU">RU</option>
            <option value="CN">CN</option>
          </select>
        );
      case "effortPercent":
        return (
          <input
            type="number"
            min="0"
            max="100"
            value={draft.effortPercent}
            onChange={(event) =>
              updateWbsDraft(item.id, { effortPercent: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "progress":
        return (
          <input
            type="number"
            min="0"
            max="100"
            value={draft.progress}
            onChange={(event) =>
              updateWbsDraft(item.id, { progress: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      case "jiraTicketUrl":
        return (
          <input
            className={
              draft.jiraTicketUrl && !isHttpsUrl(draft.jiraTicketUrl)
                ? "input-error"
                : ""
            }
            value={draft.jiraTicketUrl}
            onChange={(event) =>
              updateWbsDraft(item.id, { jiraTicketUrl: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
            placeholder="https://..."
          />
        );
      case "predecessor1":
      case "predecessor2":
      case "predecessor3":
      case "predecessor4":
      case "predecessor5":
      case "predecessor6":
        return (
          <input
            value={resolveDraftPredecessorCode(
              draft[columnKey],
              wbsTree,
              wbsDrafts,
              draftWbsCodes,
            )}
            onChange={(event) =>
              updateWbsDraft(item.id, { [columnKey]: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
            placeholder="Код"
          />
        );
      case "leadLag":
        return (
          <input
            type="number"
            value={draft.leadLagDays}
            onChange={(event) =>
              updateWbsDraft(item.id, { leadLagDays: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={() => void saveWbsItem(item.id, { silent: true })}
          />
        );
      default:
        return null;
    }
  };

  return {
    handleWbsPaste,
    isWbsCellDirty,
    renderWbsCell,
  };
}
