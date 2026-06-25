export const apiBase = import.meta.env.VITE_API_BASE_URL ?? "";

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
  fallback = "Запрос не выполнен",
): Promise<T> {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const text = response.status === 204 ? "" : await response.text();
  let result: unknown = null;
  if (text) {
    try {
      result = JSON.parse(text);
    } catch {
      throw new ApiError(`${fallback}: сервер вернул не JSON`, response.status, text);
    }
  }
  if (!response.ok) {
    const method = (options.method ?? "GET").toUpperCase();
    if (
      response.status === 401 &&
      !["GET", "HEAD", "OPTIONS"].includes(method) &&
      typeof window !== "undefined"
    ) {
      window.dispatchEvent(new CustomEvent("pms-auth-required"));
    }
    throw new ApiError(errorMessage(result, fallback), response.status, result);
  }
  return result as T;
}

export const apiClient = {
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
  patch<T>(path: string, body: unknown, fallback?: string) {
    return request<T>(
      path,
      {
        method: "PATCH",
        body: JSON.stringify(body),
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
  delete(path: string, fallback?: string) {
    return request<null>(path, { method: "DELETE" }, fallback);
  },
};
