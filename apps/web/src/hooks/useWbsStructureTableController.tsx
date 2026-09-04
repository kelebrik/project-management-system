import {
  type ClipboardEvent as ReactClipboardEvent,
  type KeyboardEventHandler,
  useEffect,
  useRef,
} from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

import type { WbsItemStatus, WbsItemType, WbsTreeItem } from "../app/domainTypes";
import {
  type WbsFormState,
  wbsToForm,
} from "../app/formState";
import { useConfirm } from "./useConfirm";
import {
  editableKeyHandler,
  rememberEditableInitialValue,
} from "../app/editableFields";
import {
  WBS_COLUMN_FIELDS,
  WBS_PREDECESSOR_TYPE_BY_KEY,
  type ProjectCalendarCode,
  type WbsTableColumnKey,
  type WbsPredecessorKey,
  type WbsPredecessorTiming,
} from "../app/wbsTable";
import { WbsUrlField } from "../components/WbsUrlField";
import {
  resolveDraftPredecessorCode,
  wbsDraftDisplayLevel,
  wbsToneClass,
} from "../app/wbsTree";
import { wbsStatusLabel, wbsTypeLabel } from "../app/labels";
import type { WbsScheduleDriver } from "../wbsScheduleDriver";
import {
  emptyReadonlyValue,
  formatReadonlyPercent,
  normalizeWbsPasteValue,
  type UseWbsStructureTableControllerOptions,
} from "./useWbsStructureTableController.support";

export function useWbsStructureTableController({
  activeWbsItemId,
  collapsedWbsIds,
  deleteWbsItem,
  draftWbsCodes,
  insertWbsRow,
  isReadOnly,
  orderedWbsColumns,
  saveWbsDraftPatch,
  saveWbsTypePatch,
  saveWbsItem,
  selectedWbsIds,
  setDraggedWbsItemId,
  setError,
  setNotice,
  setSelectedWbsIds,
  setWbsDrafts,
  setWbsDropTargetId,
  toggleWbsCollapse,
  updateWbsDraft,
  visibleStructureWbsTree,
  wbsDependencies,
  wbsDrafts,
  wbsDraftsRef,
  wbsSort,
  wbsTree,
}: UseWbsStructureTableControllerOptions) {
  const confirm = useConfirm();
  const pendingSaveTimersRef = useRef<Record<string, number>>({});
  const suppressedBlurSaveTargetsRef = useRef<WeakSet<EventTarget>>(
    new WeakSet(),
  );

  const cancelScheduledWbsSave = (itemId: string) => {
    const timerId = pendingSaveTimersRef.current[itemId];
    if (timerId === undefined) return;
    window.clearTimeout(timerId);
    delete pendingSaveTimersRef.current[itemId];
  };

  const scheduleWbsSave = (
    itemId: string,
    options: { silent?: boolean; scheduleDriver?: WbsScheduleDriver } = {
      silent: true,
    },
  ) => {
    cancelScheduledWbsSave(itemId);
    pendingSaveTimersRef.current[itemId] = window.setTimeout(() => {
      delete pendingSaveTimersRef.current[itemId];
      void saveWbsItem(itemId, options);
    }, 650);
  };

  const suppressCurrentBlurSave = (target: EventTarget) => {
    const targets = suppressedBlurSaveTargetsRef.current;
    targets.add(target);
    window.setTimeout(() => targets.delete(target), 0);
  };

  const handleWbsBlur = (
    target: EventTarget,
    itemId: string,
    options?: { silent?: boolean; scheduleDriver?: WbsScheduleDriver },
  ) => {
    if (suppressedBlurSaveTargetsRef.current.delete(target)) return;
    scheduleWbsSave(itemId, options);
  };

  useEffect(
    () => () => {
      Object.values(pendingSaveTimersRef.current).forEach((timerId) =>
        window.clearTimeout(timerId),
      );
    },
    [],
  );

  const wbsEditKeyHandler = (
    itemId: string,
    scheduleDriver?: WbsScheduleDriver,
  ): KeyboardEventHandler<HTMLInputElement> =>
    (event) =>
      editableKeyHandler({
        onEnter: () => {
          cancelScheduledWbsSave(itemId);
          suppressCurrentBlurSave(event.currentTarget);
          void saveWbsItem(itemId, { silent: true, scheduleDriver });
        },
        onEscape: () => {
          cancelScheduledWbsSave(itemId);
          suppressCurrentBlurSave(event.currentTarget);
          const currentItem = wbsTree.find((item) => item.id === itemId);
          if (!currentItem) return;
          setWbsDrafts(() => {
            const source = wbsToForm(currentItem, wbsDependencies);
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
      })(event);

  const isWbsCellDirty = (
    columnKey: WbsTableColumnKey,
    item: WbsTreeItem,
    draft: WbsFormState,
  ) => {
    const source = wbsToForm(item, wbsDependencies);
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

  const setPredecessorTiming = (
    itemId: string,
    columnKey: WbsPredecessorKey,
    timing: WbsPredecessorTiming,
  ) => {
    const timingKey = WBS_PREDECESSOR_TYPE_BY_KEY[columnKey];
    const current = wbsDraftsRef.current[itemId] ?? wbsDrafts[itemId];
    if (!current || current[timingKey] === timing) return;
    saveWbsDraftPatch(
      itemId,
      { [timingKey]: timing },
      { silent: true },
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
    if (isReadOnly) return;
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
    if (isReadOnly) {
      if (columnKey === "structure") {
        return (
          <div
            className="wbs-work-cell read-only-cell"
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
              className="wbs-row-select wbs-readonly-control"
              disabled
              tabIndex={-1}
              aria-label={`Строка ${draft.code} доступна только для просмотра`}
            />
            <span
              className={`wbs-color-dot ${
                item.type === "MILESTONE" || item.type === "GOAL"
                  ? "tone-o"
                  : wbsToneClass(item)
              }`}
            />
            <input
              className="wbs-code-input wbs-readonly-control"
              readOnly
              tabIndex={-1}
              value={draftWbsCodes.get(item.id) ?? draft.code}
            />
            <input
              className="wbs-title-input wbs-readonly-control"
              readOnly
              tabIndex={-1}
              value={emptyReadonlyValue(draft.title)}
            />
          </div>
        );
      }

      if (columnKey === "level") {
        return (
          <div className="wbs-level-cell read-only-cell">
            <div className="wbs-level-stepper" aria-hidden="true">
              <button type="button" disabled tabIndex={-1}>
                -
              </button>
              <button type="button" disabled tabIndex={-1}>
                +
              </button>
            </div>
            <input
              className="wbs-level-input wbs-readonly-control"
              readOnly
              tabIndex={-1}
              value={emptyReadonlyValue(draft.wbsLevel)}
            />
            <span className="wbs-readonly-row-controls" aria-hidden="true" />
          </div>
        );
      }

      if (
        columnKey === "predecessor1" ||
        columnKey === "predecessor2" ||
        columnKey === "predecessor3" ||
        columnKey === "predecessor4" ||
        columnKey === "predecessor5" ||
        columnKey === "predecessor6"
      ) {
        const predecessorCode = resolveDraftPredecessorCode(
          draft[columnKey],
          wbsTree,
          wbsDrafts,
          draftWbsCodes,
        );
        const timing = draft[WBS_PREDECESSOR_TYPE_BY_KEY[columnKey]] ?? "FS";
        return (
          <div className="wbs-predecessor-editor read-only-cell">
            <input
              className="wbs-predecessor-input wbs-readonly-control"
              readOnly
              tabIndex={-1}
              value={predecessorCode}
              placeholder="Код"
            />
            <div className="wbs-predecessor-timing" aria-hidden="true">
              <button
                type="button"
                className={`wbs-predecessor-timing-button ${
                  timing === "SS" ? "active" : ""
                }`}
                disabled
                tabIndex={-1}
              >
                <ArrowUp size={11} strokeWidth={2.8} />
              </button>
              <button
                type="button"
                className={`wbs-predecessor-timing-button ${
                  timing === "FS" ? "active" : ""
                }`}
                disabled
                tabIndex={-1}
              >
                <ArrowDown size={11} strokeWidth={2.8} />
              </button>
            </div>
          </div>
        );
      }

      let value: string;
      switch (columnKey) {
        case "type":
          value = wbsTypeLabel(draft.type);
          break;
        case "status":
          value = wbsStatusLabel(draft.status);
          break;
        case "owner":
          value = emptyReadonlyValue(draft.owner);
          break;
        case "comment":
          value = emptyReadonlyValue(draft.comment);
          break;
        case "start":
          value = emptyReadonlyValue(draft.startDate);
          break;
        case "due":
          value = emptyReadonlyValue(draft.dueDate);
          break;
        case "workDays":
          value = emptyReadonlyValue(draft.workDays);
          break;
        case "calendarDays":
          value = emptyReadonlyValue(draft.calendarDays);
          break;
        case "calendar":
          value = emptyReadonlyValue(draft.calendarCode);
          break;
        case "effortPercent":
          value = formatReadonlyPercent(draft.effortPercent);
          break;
        case "progress":
          value = formatReadonlyPercent(draft.progress);
          break;
        case "jiraTicketUrl":
          return (
            <WbsUrlField
              contextLabel={item.code}
              isReadOnly
              kind="jira"
              value={draft.jiraTicketUrl}
              onSave={() => undefined}
            />
          );
        case "mattermostUrl":
          return (
            <WbsUrlField
              contextLabel={item.code}
              isReadOnly
              kind="mattermost"
              value={draft.mattermostUrl}
              onSave={() => undefined}
            />
          );
        case "leadLag":
          value = emptyReadonlyValue(draft.leadLagDays);
          break;
        default:
          value = "—";
      }
      return <span className="wbs-readonly-value">{value}</span>;
    }

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
              onBlur={(event) =>
                handleWbsBlur(event.currentTarget, item.id)
              }
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
              onBlur={(event) =>
                handleWbsBlur(event.currentTarget, item.id)
              }
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
                onClick={async () => {
                  if (
                    await confirm({
                      title: "Удалить строку Структуры?",
                      confirmLabel: "Удалить",
                    })
                  ) {
                    void deleteWbsItem(item.id);
                  }
                }}
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
              saveWbsTypePatch(item.id, event.target.value as WbsItemType, {
                silent: true,
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
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
              const nextStatus = event.target.value as WbsItemStatus;
              const patch = {
                status: nextStatus,
                ...(nextStatus === "CANCELLED" ? { workDays: "0" } : {}),
              };
              cancelScheduledWbsSave(item.id);
              saveWbsDraftPatch(item.id, patch, {
                silent: true,
                ...(nextStatus === "CANCELLED"
                  ? { scheduleDriver: "workDays" as const }
                  : {}),
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
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
            onBlur={(event) => handleWbsBlur(event.currentTarget, item.id)}
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
              scheduleWbsSave(item.id, {
                silent: true,
                scheduleDriver: "dates",
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "dates")}
            onBlur={(event) =>
              handleWbsBlur(event.currentTarget, item.id, {
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
              scheduleWbsSave(item.id, {
                silent: true,
                scheduleDriver: "dates",
              });
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id, "dates")}
            onBlur={(event) =>
              handleWbsBlur(event.currentTarget, item.id, {
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
            onBlur={(event) =>
              handleWbsBlur(event.currentTarget, item.id, {
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
            onBlur={(event) => handleWbsBlur(event.currentTarget, item.id)}
          />
        );
      case "calendar":
        return (
          <select
            value={draft.calendarCode}
            onChange={(event) => {
              cancelScheduledWbsSave(item.id);
              saveWbsDraftPatch(
                item.id,
                {
                  calendarCode: event.target.value as ProjectCalendarCode,
                },
                { silent: true },
              );
            }}
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
          >
            <option value="RU">RU</option>
            <option value="CN">CN</option>
            <option value="RU_CN">RU+CN</option>
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
            onBlur={(event) => handleWbsBlur(event.currentTarget, item.id)}
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
            onBlur={(event) => handleWbsBlur(event.currentTarget, item.id)}
          />
        );
      case "jiraTicketUrl":
        return (
          <WbsUrlField
            contextLabel={item.code}
            isReadOnly={false}
            kind="jira"
            value={draft.jiraTicketUrl}
            onInvalid={setError}
            onSave={(jiraTicketUrl) =>
              saveWbsDraftPatch(
                item.id,
                { jiraTicketUrl },
                { silent: true },
              )
            }
          />
        );
      case "mattermostUrl":
        return (
          <WbsUrlField
            contextLabel={item.code}
            isReadOnly={false}
            kind="mattermost"
            value={draft.mattermostUrl}
            onInvalid={setError}
            onSave={(mattermostUrl) =>
              saveWbsDraftPatch(
                item.id,
                { mattermostUrl },
                { silent: true },
              )
            }
          />
        );
      case "comment":
        return (
          <input
            value={draft.comment}
            onChange={(event) =>
              updateWbsDraft(item.id, { comment: event.target.value })
            }
            onFocus={(event) => rememberEditableInitialValue(event.currentTarget)}
            onKeyDown={wbsEditKeyHandler(item.id)}
            onBlur={(event) => handleWbsBlur(event.currentTarget, item.id)}
            placeholder="Комментарий"
          />
        );
      case "predecessor1":
      case "predecessor2":
      case "predecessor3":
      case "predecessor4":
      case "predecessor5":
      case "predecessor6": {
        const predecessorCode = resolveDraftPredecessorCode(
          draft[columnKey],
          wbsTree,
          wbsDrafts,
          draftWbsCodes,
        );
        const timing = draft[WBS_PREDECESSOR_TYPE_BY_KEY[columnKey]] ?? "FS";
        const hasPredecessor = predecessorCode.trim().length > 0;
        return (
          <div className="wbs-predecessor-editor">
            <input
              className="wbs-predecessor-input"
              value={predecessorCode}
              onChange={(event) =>
                updateWbsDraft(item.id, { [columnKey]: event.target.value })
              }
              onFocus={(event) =>
                rememberEditableInitialValue(event.currentTarget)
              }
              onKeyDown={wbsEditKeyHandler(item.id)}
              onBlur={(event) =>
                handleWbsBlur(event.currentTarget, item.id)
              }
              placeholder="Код"
            />
            <div className="wbs-predecessor-timing" aria-label="Расчет срока">
              <button
                type="button"
                className={`wbs-predecessor-timing-button ${
                  timing === "SS" ? "active" : ""
                }`}
                disabled={!hasPredecessor}
                aria-label="Считать от начала предшественника"
                aria-pressed={timing === "SS"}
                title="Считать от начала предшественника"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPredecessorTiming(item.id, columnKey, "SS")}
              >
                <ArrowUp size={11} strokeWidth={2.8} />
              </button>
              <button
                type="button"
                className={`wbs-predecessor-timing-button ${
                  timing === "FS" ? "active" : ""
                }`}
                disabled={!hasPredecessor}
                aria-label="Считать от конца предшественника"
                aria-pressed={timing === "FS"}
                title="Считать от конца предшественника"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setPredecessorTiming(item.id, columnKey, "FS")}
              >
                <ArrowDown size={11} strokeWidth={2.8} />
              </button>
            </div>
          </div>
        );
      }
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
            onBlur={(event) => handleWbsBlur(event.currentTarget, item.id)}
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
