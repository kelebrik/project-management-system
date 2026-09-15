import { useI18n } from "../i18n/I18nProvider";
import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";
import type { ReactNode } from "react";
import { FolderTree, Plus } from "lucide-react";

import type { ProjectModuleKey } from "../app/projectModules";
import type { AppView, ProjectSectionView } from "../app/routes";

export type ProjectNavItem = {
  key: ProjectModuleKey;
  view: ProjectSectionView;
  label: TranslationKey;
  icon: ReactNode;
};

type ProjectSidebarMenuProps = {
  activeView: AppView;
  isProjectSectionView: boolean;
  isProjectModuleEnabled: (key: ProjectModuleKey) => boolean;
  navLabel: (icon: ReactNode, label: string) => ReactNode;
  onCreateProject: () => void;
  onOpenView: (view: AppView) => void;
  projectNavItems: ProjectNavItem[];
  projectPicker: ReactNode;
  shouldShowProjectMenu: boolean;
};

export function ProjectSidebarMenu({
  activeView,
  isProjectModuleEnabled,
  isProjectSectionView,
  navLabel,
  onCreateProject,
  onOpenView,
  projectNavItems,
  projectPicker,
  shouldShowProjectMenu,
}: ProjectSidebarMenuProps) {
  const { t } = useI18n();
  return (
    <>
      <button
        type="button"
        className={activeView === "projects" || isProjectSectionView ? "active" : ""}
        onClick={() => onOpenView("projects")}
        aria-label={t("nav.projects")}
      >
        {navLabel(<FolderTree size={17} />, t("nav.projects"))}
      </button>
      {shouldShowProjectMenu && (
        <div className="sidebar-group">
          {projectPicker}
          <div className="project-menu">
            {projectNavItems
              .filter((item) => isProjectModuleEnabled(item.key))
              .map((item) => (
                <button
                  type="button"
                  key={item.view}
                  className={
                    activeView === item.view
                      ? "active nested child"
                      : "nested child"
                  }
                  onClick={() => onOpenView(item.view)}
                  aria-label={t(item.label)}
                >
                  {navLabel(item.icon, t(item.label))}
                </button>
              ))}
            <button
              type="button"
              className={
                activeView === "project-create"
                  ? "active nested child project-create-nav"
                  : "nested child project-create-nav"
              }
              onClick={onCreateProject}
              aria-label={t("nav.createProject")}
            >
              {navLabel(<Plus size={17} />, t("nav.createProject"))}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
