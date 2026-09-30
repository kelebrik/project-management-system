import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";
import type { WbsItem } from "../../app/domainTypes";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/wbs-table.css";
import { WbsTableDrawer } from "./WbsTableDrawer";

/** "Excel / Sheets" in the Structure header: anyone who reads the project exports, editors import. */
export function WbsTableButton(props: {
  projectId: string;
  projectCode: string;
  items: WbsItem[];
  canWrite: boolean;
  hasUnsavedEdits: () => boolean;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="wbs-table-button" onClick={() => setOpen(true)} type="button">
        <FileSpreadsheet aria-hidden="true" size={15} />
        {t("ui.wbsTable.button")}
      </button>
      {open && <WbsTableDrawer {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
