import type { ReactNode } from "react";
import { PageShell } from "./PageShell";

type StructurePageProps = {
  children: ReactNode;
};

export function StructurePage({ children }: StructurePageProps) {
  return <PageShell>{children}</PageShell>;
}
