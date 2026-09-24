import { savedWbsForm, wbsToForm, type WbsFormState } from "./formState";
import type { WbsDependency, WbsItem } from "./domainTypes";

type WbsSnapshot = {
  items: WbsItem[];
  dependencies: WbsDependency[];
};

/**
 * Applies a server snapshot to the WBS drafts without discarding what the user
 * is typing. A draft field the user changed since the drafts were last synced
 * (or since it was sent, for the row being saved) keeps its local value; every
 * other field takes the server's value, including recalculated dates.
 */
export function mergeWbsDrafts({
  localDrafts,
  previous,
  next,
  sentDrafts = {},
}: {
  localDrafts: Record<string, WbsFormState>;
  previous: WbsSnapshot | null;
  next: WbsSnapshot;
  sentDrafts?: Record<string, WbsFormState>;
}): Record<string, WbsFormState> {
  const previousItems = new Map((previous?.items ?? []).map((item) => [item.id, item]));
  return Object.fromEntries(
    next.items.map((item) => {
      const server = wbsToForm(item, next.dependencies);
      const local = localDrafts[item.id];
      const previousItem = previousItems.get(item.id);
      const base =
        sentDrafts[item.id] ??
        (previousItem && previous ? savedWbsForm(previousItem, previous.dependencies) : undefined);
      if (!local || !base) return [item.id, server];
      const merged: Record<string, unknown> = { ...server };
      for (const field of Object.keys(server) as Array<keyof WbsFormState>) {
        if (local[field] !== base[field]) merged[field] = local[field];
      }
      return [item.id, merged as WbsFormState];
    }),
  );
}
