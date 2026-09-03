import type { ReactNode } from "react";
import { CircleHelp, LayoutDashboard, Settings2, Users } from "lucide-react";

import type { AppView } from "../app/routes";

type ResourceNavItem = {
  view: AppView;
  label: string;
  icon: ReactNode;
};

const resourceNavItems: ResourceNavItem[] = [
  {
    view: "resources-capacity",
    label: "Параметры",
    icon: <Settings2 size={17} />,
  },
];

const developmentNavItems: ResourceNavItem[] = [
  {
    view: "project-pm-workspace",
    label: "Рабочий стол PM",
    icon: <LayoutDashboard size={17} />,
  },
  {
    view: "decision-queue",
    label: "Очередь решений",
    icon: <CircleHelp size={17} />,
  },
];

type ResourceSidebarMenuProps = {
  activeView: AppView;
  isResourceSectionView: boolean;
  navLabel: (icon: ReactNode, label: string) => ReactNode;
  onOpenView: (view: AppView) => void;
  projectPicker?: ReactNode;
};

export function ResourceSidebarMenu({
  activeView,
  isResourceSectionView,
  navLabel,
  onOpenView,
  projectPicker,
}: ResourceSidebarMenuProps) {
  return (
    <div className="sidebar-group">
      <div className="project-menu">
        {developmentNavItems.map((item) => (
          <button
            type="button"
            key={item.view}
            className={
              activeView === item.view ? "active nested child" : "nested child"
            }
            onClick={() => onOpenView(item.view)}
            aria-label={item.label}
          >
            {navLabel(item.icon, item.label)}
          </button>
        ))}
        {(activeView === "project-pm-workspace" || activeView === "decision-queue") && projectPicker}
        <button
          type="button"
          className={isResourceSectionView ? "active nested child" : "nested child"}
          onClick={() => onOpenView("resources")}
          aria-label="Управление ресурсами"
        >
          {navLabel(<Users size={17} />, "Управление ресурсами")}
        </button>
        {isResourceSectionView &&
          resourceNavItems.map((item) => (
            <button
              type="button"
              key={item.view}
              className={
                activeView === item.view
                  ? "active nested child sidebar-grandchild"
                  : "nested child sidebar-grandchild"
              }
              onClick={() => onOpenView(item.view)}
              aria-label={item.label}
            >
              {navLabel(item.icon, item.label)}
            </button>
          ))}
      </div>
    </div>
  );
}
