import type { ReactNode } from "react";
import { PageShell } from "./PageShell";

type GanttPageProps = {
  children: ReactNode;
};

export function GanttPage({ children }: GanttPageProps) {
  return <PageShell>{children}</PageShell>;
}
