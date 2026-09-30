import { useState } from "react";
import { apiClient } from "../../api/client";
import type { Decision } from "../../app/decisions";
import type { FactRef } from "../../app/factRefs";
import { useI18n } from "../../i18n/I18nProvider";

type Approver = { id: string; name: string; email: string };
type LinkedRecord = { label: string; ref: FactRef | null };

/**
 * One decision with what the current user may do with it now: a draft can be
 * edited, sent to an approver, recorded as taken or deleted; a pending one
 * withdrawn by the project, or answered by its approver with a comment; one in
 * force replaced by a new decision.
 */
export function DecisionCard({
  decision,
  userId,
  canWrite,
  links,
  replacedBy,
  onOpen,
  onEdit,
  onReplace,
  onChanged,
}: {
  decision: Decision;
  userId: string | null;
  canWrite: boolean;
  links: LinkedRecord[];
  replacedBy: Decision | null;
  onOpen: (ref: FactRef) => void;
  onEdit: () => void;
  onReplace: () => void;
  onChanged: () => void;
}) {
  const { t, formatters } = useI18n();
  const [panel, setPanel] = useState<"" | "request" | "record" | "answer">("");
  const [approvers, setApprovers] = useState<Approver[]>([]);
  const [approverUserId, setApproverUserId] = useState("");
  const [decidedBy, setDecidedBy] = useState("");
  const [decidedAt, setDecidedAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const act = async (run: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await run();
      setPanel("");
      onChanged();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.decisions.saveFailed"));
    } finally {
      setBusy(false);
    }
  };
  const openRequest = async () => {
    setPanel("request");
    if (approvers.length === 0) {
      try {
        setApprovers(await apiClient.get<Approver[]>(`/api/projects/${decision.projectId}/decision-approvers`));
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : t("ui.decisions.saveFailed"));
      }
    }
  };
  const version = { expectedVersion: decision.version };
  const isApprover = decision.status === "PENDING_APPROVAL" && decision.approverUserId === userId;

  return (
    <article className={`decision-card decision-${decision.status.toLowerCase()}`} id={`decision-${decision.id}`}>
      <header>
        <span className={`decision-status decision-status-${decision.status.toLowerCase()}`}>{t(`ui.decisions.status.${decision.status}`)}</span>
        <h3>{decision.title}</h3>
      </header>
      {decision.decision && <p className="decision-text">{decision.decision}</p>}
      {decision.context && <p className="decision-context">{decision.context}</p>}
      {links.length > 0 && (
        <p className="decision-links">
          {links.map((link) =>
            link.ref ? (
              <button className="link-button" key={link.label} onClick={() => onOpen(link.ref!)} type="button">
                {link.label}
              </button>
            ) : (
              <span key={link.label}>{link.label}</span>
            ),
          )}
        </p>
      )}
      <p className="decision-meta">
        {decision.createdByName && t("ui.decisions.metaCreated", { who: decision.createdByName, when: formatters.date(decision.createdAt) })}
        {decision.status === "PENDING_APPROVAL" && decision.approverName && ` · ${t("ui.decisions.metaPending", { who: decision.approverName, when: formatters.date(decision.requestedAt) })}`}
        {decision.decidedBy && decision.decidedAt && ` · ${t("ui.decisions.metaDecided", { who: decision.decidedBy, when: formatters.date(decision.decidedAt) })}`}
        {decision.status === "REJECTED" && decision.approverName && ` · ${t("ui.decisions.metaRejected", { who: decision.approverName, when: formatters.date(decision.answeredAt) })}`}
        {replacedBy && ` · ${t("ui.decisions.metaReplaced", { title: replacedBy.title })}`}
      </p>
      {decision.approvalComment && <p className="decision-comment">«{decision.approvalComment}»</p>}

      <div className="decision-actions">
        {canWrite && decision.status === "PROPOSED" && (
          <>
            <button disabled={busy} onClick={onEdit} type="button">
              {t("ui.decisions.edit")}
            </button>
            <button disabled={busy} onClick={() => void openRequest()} type="button">
              {t("ui.decisions.request")}
            </button>
            <button disabled={busy || !decision.decision} onClick={() => setPanel("record")} title={decision.decision ? undefined : t("ui.decisions.recordNeedsText")} type="button">
              {t("ui.decisions.record")}
            </button>
            <button disabled={busy} onClick={() => void act(() => apiClient.delete(`/api/decisions/${decision.id}`, t("ui.decisions.saveFailed")))} type="button">
              {t("ui.decisions.delete")}
            </button>
          </>
        )}
        {canWrite && decision.status === "PENDING_APPROVAL" && !isApprover && (
          <button disabled={busy} onClick={() => void act(() => apiClient.post(`/api/decisions/${decision.id}/withdraw`, version, t("ui.decisions.saveFailed")))} type="button">
            {t("ui.decisions.withdraw")}
          </button>
        )}
        {isApprover && (
          <button className="primary" disabled={busy} onClick={() => setPanel("answer")} type="button">
            {t("ui.decisions.answer")}
          </button>
        )}
        {canWrite && decision.status === "APPROVED" && !replacedBy && (
          <button disabled={busy} onClick={onReplace} type="button">
            {t("ui.decisions.replace")}
          </button>
        )}
      </div>

      {panel === "request" && (
        <div className="decision-inline">
          <label>
            {t("ui.decisions.approver")}
            <select disabled={busy} onChange={(event) => setApproverUserId(event.target.value)} value={approverUserId}>
              <option value="">{t("ui.decisions.chooseApprover")}</option>
              {approvers.map((approver) => (
                <option key={approver.id} value={approver.id}>
                  {approver.name || approver.email}
                </option>
              ))}
            </select>
          </label>
          <button
            className="primary"
            disabled={busy || !approverUserId}
            onClick={() => void act(() => apiClient.post(`/api/decisions/${decision.id}/request-approval`, { approverUserId, ...version }, t("ui.decisions.saveFailed")))}
            type="button"
          >
            {t("ui.decisions.send")}
          </button>
        </div>
      )}
      {panel === "record" && (
        <div className="decision-inline">
          <label>
            {t("ui.decisions.decidedBy")}
            <input disabled={busy} onChange={(event) => setDecidedBy(event.target.value)} placeholder={t("ui.decisions.decidedByHint")} value={decidedBy} />
          </label>
          <label>
            {t("ui.decisions.decidedAt")}
            <input disabled={busy} onChange={(event) => setDecidedAt(event.target.value)} type="date" value={decidedAt} />
          </label>
          <button
            className="primary"
            disabled={busy || decidedBy.trim().length < 2 || !decidedAt}
            onClick={() => void act(() => apiClient.post(`/api/decisions/${decision.id}/record`, { decidedBy, decidedAt, ...version }, t("ui.decisions.saveFailed")))}
            type="button"
          >
            {t("ui.decisions.record")}
          </button>
        </div>
      )}
      {panel === "answer" && (
        <div className="decision-inline">
          <label>
            {t("ui.decisions.comment")}
            <textarea disabled={busy} maxLength={2000} onChange={(event) => setComment(event.target.value)} value={comment} />
          </label>
          <button
            className="primary"
            disabled={busy || comment.trim().length < 3}
            onClick={() => void act(() => apiClient.post(`/api/decisions/${decision.id}/answer`, { verdict: "APPROVE", comment, ...version }, t("ui.decisions.saveFailed")))}
            type="button"
          >
            {t("ui.decisions.approve")}
          </button>
          <button
            disabled={busy || comment.trim().length < 3}
            onClick={() => void act(() => apiClient.post(`/api/decisions/${decision.id}/answer`, { verdict: "REJECT", comment, ...version }, t("ui.decisions.saveFailed")))}
            type="button"
          >
            {t("ui.decisions.reject")}
          </button>
        </div>
      )}
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
    </article>
  );
}
