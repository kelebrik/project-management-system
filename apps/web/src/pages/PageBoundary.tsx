import type { ReactNode } from "react";
import { GanttPage } from "./GanttPage";
import { OverviewPage } from "./OverviewPage";
import { RisksPage } from "./RisksPage";
import { StructurePage } from "./StructurePage";
import {
  AdminAuditPage,
  AdminBackupsPage,
  AdminConfigPage,
  AdminDictionariesPage,
  AdminHealthPage,
  AdminModulesPage,
  AdminPage,
  AdminProjectAccessPage,
  AdminProjectsPage,
  AdminRagPage,
  AdminRolesPage,
  AdminTemplatesPage,
  AdminUsersPage,
  AdminWorkflowsPage,
} from "./admin/AdminPages";

type PageBoundaryProps = {
  view: string;
  children: ReactNode;
  isAdminSectionViewName: (view: string) => boolean;
};

export function PageBoundary({
  view,
  children,
  isAdminSectionViewName,
}: PageBoundaryProps) {
  if (view === "project-overview" || view === "project-schedule") {
    return <OverviewPage>{children}</OverviewPage>;
  }
  if (view === "project-structure") {
    return <StructurePage>{children}</StructurePage>;
  }
  if (view === "project-gantt") {
    return <GanttPage>{children}</GanttPage>;
  }
  if (view === "project-raid") {
    return <RisksPage>{children}</RisksPage>;
  }
  if (view === "admin-projects" || view === "admin") {
    return <AdminProjectsPage>{children}</AdminProjectsPage>;
  }
  if (view === "admin-modules") {
    return <AdminModulesPage>{children}</AdminModulesPage>;
  }
  if (view === "admin-project-access") {
    return <AdminProjectAccessPage>{children}</AdminProjectAccessPage>;
  }
  if (view === "admin-users") {
    return <AdminUsersPage>{children}</AdminUsersPage>;
  }
  if (view === "admin-roles") {
    return <AdminRolesPage>{children}</AdminRolesPage>;
  }
  if (view === "admin-dictionaries") {
    return <AdminDictionariesPage>{children}</AdminDictionariesPage>;
  }
  if (view === "admin-templates") {
    return <AdminTemplatesPage>{children}</AdminTemplatesPage>;
  }
  if (view === "admin-rag") {
    return <AdminRagPage>{children}</AdminRagPage>;
  }
  if (view === "admin-workflows") {
    return <AdminWorkflowsPage>{children}</AdminWorkflowsPage>;
  }
  if (view === "admin-health") {
    return <AdminHealthPage>{children}</AdminHealthPage>;
  }
  if (view === "admin-backups") {
    return <AdminBackupsPage>{children}</AdminBackupsPage>;
  }
  if (view === "admin-config") {
    return <AdminConfigPage>{children}</AdminConfigPage>;
  }
  if (view === "admin-audit") {
    return <AdminAuditPage>{children}</AdminAuditPage>;
  }
  if (isAdminSectionViewName(view)) {
    return <AdminPage>{children}</AdminPage>;
  }

  return <>{children}</>;
}
