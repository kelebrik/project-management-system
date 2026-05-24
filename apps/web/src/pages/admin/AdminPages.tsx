import type { ReactNode } from "react";
import { PageShell } from "../PageShell";

type AdminPageProps = {
  children: ReactNode;
};

export function AdminPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminProjectsPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminUsersPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminRolesPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminDictionariesPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminTemplatesPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminRagPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminWorkflowsPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminJiraPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminHealthPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminBackupsPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminConfigPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}

export function AdminAuditPage({ children }: AdminPageProps) {
  return <PageShell>{children}</PageShell>;
}
