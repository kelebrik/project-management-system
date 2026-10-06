import { ApiError } from "../../api/client";
import type { Translator } from "../../i18n/types";

const CODES = ["PAGES_ADMIN_ONLY", "PAGES_DEMO_READ_ONLY", "PAGES_LIMIT", "PAGE_NOT_FOUND", "PAGE_TOO_LARGE", "PAGE_CONFLICT", "PAGE_SCOPE_TOO_LARGE", "PAGE_LINK_GONE", "PAGE_LINK_FORBIDDEN"] as const;
type Code = (typeof CODES)[number];

/** The words for a failed page request in the person's language: by the server's code, else its message, else the fallback. */
export function pageErrorText(failure: unknown, t: Translator, fallback: string) {
  if (failure instanceof ApiError) {
    const code = (failure.details as { code?: string } | null)?.code;
    if (code && (CODES as readonly string[]).includes(code)) return t(`ui.pages.error.${code as Code}` as "ui.pages.error.PAGE_NOT_FOUND");
  }
  return failure instanceof Error && failure.message ? failure.message : fallback;
}
