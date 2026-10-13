import { confirmedStructure } from "./structureStore";

/**
 * The Structure writes the server answers once per mutation id: sent again
 * with the same id (a dropped connection, a lost answer) they are not run
 * twice. Mirrors MUTATION_ROUTES of apps/api/src/services/structure-mutations.ts.
 */
const MUTATION_ROUTES: Array<[method: string, path: RegExp]> = [
  ["POST", /^\/projects\/[^/]+\/wbs-items$/],
  ["POST", /^\/projects\/[^/]+\/wbs-items\/(append|insert-after|reorder|renumber)$/],
  ["PATCH", /^\/projects\/[^/]+\/wbs-items\/bulk$/],
  ["DELETE", /^\/projects\/[^/]+\/wbs-items$/],
  ["PATCH", /^\/wbs-items\/[^/]+$/],
  ["DELETE", /^\/wbs-items\/[^/]+$/],
  ["POST", /^\/projects\/[^/]+\/wbs-dependencies$/],
  ["PATCH", /^\/wbs-dependencies\/[^/]+$/],
  ["DELETE", /^\/wbs-dependencies\/[^/]+$/],
  ["POST", /^\/projects\/[^/]+\/wbs-snapshot\/revert$/],
];

const MUTATION_HEADER = "X-PMS-Mutation-Id";
/** Pauses before sending the same mutation again. */
const RETRY_DELAYS_MS = [500, 1_500];

/** The API path of a request (after /api, without the query), whatever form its address takes. */
function apiPath(url: string) {
  const pathname = url.startsWith("/") ? url : new URL(url, "http://local").pathname;
  const path = pathname.split("?")[0] ?? "";
  const index = path.indexOf("/api/");
  return index >= 0 ? path.slice(index + 4) : path;
}

export function isStructureMutation(method: string | undefined, url: string) {
  const verb = (method ?? "GET").toUpperCase();
  const path = apiPath(url);
  return MUTATION_ROUTES.some(([routeMethod, pattern]) => routeMethod === verb && pattern.test(path));
}

function newMutationId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // Old browsers: a version 4 uuid from Math.random is enough to tell one write from another.
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16);
    return (char === "x" ? value : (value & 0x3) | 0x8).toString(16);
  });
}

/**
 * The request's headers: the defaults, then the caller's, then the mutation's.
 * Set one by one, so a header named in another case replaces, not doubles, one
 * of the same name; a mutation id the caller named is kept, as a queue sending
 * a write again does.
 */
export function requestHeaders(defaults: Record<string, string>, provided: HeadersInit | undefined, method: string | undefined, url: string) {
  const headers = new Headers(defaults);
  new Headers(provided).forEach((value, name) => headers.set(name, value));
  if (!isStructureMutation(method, url)) return headers;
  if (!headers.get(MUTATION_HEADER)) headers.set(MUTATION_HEADER, newMutationId());
  const projectId = apiPath(url).match(/^\/projects\/([^/]+)\//)?.[1];
  const version = projectId ? confirmedStructure(decodeURIComponent(projectId))?.version : undefined;
  if (version && !headers.get("X-PMS-Base-Version")) headers.set("X-PMS-Base-Version", version);
  return headers;
}

function aborted(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

/**
 * Sends a request and reads its whole answer; a Structure mutation whose
 * connection or answer was lost is sent again with the same id and body, as
 * the server answers a repeat with the first outcome. A cancelled request is
 * not sent again.
 */
export async function sendWithMutationRetry<T>(mutation: boolean, attempt: () => Promise<T>, wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))): Promise<T> {
  for (let tries = 0; ; tries += 1) {
    try {
      return await attempt();
    } catch (error) {
      if (!mutation || aborted(error) || tries >= RETRY_DELAYS_MS.length) throw error;
      await wait(RETRY_DELAYS_MS[tries]!);
    }
  }
}

/** The answer to a repeated mutation whose first answer the server did not keep: the page catches up with its version. */
export function isIncompleteReplay(response: Pick<Response, "headers">) {
  return response.headers.get("X-PMS-Mutation-Incomplete") === "1";
}

/** The project and version an incomplete answer names. */
export function incompleteReplay(response: Pick<Response, "headers">) {
  return { projectId: response.headers.get("X-PMS-Structure-Project"), version: response.headers.get("X-PMS-Structure-Version") };
}
