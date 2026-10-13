import { liveClientHeaders } from "./liveClient";
import { businessUnitHeaders } from "./businessUnitContext";
import { noticeScheduleShift } from "./scheduleShiftNotice";
import { viewSectionHeaders } from "./sectionHeader";
import { currentWriteTag, expandStructureAnswer, structureDeltaHeaders, trackStructureWrite } from "./structureStore";

export const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const tag = currentWriteTag();
  const { response, body } = await trackStructureWrite(init.method, async () => {
    const response = await fetch(input, {
      ...init,
      credentials: "include",
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...businessUnitHeaders(),
        ...viewSectionHeaders(),
        ...liveClientHeaders(),
        ...structureDeltaHeaders,
        ...init.headers,
      },
    });
    // An answer with Structure changes is read here, so it is counted out before it is expanded.
    const body = response.ok && response.headers.get("X-PMS-Structure") === "delta" ? await response.json() : undefined;
    return { response, body };
  }, typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url);
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("pms-auth-required"));
  }
  if (response.ok) noticeScheduleShift(response);
  if (body !== undefined) {
    // The answer carries Structure changes: whoever reads it gets the whole Structure at that version.
    const requestPath = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
    const expanded = await expandStructureAnswer(body, async (projectId) => {
      const project = await authenticatedFetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/overview`);
      return project.ok ? project.json() : null;
    }, requestPath, tag, async (projectId, since) => {
      const changes = await authenticatedFetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/structure?since=${encodeURIComponent(since)}`);
      return changes.ok ? changes.json() : null;
    });
    Object.defineProperty(response, "json", { value: async () => expanded });
    Object.defineProperty(response, "text", { value: async () => JSON.stringify(expanded) });
  }
  return response;
}

export function responseErrorMessage(result: unknown, fallback: string) {
  if (!result || typeof result !== "object") return fallback;
  const error = "error" in result ? result.error : result;
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return fallback;
  if ("formErrors" in error && Array.isArray(error.formErrors)) {
    const formErrors = error.formErrors.filter(
      (item): item is string => typeof item === "string",
    );
    if (formErrors.length > 0) return formErrors.join(", ");
  }
  if (
    "fieldErrors" in error &&
    error.fieldErrors &&
    typeof error.fieldErrors === "object"
  ) {
    const fieldErrors = Object.entries(error.fieldErrors).flatMap(([, value]) =>
      Array.isArray(value)
        ? value.filter((item): item is string => typeof item === "string")
        : [],
    );
    if (fieldErrors.length > 0) return fieldErrors.join(", ");
  }
  return fallback;
}

export function isHttpsUrl(value: string) {
  if (!value.trim()) return true;
  try {
    return new URL(value.trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function isMattermostUrl(value: string) {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return (
      url.protocol === "https:" &&
      url.hostname.toLowerCase() === "mm.sberdevices.ru"
    );
  } catch {
    return false;
  }
}
