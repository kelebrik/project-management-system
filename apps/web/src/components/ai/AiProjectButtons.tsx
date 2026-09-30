import { CalendarClock, FileText, MessageCircleQuestion, Scale, ShieldAlert, Sparkles } from "lucide-react";
import { useState } from "react";
import { useAiStatus } from "../../hooks/useAiStatus";
import { useI18n } from "../../i18n/I18nProvider";
import { AskProjectDrawer } from "./AskProjectDrawer";
import { MeetingPrepDrawer } from "./MeetingPrepDrawer";
import { RiskAssistantDrawer } from "./RiskAssistantDrawer";
import { StatusReportDrawer } from "./StatusReportDrawer";
import { WorkloadRebalanceDrawer } from "./WorkloadRebalanceDrawer";
import { WbsDraftDrawer } from "./WbsDraftDrawer";

/**
 * "Report for management" on the project overview. Like the structure draft,
 * it is shown only where a model is connected: a corporate installation
 * without GigaChat does not show these helpers at all.
 */
export function StatusReportButton({ projectId, projectName }: { projectId: string; projectName: string }) {
  const { t } = useI18n();
  const { status, usable } = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!status || !usable) return null;
  return (
    <>
      <button className="ai-launch-button" onClick={() => setOpen(true)} type="button">
        <FileText aria-hidden="true" size={14} />
        {t("ui.ai.reportButton")}
      </button>
      {open && <StatusReportDrawer ai={status} onClose={() => setOpen(false)} projectId={projectId} projectName={projectName} />}
    </>
  );
}

/**
 * "Draft with AI" in the structure header. Disabled while the structure has
 * unsaved edits: adding the draft reloads the project and would drop them.
 */
export function WbsDraftButton({ projectId, unsavedRows, onApplied }: { projectId: string; unsavedRows: number; onApplied: () => Promise<void> | void }) {
  const { t } = useI18n();
  const { status, usable } = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!status || !usable) return null;
  return (
    <>
      <button
        className="ai-launch-button"
        disabled={unsavedRows > 0}
        onClick={() => setOpen(true)}
        title={unsavedRows > 0 ? t("ui.ai.wbsSaveFirst") : undefined}
        type="button"
      >
        <Sparkles aria-hidden="true" size={14} />
        {t("ui.ai.wbsButton")}
      </button>
      {open && <WbsDraftDrawer ai={status} onApplied={onApplied} onClose={() => setOpen(false)} projectId={projectId} />}
    </>
  );
}

/** "Prepare the meeting" in the issue register header; hands over to the meeting notes after the meeting. */
export function MeetingPrepButton({ projectId, projectName, onOpenMeetingNotes }: { projectId: string; projectName: string; onOpenMeetingNotes: () => void }) {
  const { t } = useI18n();
  const { status, usable } = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!status || !usable) return null;
  return (
    <>
      <button className="ai-launch-button" onClick={() => setOpen(true)} type="button">
        <CalendarClock aria-hidden="true" size={15} />
        {t("ui.ai.prepButton")}
      </button>
      {open && (
        <MeetingPrepDrawer
          ai={status}
          onClose={() => setOpen(false)}
          onOpenMeetingNotes={() => {
            setOpen(false);
            onOpenMeetingNotes();
          }}
          projectId={projectId}
          projectName={projectName}
        />
      )}
    </>
  );
}

/** "Risk assistant" in the risk register; the suggestions are applied through the register's own requests. */
export function RiskAssistantButton({ projectId, onApplied }: { projectId: string; onApplied: () => Promise<void> | void }) {
  const { t } = useI18n();
  const { status, usable } = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!status || !usable) return null;
  return (
    <>
      <button className="ai-launch-button" onClick={() => setOpen(true)} type="button">
        <ShieldAlert aria-hidden="true" size={15} />
        {t("ui.ai.riskButton")}
      </button>
      {open && <RiskAssistantDrawer ai={status} onApplied={onApplied} onClose={() => setOpen(false)} projectId={projectId} />}
    </>
  );
}

/** "Ask the project" on the project overview, next to the report for management. */
export function AskProjectButton({ projectId }: { projectId: string }) {
  const { t } = useI18n();
  const { status, usable } = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!status || !usable) return null;
  return (
    <>
      <button className="ai-launch-button" onClick={() => setOpen(true)} type="button">
        <MessageCircleQuestion aria-hidden="true" size={14} />
        {t("ui.ai.askOpen")}
      </button>
      {open && <AskProjectDrawer ai={status} onClose={() => setOpen(false)} projectId={projectId} />}
    </>
  );
}

/** "Even out the load" on the workload page, for someone who may change at least one project there. */
export function WorkloadRebalanceButton({ onApplied }: { onApplied: () => void }) {
  const { t } = useI18n();
  const { status, usable } = useAiStatus();
  const [open, setOpen] = useState(false);
  if (!status || !usable) return null;
  return (
    <>
      <button className="ai-launch-button" onClick={() => setOpen(true)} type="button">
        <Scale aria-hidden="true" size={15} />
        {t("ui.ai.rebalanceButton")}
      </button>
      {open && <WorkloadRebalanceDrawer ai={status} onApplied={onApplied} onClose={() => setOpen(false)} />}
    </>
  );
}
