import { useI18n } from "../i18n/I18nProvider";
import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";
import type { ReactNode } from "react";
import { CircleHelp, LayoutDashboard, Settings2, Users } from "lucide-react";

import type { AppView } from "../app/routes";

type ResourceNavItem = {
  view: AppView;
  label: TranslationKey;
  icon: ReactNode;
};

const resourceNavItems: ResourceNavItem[] = [
  {
    view: "resources-capacity",
    label: "view.resources-capacity",
    icon: <Settings2 size={17} />,
  },
];

const developmentNavItems: ResourceNavItem[] = [
  { view: "jira-reconciliation", label: "view.jira-reconciliation", icon: <CircleHelp size={15} /> },
  {
    view: "project-pm-workspace",
    label: "view.project-pm-workspace",
    icon: <LayoutDashboard size={17} />,
  },
  {
    view: "decision-queue",
    label: "view.decision-queue",
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
  const { t } = useI18n();
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
            aria-label={t(item.label)}
          >
            {navLabel(item.icon, t(item.label))}
          </button>
        ))}
        {(activeView === "project-pm-workspace" || activeView === "decision-queue") && projectPicker}
        <button
          type="button"
          className={isResourceSectionView ? "active nested child" : "nested child"}
          onClick={() => onOpenView("resources")}
          aria-label={t("view.resources")}
        >
          {navLabel(<Users size={17} />, t("view.resources"))}
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
              aria-label={t(item.label)}
            >
              {navLabel(item.icon, t(item.label))}
            </button>
          ))}
      </div>
    </div>
  );
}
