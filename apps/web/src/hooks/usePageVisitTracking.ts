import { useEffect, useRef } from "react";
import { projectAppViewKeys } from "@pms/shared";
import { apiClient } from "../api/client";
import type { CurrentUser } from "../app/adminTypes";
import type { AppView } from "../app/routes";

const anonymousVisitorStorageKey = "pms-anonymous-visitor-id";
let memoryAnonymousVisitorId: string | null = null;
const projectPageKeys = new Set<string>(projectAppViewKeys);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function randomUuid() {
  return crypto.randomUUID();
}

export function anonymousVisitorId() {
  if (memoryAnonymousVisitorId) return memoryAnonymousVisitorId;
  try {
    const saved = window.localStorage.getItem(anonymousVisitorStorageKey);
    if (saved && uuidPattern.test(saved)) {
      memoryAnonymousVisitorId = saved;
      return saved;
    }
    const created = randomUuid();
    window.localStorage.setItem(anonymousVisitorStorageKey, created);
    memoryAnonymousVisitorId = created;
    return created;
  } catch {
    memoryAnonymousVisitorId = randomUuid();
    return memoryAnonymousVisitorId;
  }
}

export function usePageVisitTracking({
  activeView,
  authReady,
  currentUser,
  projectId: loadedProjectId,
  selectedProjectId,
}: {
  activeView: AppView;
  authReady: boolean;
  currentUser: CurrentUser | null;
  projectId: string | null;
  selectedProjectId: string | null;
}) {
  const lastTrackedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || currentUser?.role === "ADMIN") return;
    const isProjectPage = projectPageKeys.has(activeView);
    if (
      isProjectPage &&
      (!loadedProjectId || !selectedProjectId || loadedProjectId !== selectedProjectId)
    ) {
      return;
    }
    const projectId = isProjectPage ? loadedProjectId : null;
    const anonymousId = currentUser ? null : anonymousVisitorId();
    const actorKey = currentUser ? `user:${currentUser.id}` : `anonymous:${anonymousId}`;
    const trackedKey = `${actorKey}:${activeView}:${projectId ?? "global"}`;
    if (lastTrackedKeyRef.current === trackedKey) return;
    lastTrackedKeyRef.current = trackedKey;

    void apiClient
      .post<null>(
        "/api/page-visits",
        {
          eventId: randomUuid(),
          pageKey: activeView,
          ...(projectId ? { projectId } : {}),
          ...(anonymousId ? { anonymousId } : {}),
        },
        "Не удалось учесть просмотр страницы",
      )
      .catch(() => undefined);
  }, [
    activeView,
    authReady,
    currentUser,
    loadedProjectId,
    selectedProjectId,
  ]);
}
