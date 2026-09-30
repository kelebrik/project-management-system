import { useMemo, useState } from "react";
import { createFloatById } from "../../app/wbsViewModels";
import { wbsFloatTone, wbsFloatValue } from "../../app/wbsTable";
import { useI18n } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import "../../styles/wbs-float.css";
import { DateDriversPopover } from "./DateDriversPopover";

/**
 * How many working days a row can slip before the project's last date moves:
 * red when it already holds that date, amber when close. Read from the
 * critical path calculation of the current plan. A click shows what holds the
 * row's dates.
 */
export function WbsFloatCell({ item }: { item: { id: string; status: string } }) {
  const { t } = useI18n();
  const { project } = usePageContext();
  const floatById = useMemo(() => createFloatById(project?.criticalPath), [project?.criticalPath]);
  const value = wbsFloatValue(item, floatById);
  const tone = wbsFloatTone(value);
  // The button the explanation opened from; none while it is closed.
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // The value opens what holds the row's dates.
  return (
    <span className="wbs-float-cell">
      <button
        aria-expanded={anchor !== null}
        aria-label={`${value === null ? "—" : value}. ${t("ui.drivers.open")}`}
        className={`wbs-float wbs-float-${tone}`}
        onClick={(event) => {
          const button = event.currentTarget;
          setAnchor((current) => (current ? null : button));
        }}
        title={value === null ? t("ui.wbsFloat.none") : t("ui.wbsFloat.hint", { days: value })}
        type="button"
      >
        {value === null ? "—" : value}
      </button>
      {anchor && <DateDriversPopover anchor={anchor} itemId={item.id} onClose={() => setAnchor(null)} />}
    </span>
  );
}
