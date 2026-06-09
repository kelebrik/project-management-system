/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { createContext, useContext, type ReactNode } from "react";

export type PageContextValue = Record<string, any>;

const PageContext = createContext<PageContextValue | null>(null);

type PageContextProviderProps = {
  children: ReactNode;
  value: PageContextValue;
};

export function PageContextProvider({ children, value }: PageContextProviderProps) {
  return <PageContext.Provider value={value}>{children}</PageContext.Provider>;
}

export function usePageContext() {
  const context = useContext(PageContext);
  if (!context) {
    throw new Error("usePageContext must be used within PageContextProvider");
  }
  return context;
}
