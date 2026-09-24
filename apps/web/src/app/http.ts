import { businessUnitHeaders } from "./businessUnitContext";
import { viewSectionHeaders } from "./sectionHeader";

export const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
) {
  const response = await fetch(input, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...businessUnitHeaders(),
      ...viewSectionHeaders(),
      ...init.headers,
    },
  });
  if (response.status === 401) {
    window.dispatchEvent(new CustomEvent("pms-auth-required"));
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
