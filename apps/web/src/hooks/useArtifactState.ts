import { useState } from "react";
import type { ArtifactFormState } from "../app/formState";

export function useArtifactState() {
  const [artifactDrafts, setArtifactDrafts] = useState<
    Record<string, ArtifactFormState>
  >({});
  const [expandedArtifactId, setExpandedArtifactId] = useState<string | null>(
    null,
  );

  return {
    artifactDrafts,
    setArtifactDrafts,
    expandedArtifactId,
    setExpandedArtifactId,
  };
}
