import type { MouseEvent, ReactNode } from "react";
import { appPathForView, type AppView } from "../app/routes";
import { preloadAppPage } from "../pages/pageModules";

type NavTabProps = {
  view: AppView;
  projectCode?: string | null;
  active: boolean;
  onNavigate: (view: AppView) => void;
  title?: string;
  className?: string;
  children: ReactNode;
};

/**
 * A section tab that is a real link: a plain click opens the section in the
 * page, a modifier or the middle button opens it in a new tab, as a link does.
 */
export function NavTab({ view, projectCode = null, active, onNavigate, title, className = "", children }: NavTabProps) {
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    onNavigate(view);
  };
  return (
    <a
      href={appPathForView(view, projectCode)}
      className={`${className} ${active ? "active" : ""}`.trim() || undefined}
      aria-current={active ? "page" : undefined}
      title={title}
      onClick={onClick}
      onPointerEnter={() => preloadAppPage(view)}
      onFocus={() => preloadAppPage(view)}
    >
      {children}
    </a>
  );
}
