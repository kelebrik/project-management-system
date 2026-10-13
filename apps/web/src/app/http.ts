import { liveClientHeaders } from "./liveClient";
import { businessUnitHeaders } from "./businessUnitContext";
import { noticeScheduleShift } from "./scheduleShiftNotice";
import { viewSectionHeaders } from "./sectionHeader";
import { currentWriteTag, expandIncompleteAnswer, expandStructureAnswer, structureDeltaHeaders, trackStructureWrite, withStructureActivity } from "./structureStore";
import { incompleteReplay, isIncompleteReplay, isStructureMutation, requestHeaders, sendWithMutationRetry } from "./structureMutations";

export const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const requestPath = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  // A Structure write and the application of its answer are one piece of activity: a catch-up waits for it.
  return withStructureActivity(init.method, requestPath, () => sendAuthenticated(input, init, requestPath));
}

async function sendAuthenticated(input: RequestInfo | URL, init: RequestInit, requestPath: string) {
  const tag = currentWriteTag();
  // One id for every attempt of a Structure mutation, so a repeat is answered, not run again.
  const mutation = isStructureMutation(init.method, requestPath);
  const headers = requestHeaders({
    ...(init.body ? { "Content-Type": "application/json" } : {}),
    ...businessUnitHeaders(),
    ...viewSectionHeaders(),
    ...liveClientHeaders(),
    ...structureDeltaHeaders,
  }, init.headers, init.method, requestPath);
  const { response, body, text } = await trackStructureWrite(init.method, () => sendWithMutationRetry(mutation, async () => {
    const response = await fetch(input, { ...init, credentials: "include", headers });
    // A mutation's whole answer is read here, so a connection lost while reading sends it again.
    const text = mutation && response.status !== 204 ? await response.text() : undefined;
    const delta = response.ok && response.headers.get("X-PMS-Structure") === "delta";
    const incomplete = response.ok && isIncompleteReplay(response);
    // An answer with Structure changes is read here, so it is counted out before it is expanded.
    const body = delta || incomplete ? (text !== undefined ? JSON.parse(text) : await response.json()) : undefined;
    return { response, body, text };
  }), requestPath);
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("pms-auth-required"));
  }
  if (response.ok) noticeScheduleShift(response);
  const reloadProject = async (projectId: string) => {
    const project = await authenticatedFetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/overview`);
    return project.ok ? project.json() : null;
  };
  const readChanges = async (projectId: string, since: string) => {
    const changes = await authenticatedFetch(`${apiBase}/api/projects/${encodeURIComponent(projectId)}/structure?since=${encodeURIComponent(since)}`);
    return changes.ok ? changes.json() : null;
  };
  if (body !== undefined) {
    // The answer carries Structure changes, or stands for a write whose changes are unknown: whoever reads it gets the whole Structure at that version.
    const expanded = isIncompleteReplay(response)
      ? await expandIncompleteAnswer(body, incompleteReplay(response), reloadProject, requestPath, tag, readChanges)
      : await expandStructureAnswer(body, reloadProject, requestPath, tag, readChanges);
    Object.defineProperty(response, "json", { value: async () => expanded });
    Object.defineProperty(response, "text", { value: async () => JSON.stringify(expanded) });
  } else if (text !== undefined) {
    // The body was already read; callers read it again from here.
    Object.defineProperty(response, "json", { value: async () => JSON.parse(text) });
    Object.defineProperty(response, "text", { value: async () => text });
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
