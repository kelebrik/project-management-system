import type { ReactNode } from "react";
import { FolderTree } from "lucide-react";

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
  firstEnabledProjectView: ProjectSectionView;
  isProjectSectionView: boolean;
  isProjectModuleEnabled: (key: ProjectModuleKey) => boolean;
  navLabel: (icon: ReactNode, label: string) => ReactNode;
  onOpenView: (view: AppView) => void;
  projectNavItems: ProjectNavItem[];
  selectedProjectId: string | null;
  shouldShowProjectMenu: boolean;
};

export function ProjectSidebarMenu({
  activeView,
  firstEnabledProjectView,
  isProjectModuleEnabled,
  isProjectSectionView,
  navLabel,
  onOpenView,
  projectNavItems,
  selectedProjectId,
  shouldShowProjectMenu,
}: ProjectSidebarMenuProps) {
  return (
    <>
      <button
        type="button"
        className={isProjectSectionView ? "active" : ""}
        onClick={() =>
          onOpenView(selectedProjectId ? firstEnabledProjectView : "project-create")
        }
        aria-label="Проекты"
      >
        {navLabel(<FolderTree size={17} />, "Проекты")}
      </button>
      {shouldShowProjectMenu && (
        <div className="sidebar-group">
          <div className="project-menu">
            {projectNavItems
              .filter((item) => isProjectModuleEnabled(item.key))
              .map((item) => (
                <button
                  type="button"
                  key={item.key}
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
          </div>
        </div>
      )}
    </>
  );
}
