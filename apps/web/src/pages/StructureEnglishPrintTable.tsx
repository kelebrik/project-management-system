import type { WbsTableCssProperties } from "../app/uiStyleTypes";
import { WBS_COLUMN_EN_LABELS } from "../app/wbsEnglishPrint";
import type { WbsTableColumnKey } from "../app/wbsTable";
import type { WbsItem } from "../app/domainTypes";
import type { WbsFormState } from "../app/formState";

type EnglishRow = {
  displayCode: string;
  displayLevel: number;
  draft: WbsFormState;
  item: WbsItem;
  translation: { text: string };
};

/** The Structure in English for printing: built only when an English print is asked for. */
export function StructureEnglishPrintTable({
  title,
  template,
  columns,
  rows,
  cellValue,
}: {
  title: string;
  template: string;
  columns: Array<{ key: WbsTableColumnKey }>;
  rows: EnglishRow[];
  cellValue: (key: WbsTableColumnKey, item: WbsItem, draft: WbsFormState, displayCode: string, translatedTitle: string) => string;
}) {
  return (
    <>
      <div className="wbs-english-print-title">
        {title}
      </div>
      <div
        className="wbs-english-print-table"
        style={
          {
            "--wbs-table-template": template,
          } as WbsTableCssProperties
        }
      >
        <div className="wbs-english-print-head">
          {columns.map((column) => (
            <div
              key={`en-head-${column.key}`}
              className={`wbs-english-print-cell wbs-english-print-head-cell ${
                column.key === "level"
                  ? "level-column"
                  : column.key === "structure"
                  ? "structure-column"
                  : ""
              }`}
            >
              {WBS_COLUMN_EN_LABELS[column.key]}
            </div>
          ))}
        </div>
        {rows.map((row) => {
          const {
            displayCode,
            displayLevel,
            draft,
            item,
            translation,
          } = row;
          const translatedTitle = translation.text;
          return (
            <div
              key={`en-row-${item.id}`}
              className={`wbs-english-print-row ${
                item.type === "MILESTONE" || item.type === "GOAL"
                  ? "milestone"
                  : ""
              }`}
            >
              {columns.map((column) => (
                <div
                  key={`en-cell-${item.id}-${column.key}`}
                  className={`wbs-english-print-cell ${
                    column.key === "level"
                      ? "wbs-english-print-level"
                      : column.key === "structure"
                      ? "wbs-english-print-structure"
                      : ""
                  }`}
                >
                  {column.key === "structure" ? (
                    <div
                      className="wbs-english-structure-cell"
                      style={{
                        paddingLeft: `${displayLevel * 12 + 4}px`,
                      }}
                    >
                      <span className="wbs-english-code">
                        {displayCode}
                      </span>
                      <span>{translatedTitle}</span>
                    </div>
                  ) : (
                    cellValue(
                      column.key,
                      item,
                      draft,
                      displayCode,
                      translatedTitle,
                    )
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </>
  );
}
