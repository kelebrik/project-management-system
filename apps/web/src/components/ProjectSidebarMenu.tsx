import type { ReactNode } from "react";
import { FolderTree, Plus } from "lucide-react";

import type { ProjectModuleKey } from "../app/projectModules";
import type { AppView, ProjectSectionView } from "../app/routes";

export type ProjectNavItem = {
  key: ProjectModuleKey;
  view: ProjectSectionView;
  label: string;
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
  return (
    <>
      <button
        type="button"
        className={activeView === "projects" || isProjectSectionView ? "active" : ""}
        onClick={() => onOpenView("projects")}
        aria-label="Проекты"
      >
        {navLabel(<FolderTree size={17} />, "Проекты")}
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
                  aria-label={item.label}
                >
                  {navLabel(item.icon, item.label)}
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
              aria-label="Создать проект"
            >
              {navLabel(<Plus size={17} />, "Создать проект")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
