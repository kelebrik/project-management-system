import { Camera } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/plan-snapshots.css";
import { PlanSnapshotsDrawer } from "./PlanSnapshotsDrawer";

/** "Plan snapshots" in the Structure header: anyone who reads the project compares, editors take snapshots. */
export function PlanSnapshotsButton({ projectId, canWrite, hasUnsavedEdits }: { projectId: string; canWrite: boolean; hasUnsavedEdits: () => boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="plan-snapshots-button" onClick={() => setOpen(true)} type="button">
        <Camera aria-hidden="true" size={15} />
        {t("ui.snapshots.button")}
      </button>
      {open && <PlanSnapshotsDrawer canWrite={canWrite} hasUnsavedEdits={hasUnsavedEdits} onClose={() => setOpen(false)} projectId={projectId} />}
    </>
  );
}
