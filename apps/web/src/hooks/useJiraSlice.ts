import { JIRA_EMPTY_SLICE, JIRA_SLICE_VIEW_TYPE, decodeJiraSlice, encodeJiraSlice, jiraAnalyticsSliceSchema, jiraSavedSliceConfigSchema, type JiraAnalyticsSlice } from "@pms/shared";
import { useCallback, useEffect, useState } from "react";
import { apiClient } from "../api/client";
import type { SavedView } from "../app/domainTypes";

const storageKey = (projectId: string) => `pms:jira-slice:${projectId}`;

function storedSlice(projectId: string) {
  try {
    const parsed = jiraAnalyticsSliceSchema.safeParse(JSON.parse(window.localStorage.getItem(storageKey(projectId)) ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** The slice in the page address: a saved one by id, or the filters themselves. */
function linkedSlice() {
  const params = new URLSearchParams(window.location.search);
  return { savedId: params.get("slice"), encoded: params.get("sf") };
}

export type SavedSlice = SavedView & { slice: JiraAnalyticsSlice };

/**
 * The slice of «Jira work» a person looks at: from a link if the page was
 * opened by one, otherwise the last one they used in this project (kept in
 * the browser). Saved slices are SavedViews of the project, personal or shared.
 */
export function useJiraSlice(projectId: string) {
  // A link to a saved slice comes first, then the filters in the link, then the last slice used here.
  const [slice, setSliceState] = useState<JiraAnalyticsSlice>(() => {
    const { savedId, encoded } = linkedSlice();
    if (savedId) return JIRA_EMPTY_SLICE;
    return (encoded ? decodeJiraSlice(encoded) : null) ?? storedSlice(projectId) ?? JIRA_EMPTY_SLICE;
  });
  // Read once: the application may tidy the address before the saved slices come.
  const [linkedId] = useState(() => linkedSlice().savedId);
  /** False while a linked saved slice is being looked up: nothing is counted before it is known. */
  const [ready, setReady] = useState(() => !linkedId);
  const [saved, setSaved] = useState<SavedSlice[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  /** A link named a saved slice this person cannot see (private, deleted or of another project). */
  const [linkUnavailable, setLinkUnavailable] = useState(false);

  const setSlice = useCallback(
    (next: JiraAnalyticsSlice, savedId: string | null = null) => {
      setSliceState(next);
      setActiveId(savedId);
      try {
        window.localStorage.setItem(storageKey(projectId), JSON.stringify(next));
      } catch {
        /* Remembering is optional. */
      }
    },
    [projectId],
  );

  const fetchSaved = useCallback(async () => {
    const views = await apiClient.get<SavedView[]>(`/api/saved-views?viewType=${JIRA_SLICE_VIEW_TYPE}&projectId=${encodeURIComponent(projectId)}`);
    return views.flatMap((view) => {
      if (view.projectId !== projectId) return [];
      const parsed = jiraSavedSliceConfigSchema.safeParse(view.config);
      return parsed.success ? [{ ...view, slice: parsed.data.slice }] : [];
    });
  }, [projectId]);
  const reloadSaved = async () => setSaved(await fetchSaved());

  // A link to a saved slice opens it once its list has come.
  useEffect(() => {
    let alive = true;
    fetchSaved()
      .then((slices) => {
        if (!alive) return;
        setSaved(slices);
        const linked = linkedId ? slices.find((view) => view.id === linkedId) : undefined;
        if (linked) setSlice(linked.slice, linked.id);
        else if (linkedId) setLinkUnavailable(true);
        setReady(true);
      })
      .catch(() => {
        if (!alive) return;
        if (linkedId) setLinkUnavailable(true);
        setReady(true);
      });
    return () => {
      alive = false;
    };
  }, [fetchSaved, linkedId, setSlice]);

  const save = async (name: string, isShared: boolean) => {
    const view = await apiClient.post<SavedView>("/api/saved-views", { projectId, viewType: JIRA_SLICE_VIEW_TYPE, name, isShared, config: { version: 1, slice } }, "Не удалось сохранить срез");
    await reloadSaved();
    setActiveId(view.id);
  };
  const remove = async (id: string) => {
    await apiClient.delete(`/api/saved-views/${encodeURIComponent(id)}`, "Не удалось удалить срез");
    if (activeId === id) setActiveId(null);
    await reloadSaved();
  };
  /** A link to this page with the slice: by id when a saved slice is open unchanged, otherwise the filters. */
  const link = () => {
    const url = new URL(window.location.href);
    url.searchParams.delete("slice");
    url.searchParams.delete("sf");
    if (activeId) url.searchParams.set("slice", activeId);
    else url.searchParams.set("sf", encodeJiraSlice(slice));
    return url.toString();
  };
  return { slice, setSlice, saved, activeId, save, remove, link, linkUnavailable, ready };
}
