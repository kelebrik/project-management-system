import type { ReactNode } from "react";
import { PageShell } from "./PageShell";

type OverviewPageProps = {
  children: ReactNode;
};

export function OverviewPage({ children }: OverviewPageProps) {
  return <PageShell>{children}</PageShell>;
}
