import { Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { parseMeetingNotes, type MeetingDraft } from "@pms/shared";
import { ApiError, apiClient } from "../../api/client";
import type { ProjectDetails } from "../../app/domainTypes";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useI18n as useInterfaceTranslation } from "../../i18n/I18nProvider";
import { usePageContext } from "../../pages/PageContext";
import "../../styles/automation.css";
import { AutomationError } from "./AutomationPanel";

type DraftRow = MeetingDraft & { selected: boolean; parentId: string; state?: "saved" | "unknown" | "error"; message?: string };
type AiStatus = { enabled: boolean; allowed: boolean; provider?: string; model?: string; setup?: "gigachat" | null };
type Prepared = { by: "ai"; model: string } | { by: "lines" };

const normalized = (value: string) => value.toLocaleLowerCase("ru-RU").replaceAll("ё", "е").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const SCORES = [0, 1, 2, 3, 4, 5];

/**
 * Meeting notes to draft tasks, open issues and risks. With an AI provider set
 * up the model prepares the drafts; otherwise explicit "Risk: ..." style lines
 * are parsed. Either way nothing is created until the user reviews and ticks
 * the drafts, and each draft keeps the quote it came from.
 */
export function MeetingNotesContent() {
  const { t: uiText } = useInterfaceTranslation();
  const { project: rawProject, isReadOnly, isClosedProject, refreshProject, isProjectModuleEnabled } = usePageContext();
  const project = rawProject as ProjectDetails;
  const kindEnabled = (kind: MeetingDraft["kind"]) => isProjectModuleEnabled(kind === "TASK" ? "structure" : kind === "RISK" ? "raid" : "issues");
  const [text, setText] = useState("");
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [ai, setAi] = useState<AiStatus | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const useAi = Boolean(ai?.enabled && ai.allowed);

  useEffect(() => {
    let active = true;
    apiClient
      .get<AiStatus>("/api/ai/status")
      .then((status) => active && setAi(status))
      .catch(() => active && setAi({ enabled: false, allowed: false }));
    return () => {
      active = false;
      abortRef.current?.abort();
    };
  }, []);

  const titles = new Set(
    [...project.wbsItems, ...project.issues, ...(project.closedIssues ?? []), ...project.raidItems].map((item) => normalized(item.title)),
  );
  const edit = (id: string, patch: Partial<DraftRow>) =>
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch, state: undefined, message: undefined } : row)));

  const showDrafts = (drafts: MeetingDraft[], by: Prepared) => {
    setRows(drafts.map((row) => ({ ...row, selected: false, parentId: "" })));
    setPrepared(by);
    setNotice(uiText("meeting.review"));
  };

  const prepareByLines = () => {
    setError("");
    showDrafts(parseMeetingNotes(text), { by: "lines" });
  };

  const prepareWithAi = async () => {
    const controller = new AbortController();
    abortRef.current = controller;
    setPreparing(true);
    setError("");
    setNotice("");
    try {
      const answer = await apiClient.postAi<{ drafts: MeetingDraft[]; model: string }>(
        `/api/projects/${project.id}/meeting-drafts`,
        { text },
        uiText("ui.automation.aiFailed"),
        controller.signal,
      );
      showDrafts(answer.drafts, { by: "ai", model: answer.model });
      if (answer.drafts.length === 0) setNotice(uiText("ui.automation.aiNothingFound"));
    } catch (failure) {
      if (controller.signal.aborted) setNotice(uiText("ui.automation.aiCancelled"));
      else setError(failure instanceof Error ? failure.message : uiText("ui.automation.aiFailed"));
    } finally {
      abortRef.current = null;
      setPreparing(false);
    }
  };

  const save = async () => {
    setBusy(true);
    setError("");
    setNotice("");
    let count = 0;
    let sequence = Math.max(0, ...project.wbsItems.map((item) => Number(item.code.split(".")[0]) || 0)) + 1;
    let sortOrder = Math.max(0, ...project.wbsItems.map((item) => item.sortOrder)) + 10;
    const savedTitles = new Set(titles);
    // Existing create handlers own the WBS queue; keep requests sequential and don't retry unknown outcomes.
    for (const row of rows.filter((item) => item.selected && kindEnabled(item.kind) && item.state !== "saved" && item.state !== "unknown")) {
      if (row.title.trim().length < 3 || savedTitles.has(normalized(row.title))) {
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? { ...item, selected: false, state: "error", message: row.title.trim().length < 3 ? uiText("meeting.shortTitle") : uiText("meeting.duplicate") }
              : item,
          ),
        );
        continue;
      }
      const details = row.description?.trim() || row.source;
      try {
        if (row.kind === "TASK") {
          await apiClient.post(
            `/api/projects/${project.id}/wbs-items`,
            {
              code: String(sequence++),
              title: row.title.trim(),
              type: "TASK",
              status: "NOT_STARTED",
              owner: row.owner.trim(),
              parentId: null,
              wbsLevel: 1,
              startDate: null,
              dueDate: row.dueDate || null,
              description: details,
              sortOrder,
            },
            uiText("meeting.createWorkError"),
          );
          sortOrder += 10;
        } else if (row.kind === "ISSUE") {
          await apiClient.post(
            `/api/projects/${project.id}/open-issues`,
            {
              title: row.title.trim(),
              owner: row.owner.trim(),
              dueDate: row.dueDate || null,
              impact: details,
              severity: "MEDIUM",
              phaseId: null,
            },
            uiText("meeting.createIssueError"),
          );
        } else {
          await apiClient.post(
            `/api/projects/${project.id}/raid-items`,
            {
              type: "RISK",
              title: row.title.trim(),
              description: details || row.title,
              owner: row.owner.trim(),
              dueDate: row.dueDate || null,
              probability: row.probability ?? 0,
              impact: row.impact ?? 0,
            },
            uiText("meeting.createRiskError"),
          );
        }
        count++;
        savedTitles.add(normalized(row.title));
        setRows((current) => current.map((item) => (item.id === row.id ? { ...item, selected: false, state: "saved", message: uiText("meeting.created") } : item)));
      } catch (failure) {
        const knownFailure = failure instanceof ApiError && failure.status >= 400 && failure.status < 500;
        setRows((current) =>
          current.map((item) =>
            item.id === row.id
              ? { ...item, selected: false, state: knownFailure ? "error" : "unknown", message: knownFailure ? failure.message : uiText("meeting.unknown") }
              : item,
          ),
        );
        if (!knownFailure) break;
      }
    }
    setNotice(uiText("meeting.createdCount", { count }));
    try {
      await refreshProject();
    } catch {
      setError(uiText("meeting.reload"));
    }
    setBusy(false);
  };

  const locked = busy || preparing;
  return (
    <>
      <p>{uiText("ui.automation.meetingNotesIntro")}</p>
      {useAi ? (
        <p className="automation-ai-note">
          <Sparkles aria-hidden="true" size={14} />
          {uiText("ui.automation.aiIntro", { model: ai?.model ?? "" })}
        </p>
      ) : (
        <>
          {ai?.setup === "gigachat" && (
            <p className="automation-setup-note" role="note">
              <Sparkles aria-hidden="true" size={15} />
              {uiText("ui.automation.setupGigaChat")}
            </p>
          )}
          <p>{uiText("ui.automation.meetingNotesParsingRules")}</p>
        </>
      )}
      <label>
        {uiText("ui.automation.meetingNotesText")}
        <textarea
          className="automation-textarea"
          disabled={locked}
          maxLength={30000}
          onChange={(event) => setText(event.target.value)}
          placeholder={uiText("ui.automation.meetingNotesPlaceholder")}
          value={text}
        />
      </label>
      <div className="automation-actions">
        {useAi ? (
          <>
            <button disabled={locked || !text.trim()} onClick={() => void prepareWithAi()} type="button">
              <Sparkles aria-hidden="true" size={14} />
              {preparing ? uiText("ui.automation.aiPreparing") : uiText("ui.automation.prepareDrafts")}
            </button>
            {preparing && (
              <button onClick={() => abortRef.current?.abort()} type="button">
                {uiText("ui.automation.aiCancel")}
              </button>
            )}
            <button disabled={locked || !text.trim()} onClick={prepareByLines} type="button">
              {uiText("ui.automation.prepareByLines")}
            </button>
          </>
        ) : (
          <button disabled={locked || !text.trim()} onClick={prepareByLines} type="button">
            {uiText("ui.automation.prepareDrafts")}
          </button>
        )}
        <button
          disabled={locked || isReadOnly || isClosedProject || !rows.some((row) => row.selected && !["saved", "unknown"].includes(row.state ?? ""))}
          onClick={() => void save()}
          type="button"
        >
          {busy ? uiText("ui.automation.creatingRecords") : uiText("ui.automation.createReviewedRecords")}
        </button>
      </div>
      {prepared?.by === "lines" && text.split(/\r?\n/).filter((line) => line.trim()).length > 20 && (
        <p className="automation-warning">{uiText("ui.automation.firstTwentyLinesProcessed")}</p>
      )}
      {prepared?.by === "ai" && rows.length > 0 && <p className="automation-ai-note">{uiText("ui.automation.aiPreparedBy", { model: prepared.model })}</p>}
      <AutomationError error={error} />
      {notice && <p role="status">{notice}</p>}
      {rows.map((row, index) => {
        const rowLocked = locked || row.state === "saved" || row.state === "unknown";
        const duplicate = titles.has(normalized(row.title)) || rows.slice(0, index).some((other) => normalized(other.title) === normalized(row.title));
        return (
          <article className="automation-card" key={row.id}>
            <label className="automation-check">
              <input
                checked={row.selected}
                disabled={rowLocked || duplicate || !kindEnabled(row.kind) || isReadOnly || isClosedProject}
                onChange={(event) => setRows((current) => current.map((item) => (item.id === row.id ? { ...item, selected: event.target.checked } : item)))}
                type="checkbox"
              />
              {uiText("ui.automation.createRecord")} {index + 1}
              {prepared?.by === "ai" && <span className="automation-ai-badge">{uiText("ui.automation.aiDraft")}</span>}
            </label>
            <div className="automation-grid">
              <label>
                {uiText("ui.automation.recordType")}
                <select disabled={rowLocked} onChange={(event) => edit(row.id, { kind: event.target.value as MeetingDraft["kind"] })} value={row.kind}>
                  <option disabled={!kindEnabled("TASK")} value="TASK">{uiText("ui.automation.wbsWork")}</option>
                  <option disabled={!kindEnabled("ISSUE")} value="ISSUE">{uiText("ui.automation.openIssue")}</option>
                  <option disabled={!kindEnabled("RISK")} value="RISK">{uiText("ui.automation.risk")}</option>
                </select>
              </label>
              <label>
                {uiText("ui.admin.name")}
                <input disabled={rowLocked} onChange={(event) => edit(row.id, { title: event.target.value })} value={row.title} />
              </label>
              <label>
                {uiText("ui.automation.owner")}
                <input disabled={rowLocked} onChange={(event) => edit(row.id, { owner: event.target.value, ownerKnown: true })} value={row.owner} />
              </label>
              <label>
                {uiText("ui.automation.dueDate")}
                <input disabled={rowLocked} onChange={(event) => edit(row.id, { dueDate: event.target.value })} type="date" value={row.dueDate} />
              </label>
              {row.kind === "RISK" && (
                <>
                  <label>
                    {uiText("ui.automation.probability")}
                    <select disabled={rowLocked} onChange={(event) => edit(row.id, { probability: Number(event.target.value) })} value={row.probability ?? 0}>
                      {SCORES.map((score) => (
                        <option key={score} value={score}>{score === 0 ? "—" : score}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {uiText("ui.automation.impact")}
                    <select disabled={rowLocked} onChange={(event) => edit(row.id, { impact: Number(event.target.value) })} value={row.impact ?? 0}>
                      {SCORES.map((score) => (
                        <option key={score} value={score}>{score === 0 ? "—" : score}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
            {prepared?.by === "ai" && (
              <label>
                {uiText("ui.automation.description")}
                <textarea
                  className="automation-textarea automation-description"
                  disabled={rowLocked}
                  onChange={(event) => edit(row.id, { description: event.target.value })}
                  value={row.description ?? ""}
                />
              </label>
            )}
            <details>
              <summary>{uiText("ui.automation.sourceLine")}</summary>
              <p>{row.source}</p>
            </details>
            {row.sourceVerified === false && <p className="automation-warning">{uiText("ui.automation.aiSourceNotFound")}</p>}
            {row.ownerKnown === false && <p className="automation-warning">{uiText("ui.automation.aiOwnerUnknown")}</p>}
            {duplicate && row.state !== "saved" && <p className="automation-warning">{uiText("ui.automation.similarNameExists")}</p>}
            {row.kind === "TASK" && <p>{uiText("ui.automation.workCreatedAtTopLevel")}</p>}
            {row.kind === "RISK" && !(row.probability && row.impact) && <p>{uiText("ui.automation.rateRiskAfterCreation")}</p>}
            {!kindEnabled(row.kind) && <p className="automation-warning">{uiText("ui.automation.moduleDisabledChooseAnotherType")}</p>}
            {row.message && <p role="status">{row.message}</p>}
            <button disabled={rowLocked} onClick={() => setRows((current) => current.filter((item) => item.id !== row.id))} type="button">
              {uiText("ui.automation.removeDraft")}
            </button>
          </article>
        );
      })}
    </>
  );
}

/** The meeting notes tool in a side drawer, opened from the project's issue register. */
export function MeetingNotesDrawer({ onClose }: { onClose: () => void }) {
  const { t: uiText } = useInterfaceTranslation();
  const containerRef = useFocusTrap<HTMLElement>(true, onClose);
  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        aria-labelledby="meeting-notes-title"
        aria-modal="true"
        className="side-drawer meeting-notes-drawer"
        onClick={(event) => event.stopPropagation()}
        ref={containerRef}
        role="dialog"
        tabIndex={-1}
      >
        <div className="drawer-title">
          <div>
            <h2 id="meeting-notes-title">{uiText("ui.automation.meetingNotesToActionItems")}</h2>
          </div>
          <button aria-label={uiText("ui.projects.closePanel")} onClick={onClose} type="button">
            <X size={14} />
          </button>
        </div>
        <div className="automation-body">
          <MeetingNotesContent />
        </div>
      </aside>
    </div>
  );
}
