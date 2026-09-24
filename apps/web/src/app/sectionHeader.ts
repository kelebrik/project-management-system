import { appViewFromPath, isAdminSectionViewName, isDevelopmentSectionViewName } from "./routes";

export const VIEW_SECTION_HEADER = "X-PMS-Section";

/**
 * Names the section a request is sent from, so the API can keep Administration
 * and Development look-only for the public demo.
 */
export function viewSectionHeaders(
  pathname = typeof window === "undefined" ? "" : window.location.pathname,
): Record<string, string> {
  if (!pathname) return {};
  const view = appViewFromPath(pathname);
  if (isAdminSectionViewName(view)) return { [VIEW_SECTION_HEADER]: "admin" };
  if (isDevelopmentSectionViewName(view)) return { [VIEW_SECTION_HEADER]: "development" };
  return {};
}
