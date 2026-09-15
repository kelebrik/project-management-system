import { businessUnitHeaders } from "../app/businessUnitContext";
import { readLocale } from "../i18n/locale";
import { createTranslator } from "../i18n/translate";

export const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

/** The client is not a React tree, so it reads the persisted choice the provider writes. */
function clientText() {
  return createTranslator(readLocale(typeof window === "undefined" ? undefined : window.localStorage));
}

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

function errorMessage(result: unknown, fallback: string) {
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

async function request<T>(
  path: string,
  options: RequestInit = {},
  fallback = clientText()("ui.common.apiRequestFailed"),
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...businessUnitHeaders(),
      ...options.headers,
    },
  });
  const text = response.status === 204 ? "" : await response.text();
  let result: unknown = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      throw new ApiError(
        clientText()("ui.common.apiResponseNotJson", { fallback }),
        response.status,
        text,
      );
    }
  }
  if (!response.ok) {
    if (
      response.status === 401 &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new CustomEvent("pms-auth-required"));
    }
    throw new ApiError(errorMessage(result, fallback), response.status, result);
  }
  return result as T;
}

async function download(path: string, fallback = clientText()("ui.common.apiDownloadFailed")) {
  return downloadRequest(path, {}, fallback);
}

async function downloadRequest(path: string, options: RequestInit, fallback: string) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body && !(options.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
      ...businessUnitHeaders(),
      ...options.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let details: unknown = text;
    try {
      details = text ? JSON.parse(text) : null;
    } catch {
      // Keep the bounded plain-text response as diagnostic details.
    }
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("pms-auth-required"));
    }
    throw new ApiError(errorMessage(details, fallback), response.status, details);
  }
  const disposition = response.headers.get("content-disposition") ?? "";
  const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/iu)?.[1];
  const plainName = disposition.match(/filename="([^"]+)"/iu)?.[1];
  return {
    blob: await response.blob(),
    filename: encodedName ? decodeURIComponent(encodedName) : plainName ?? "download",
  };
}

export const apiClient = {
  upload<T>(path: string, file: File, fallback?: string) {
    const body = new FormData();
    body.append("file", file);
    return request<T>(path, { method: "POST", body }, fallback);
  },
  get<T>(path: string, fallback?: string) {
    return request<T>(path, {}, fallback);
  },
  post<T>(path: string, body?: unknown, fallback?: string) {
    return request<T>(
      path,
      {
        method: "POST",
        body: body === undefined ? undefined : JSON.stringify(body),
      },
      fallback,
    );
  },
  patch<T>(path: string, body: unknown, fallback?: string, headers?: HeadersInit) {
    return request<T>(
      path,
      {
        method: "PATCH",
        body: JSON.stringify(body),
        headers,
      },
      fallback,
    );
  },
  put<T>(path: string, body: unknown, fallback?: string) {
    return request<T>(
      path,
      {
        method: "PUT",
        body: JSON.stringify(body),
      },
      fallback,
    );
  },
  delete<T = null>(path: string, fallback?: string) {
    return request<T>(path, { method: "DELETE" }, fallback);
  },
  download,
  downloadPost(path: string, body: unknown, fallback = clientText()("ui.common.apiDownloadFailed")) {
    return downloadRequest(path, { method: "POST", body: JSON.stringify(body) }, fallback);
  },
};
