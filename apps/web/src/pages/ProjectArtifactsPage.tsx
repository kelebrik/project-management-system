import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";
import type { ArtifactStatus } from "../app/domainTypes";
import { useConfirm } from "../hooks/useConfirm";
import { ListToolbar } from "../components/ListToolbar";
import { usePersistedViewState } from "../app/usePersistedViewState";

export function ProjectArtifactsPage() {
  const { t } = useI18n();
  const confirm = useConfirm();
  const ctx = usePageContext();
  const {
    artifactDrafts,
    artifactStatusLabel,
    createArtifactRow,
    deleteArtifact,
    expandedArtifactId,
    moveArtifact,
    project,
    saveArtifact,
    setExpandedArtifactId,
    updateArtifactDraft,
  } = ctx;
  const [query, setQuery] = usePersistedViewState(`pms:artifacts:${project.id}:query`, "");
  const normalizedQuery = query.trim().toLowerCase();
  const artifacts = project.artifacts.filter((artifact) => !normalizedQuery || [artifact.title, artifact.owner, artifact.type, artifact.status].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery)));
  const confirmArtifactDeletion = async (artifactId: string) => {
    if (
      await confirm({
        title: t("artifacts.deleteConfirm"),
        message: t("artifacts.deleteWarning"),
        confirmLabel: t("fields.delete"),
      })
    ) {
      void deleteArtifact(artifactId);
    }
  };

  return (
                  <article className="panel project-card">
                    <div className="panel-title">
                      <div>
                        <h2>{t("artifacts.title")}</h2>
                        <p>
                          {t("artifacts.description")}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setQuery(""); void createArtifactRow(); }}
                    >
                      {t("fields.addRow")}
                    </button>
                  </div>
                  <ListToolbar label={t("artifacts.search")} query={query} onQueryChange={setQuery} />
                  <div className="artifact-list">
                    <div className="artifact-head">
                      <span />
                      <span>{t("artifacts.artifact")}</span>
                      <span>{t("fields.type")}</span>
                      <span>{t("fields.owner")}</span>
                      <span>{t("fields.status")}</span>
                      <span>URL</span>
                      <span />
                    </div>
                    {artifacts.map((artifact) => { const index = project.artifacts.findIndex((item) => item.id === artifact.id); return (
                      <div className="artifact-item" key={artifact.id}>
                        <div
                          className="artifact-row"
                          role="button"
                          tabIndex={0}
                          onClick={() =>
                            setExpandedArtifactId(
                              expandedArtifactId === artifact.id
                                ? null
                                : artifact.id,
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            setExpandedArtifactId(
                              expandedArtifactId === artifact.id
                                ? null
                                : artifact.id,
                            );
                          }}
                        >
                          <span className="artifact-row-controls">
                            <button
                              type="button"
                              className="wbs-inline-insert-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setQuery("");
                                void createArtifactRow(artifact.id);
                              }}
                              title={t("fields.rowBelow")}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className="wbs-row-drag-handle"
                              onClick={(event) => {
                                event.stopPropagation();
                                void moveArtifact(artifact.id, -1);
                              }}
                              disabled={index === 0}
                              title={t("fields.moveUp")}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              className="wbs-row-drag-handle"
                              onClick={(event) => {
                                event.stopPropagation();
                                void moveArtifact(artifact.id, 1);
                              }}
                              disabled={index === project.artifacts.length - 1}
                              title={t("fields.moveDown")}
                            >
                              ↓
                            </button>
                            <button
                              type="button"
                              className="wbs-row-delete-button"
                              onClick={(event) => {
                                event.stopPropagation();
                                void confirmArtifactDeletion(artifact.id);
                              }}
                              title={t("fields.delete")}
                            >
                              x
                            </button>
                          </span>
                          <span>{artifact.title}</span>
                          <span>{artifact.type}</span>
                          <span>{artifact.owner}</span>
                          <span>{artifactStatusLabel(artifact.status)}</span>
                          <span>{artifact.url ? t("fields.link") : t("fields.notSet")}</span>
                          <span className="issue-chevron">
                            {expandedArtifactId === artifact.id ? "-" : "+"}
                          </span>
                        </div>
                        {expandedArtifactId === artifact.id && (
                          <div className="artifact-details">
                            {artifact.url && (
                              <a
                                href={artifact.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {t("fields.openLink")}
                              </a>
                            )}
                            {artifact.description && (
                              <p>{artifact.description}</p>
                            )}
                            <div className="artifact-edit-grid">
                                  <label>
                                    {t("fields.title")}
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.title ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          title: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t("fields.type")}
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.type ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          type: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t("fields.owner")}
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.owner ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          owner: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    {t("fields.status")}
                                    <select
                                      value={
                                        artifactDrafts[artifact.id]?.status ??
                                        "Draft"
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          status: event.target
                                            .value as ArtifactStatus,
                                        })
                                      }
                                      >
                                      <option value="Draft">
                                        {artifactStatusLabel("Draft")}
                                      </option>
                                      <option value="In Review">
                                        {artifactStatusLabel("In Review")}
                                      </option>
                                      <option value="Approved">
                                        {artifactStatusLabel("Approved")}
                                      </option>
                                      <option value="Baseline">
                                        {artifactStatusLabel("Baseline")}
                                      </option>
                                      <option value="Archived">
                                        {artifactStatusLabel("Archived")}
                                      </option>
                                    </select>
                                  </label>
                                  <label>
                                    {t("fields.order")}
                                    <input
                                      type="number"
                                      value={
                                        artifactDrafts[artifact.id]
                                          ?.sortOrder ?? "0"
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          sortOrder: event.target.value,
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="span-2">
                                    URL
                                    <input
                                      value={
                                        artifactDrafts[artifact.id]?.url ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          url: event.target.value,
                                        })
                                      }
                                      placeholder="https://..."
                                    />
                                  </label>
                                  <label className="span-2">
                                    {t("fields.description")}
                                    <textarea
                                      value={
                                        artifactDrafts[artifact.id]
                                          ?.description ?? ""
                                      }
                                      onChange={(event) =>
                                        updateArtifactDraft(artifact.id, {
                                          description: event.target.value,
                                        })
                                      }
                                      rows={3}
                                    />
                                  </label>
                                  <div className="artifact-actions span-2">
                                    <button
                                      type="button"
                                      onClick={() => saveArtifact(artifact.id)}
                                    >
                                      {t("fields.save")}
                                    </button>
                                    <button
                                      type="button"
                                      className="danger-button"
                                      onClick={() =>
                                        void confirmArtifactDeletion(artifact.id)
                                      }
                                    >
                                      {t("fields.delete")}
                                    </button>
                                  </div>
                            </div>
                          </div>
                        )}
                      </div>
                    ); })}
                    {artifacts.length === 0 && <div className="empty-state"><strong>{normalizedQuery ? t("artifacts.noResults") : t("artifacts.empty")}</strong><span>{normalizedQuery ? t("fields.searchHelp") : t("artifacts.emptyHelp")}</span>{normalizedQuery && <button type="button" onClick={() => setQuery("")}>{t("fields.clearSearch")}</button>}</div>}
                  </div>
                </article>
              );
}
