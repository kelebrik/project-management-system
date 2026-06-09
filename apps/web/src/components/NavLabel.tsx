import type { ReactNode } from "react";

type NavLabelProps = {
  icon: ReactNode;
  label: string;
  sidebarCollapsed: boolean;
};

export function NavLabel({ icon, label, sidebarCollapsed }: NavLabelProps) {
  return (
    <>
      <span className="nav-icon">{icon}</span>
      <span className="nav-text">{label}</span>
      {sidebarCollapsed && <span className="nav-tooltip">{label}</span>}
    </>
  );
}
