import { useState } from "react";
import type { SavedView } from "../app/domainTypes";

export function useSavedViewsState() {
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  const [savedViewName, setSavedViewName] = useState("");
  const [savingSavedView, setSavingSavedView] = useState(false);

  return {
    savedViews,
    setSavedViews,
    savedViewName,
    setSavedViewName,
    savingSavedView,
    setSavingSavedView,
  };
}
