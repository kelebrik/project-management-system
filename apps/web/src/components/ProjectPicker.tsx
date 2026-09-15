import { useI18n } from "../i18n/I18nProvider";
import { ChevronDown, Search } from "lucide-react";

import type { ProjectListItem } from "../app/domainTypes";
import type { AppView } from "../app/routes";

type ProjectPickerProps = {
  filteredProjects: ProjectListItem[];
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onProjectSearchChange: (value: string) => void;
  onProjectSelect: (projectId: string, nextView: AppView) => void;
  projectSearch: string;
  recentProjects: ProjectListItem[];
  selectedProject: ProjectListItem | null;
  selectedProjectId: string | null;
  targetView: AppView;
};

export function ProjectPicker({
  filteredProjects,
  isOpen,
  onOpenChange,
  onProjectSearchChange,
  onProjectSelect,
  projectSearch,
  recentProjects,
  selectedProject,
  selectedProjectId,
  targetView,
}: ProjectPickerProps) {
  const { t } = useI18n();
  return (
    <div className="project-picker">
      <button
        type="button"
        className="project-picker-trigger"
        aria-label={
          selectedProject
            ? t("picker.open", { code: selectedProject.code })
            : t("picker.select")
        }
        title={selectedProject?.name}
        onClick={() => onOpenChange(!isOpen)}
        aria-expanded={isOpen}
      >
        <span>
          {selectedProject ? selectedProject.code : t("picker.select")}
        </span>
        <ChevronDown size={15} />
      </button>
      {isOpen && (
        <div className="project-picker-popover">
          <label className="project-search">
            <Search size={15} />
            <input
              value={projectSearch}
              onChange={(event) => onProjectSearchChange(event.target.value)}
              placeholder={t("picker.search")}
            />
          </label>
          {recentProjects.length > 0 && !projectSearch.trim() && (
            <div className="project-picker-section">
              <span>{t("picker.recent")}</span>
              {recentProjects.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => onProjectSelect(item.id, targetView)}
                >
                  <b>{item.code}</b>
                  <small>{item.name}</small>
                </button>
              ))}
            </div>
          )}
          <div className="project-picker-section">
            <span>{t("picker.all")}</span>
            {filteredProjects.map((item) => (
              <button
                type="button"
                className={item.id === selectedProjectId ? "selected" : ""}
                key={item.id}
                onClick={() => onProjectSelect(item.id, targetView)}
              >
                <b>{item.code}</b>
                <small>{item.name}</small>
              </button>
            ))}
            {filteredProjects.length === 0 && <em>{t("picker.empty")}</em>}
          </div>
        </div>
      )}
    </div>
  );
}
