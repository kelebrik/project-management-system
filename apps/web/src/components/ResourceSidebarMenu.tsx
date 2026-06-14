import type { ReactNode } from "react";
import { CalendarDays, Gauge, Settings2, UserPlus, Users } from "lucide-react";

import type { AppView } from "../app/routes";

type ResourceNavItem = {
  view: AppView;
  label: string;
  icon: ReactNode;
};

const resourceNavItems: ResourceNavItem[] = [
  {
    view: "resources-workload",
    label: "Загрузка",
    icon: <Gauge size={17} />,
  },
  {
    view: "resources-schedule",
    label: "Назначения",
    icon: <CalendarDays size={17} />,
  },
  {
    view: "resources-directory",
    label: "Ресурсы",
    icon: <Users size={17} />,
  },
  {
    view: "resources-requests",
    label: "Запросы",
    icon: <UserPlus size={17} />,
  },
  {
    view: "resources-capacity",
    label: "Параметры",
    icon: <Settings2 size={17} />,
  },
];

type ResourceSidebarMenuProps = {
  activeView: AppView;
  isResourceSectionView: boolean;
  navLabel: (icon: ReactNode, label: string) => ReactNode;
  onOpenView: (view: AppView) => void;
};

export function ResourceSidebarMenu({
  activeView,
  isResourceSectionView,
  navLabel,
  onOpenView,
}: ResourceSidebarMenuProps) {
  return (
    <>
      <button
        type="button"
        className={isResourceSectionView ? "active" : ""}
        onClick={() => onOpenView("resources")}
        aria-label="Управление ресурсами"
      >
        {navLabel(<Users size={17} />, "Управление ресурсами")}
      </button>
      {isResourceSectionView && (
        <div className="sidebar-group">
          <div className="project-menu">
            {resourceNavItems.map((item) => (
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
          </div>
        </div>
      )}
    </>
  );
}
