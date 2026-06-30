import { Download, Upload } from "lucide-react";
import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { apiClient } from "../api/client";
import type { ProjectDetails, ProjectListItem, WbsItem } from "../app/domainTypes";
import { apiBase, responseErrorMessage } from "../app/http";
import { usePageContext } from "./PageContext";

type ImportResult = {
  createdCount: number;
  importedRows: number;
  project: Pick<ProjectListItem, "id" | "code" | "name">;
  phase: Pick<WbsItem, "id" | "code" | "title">;
  snapshot: Pick<ProjectDetails, "wbsItems" | "wbsDependencies" | "criticalPath">;
};

function projectLabel(project: Pick<ProjectListItem, "code" | "name">) {
  return `${project.code} - ${project.name}`;
}

function phaseLabel(phase: Pick<WbsItem, "code" | "title">) {
  return `${phase.code} - ${phase.title || "Без названия"}`;
}

export function AdminImportPageContent() {
  const { project, projects, projectOptionLabel, setError, setNotice, setProject } =
    usePageContext();
  const activeProjects = useMemo(
    () => projects.filter((item: ProjectListItem) => item.status !== "CLOSED"),
    [projects],
  );
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [selectedPhaseId, setSelectedPhaseId] = useState("");
  const [projectDetails, setProjectDetails] = useState<ProjectDetails | null>(null);
  const [loadingProject, setLoadingProject] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!selectedProjectId && activeProjects.length > 0) {
      setSelectedProjectId(activeProjects[0].id);
    }
  }, [activeProjects, selectedProjectId]);

  useEffect(() => {
    if (!selectedProjectId) {
      setProjectDetails(null);
      setSelectedPhaseId("");
      return;
    }

    let cancelled = false;
    setLoadingProject(true);
    setProjectDetails(null);
    setSelectedPhaseId("");
    apiClient
      .get<ProjectDetails>(
        `/api/projects/${selectedProjectId}/overview`,
        "Не удалось загрузить фазы проекта",
      )
      .then((data) => {
        if (cancelled) return;
        setProjectDetails(data);
        setSelectedPhaseId((current) =>
          data.wbsItems.some((item) => item.type === "PHASE" && item.id === current)
            ? current
            : "",
        );
      })
      .catch((error) => {
        if (!cancelled) {
          setError(error instanceof Error ? error.message : "Не удалось загрузить фазы проекта");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProject(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedProjectId, setError]);

  const phases = useMemo(
    () => projectDetails?.wbsItems.filter((item) => item.type === "PHASE") ?? [],
    [projectDetails],
  );
  const selectedPhase = phases.find((item) => item.id === selectedPhaseId) ?? null;

  const downloadTemplate = async () => {
    setError(null);
    try {
      const response = await fetch(`${apiBase}/api/admin/import/wbs-template`, {
        credentials: "include",
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(responseErrorMessage(payload, "Не удалось скачать шаблон"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "wbs-import-template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось скачать шаблон");
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.currentTarget.files?.[0] ?? null);
    setResult(null);
  };

  const importTasks = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setResult(null);

    if (!selectedProjectId || !selectedPhaseId || !file) {
      setError("Выберите проект, фазу и файл импорта");
      return;
    }

    const formData = new FormData();
    formData.append("projectId", selectedProjectId);
    formData.append("phaseId", selectedPhaseId);
    formData.append("file", file);

    setUploading(true);
    try {
      const response = await fetch(`${apiBase}/api/admin/import/wbs-items`, {
        method: "POST",
        body: formData,
        credentials: "include",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responseErrorMessage(payload, "Не удалось импортировать задачи"));
      }
      const importResult = payload as ImportResult;
      setResult(importResult);
      setNotice(
        `Импортировано задач: ${importResult.createdCount}. Фаза: ${phaseLabel(importResult.phase)}`,
      );
      setProjectDetails((current) =>
        current
          ? {
              ...current,
              wbsItems: importResult.snapshot.wbsItems,
              wbsDependencies: importResult.snapshot.wbsDependencies,
              criticalPath: importResult.snapshot.criticalPath,
            }
          : current,
      );
      if (project?.id === importResult.project.id) {
        setProject?.((current: ProjectDetails | null) =>
          current
            ? {
                ...current,
                wbsItems: importResult.snapshot.wbsItems,
                wbsDependencies: importResult.snapshot.wbsDependencies,
                criticalPath: importResult.snapshot.criticalPath,
              }
            : current,
        );
      }
    } catch (error) {
      setError(error instanceof Error ? error.message : "Не удалось импортировать задачи");
    } finally {
      setUploading(false);
    }
  };

  const canImport = Boolean(selectedProjectId && selectedPhaseId && file && !uploading);

  return (
    <article className="panel project-card admin-import-panel">
      <div className="panel-title">
        <div>
          <h2>Администрирование: импорт</h2>
          <p>Загрузка задач из XLS/XLSX в заранее созданную фазу проекта</p>
        </div>
        <button type="button" onClick={() => void downloadTemplate()}>
          <Download size={16} />
          Скачать шаблон
        </button>
      </div>

      <form className="admin-import-form" onSubmit={importTasks}>
        <div className="admin-import-step">
          <span>1</span>
          <div>
            <h3>Подготовьте файл</h3>
            <p>Шаблон содержит четыре колонки: Наименование, Статус, Дата начала, Дата окончания.</p>
          </div>
        </div>

        <div className="admin-import-grid">
          <label>
            <span>Проект</span>
            <select
              value={selectedProjectId}
              onChange={(event) => {
                setSelectedProjectId(event.target.value);
                setResult(null);
              }}
            >
              {activeProjects.map((item: ProjectListItem) => (
                <option key={item.id} value={item.id}>
                  {projectOptionLabel ? projectOptionLabel(item) : projectLabel(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Фаза</span>
            <select
              value={selectedPhaseId}
              onChange={(event) => {
                setSelectedPhaseId(event.target.value);
                setResult(null);
              }}
              disabled={!selectedProjectId || loadingProject || phases.length === 0}
              required
            >
              <option value="">
                {loadingProject
                  ? "Загрузка фаз..."
                  : phases.length > 0
                    ? "Выберите фазу"
                    : "В проекте нет фаз"}
              </option>
              {phases.map((item) => (
                <option key={item.id} value={item.id}>
                  {phaseLabel(item)}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedPhase && (
          <div className="admin-import-target">
            Задачи будут импортированы в фазу: <b>{phaseLabel(selectedPhase)}</b>
          </div>
        )}

        <label className="admin-import-file">
          <span>Файл XLS/XLSX</span>
          <input
            type="file"
            accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={handleFileChange}
          />
        </label>

        <div className="panel-title-actions admin-import-actions">
          <button type="submit" disabled={!canImport}>
            <Upload size={16} />
            {uploading ? "Импортирую..." : "Импортировать задачи"}
          </button>
        </div>
      </form>

      {result && (
        <div className="admin-import-result">
          <b>{result.createdCount}</b>
          <span>
            задач импортировано в {projectLabel(result.project)}, фаза{" "}
            {phaseLabel(result.phase)}
          </span>
        </div>
      )}
    </article>
  );
}
