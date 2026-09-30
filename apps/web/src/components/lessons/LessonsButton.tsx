import { GraduationCap } from "lucide-react";
import { useState } from "react";
import { useI18n } from "../../i18n/I18nProvider";
import "../../styles/lessons.css";
import { LessonsDrawer } from "./LessonsDrawer";

/** "Project lessons" on the Status page; editors write them, also after the project closes. */
export function LessonsButton({ projectId, canWrite }: { projectId: string; canWrite: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="lessons-button" onClick={() => setOpen(true)} type="button">
        <GraduationCap aria-hidden="true" size={15} />
        {t("ui.lessons.button")}
      </button>
      {open && <LessonsDrawer canWrite={canWrite} onClose={() => setOpen(false)} projectId={projectId} />}
    </>
  );
}
