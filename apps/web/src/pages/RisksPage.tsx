import type { ReactNode } from "react";
import { PageShell } from "./PageShell";

type RisksPageProps = {
  children: ReactNode;
};

export function RisksPage({ children }: RisksPageProps) {
  return <PageShell>{children}</PageShell>;
}
