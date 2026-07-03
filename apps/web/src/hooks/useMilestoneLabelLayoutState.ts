import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { ProjectDetails, ProjectUiState } from "../app/domainTypes";
import {
  filterMilestoneLabelOffsets,
  milestoneLabelOffsetKey,
  normalizeMilestoneLabelLayoutOffsets,
  type MilestoneLabelOffset,
  type MilestoneLabelOffsets,
  type MilestoneLabelScope,
} from "../app/milestoneLabelLayout";
import { apiBase, authenticatedFetch } from "../app/http";

type UseMilestoneLabelLayoutStateOptions = {
  project: ProjectDetails | null;
  projectRef: React.MutableRefObject<ProjectDetails | null>;
  isReadOnly: boolean;
  milestoneLabelLayoutFingerprint: string;
  milestoneLabelLayoutOffsetKeys: string[];
  setProject: React.Dispatch<React.SetStateAction<ProjectDetails | null>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;
};

export function useMilestoneLabelLayoutState({
  project,
  projectRef,
  isReadOnly,
  milestoneLabelLayoutFingerprint,
  milestoneLabelLayoutOffsetKeys,
  setProject,
  setError,
}: UseMilestoneLabelLayoutStateOptions) {
  const [milestoneLabelOffsets, setMilestoneLabelOffsets] =
    useState<MilestoneLabelOffsets>({});
  const milestoneLabelOffsetsRef = useRef<MilestoneLabelOffsets>({});
  const milestoneLabelLayoutSaveSequenceRef = useRef(0);
  const milestoneLabelDragRef = useRef<{
    scope: MilestoneLabelScope;
    milestoneId: string;
    startClientX: number;
    startClientY: number;
    startOffset: MilestoneLabelOffset;
    deltaScaleX: number;
    deltaScaleY: number;
    hasMoved: boolean;
    dragTarget: Element;
  } | null>(null);

  useEffect(() => {
    milestoneLabelOffsetsRef.current = milestoneLabelOffsets;
  }, [milestoneLabelOffsets]);

  useEffect(() => {
    if (!project?.id) {
      milestoneLabelOffsetsRef.current = {};
      // eslint-disable-next-line react-hooks/set-state-in-effect -- syncs derived label offsets when the project context is cleared.
      setMilestoneLabelOffsets({});
      return;
    }
    if (milestoneLabelDragRef.current) return;

    const nextOffsets = normalizeMilestoneLabelLayoutOffsets(
      project.uiState?.milestoneLabelLayout,
      milestoneLabelLayoutOffsetKeys,
    );
    milestoneLabelOffsetsRef.current = nextOffsets;
    setMilestoneLabelOffsets(nextOffsets);
  }, [
    project?.id,
    project?.uiState?.milestoneLabelLayout,
    milestoneLabelLayoutOffsetKeys,
  ]);

  const persistMilestoneLabelLayout = useCallback(
    async (offsets: MilestoneLabelOffsets) => {
      const currentProject = projectRef.current;
      if (!currentProject?.id || isReadOnly) return;

      const nextOffsets = filterMilestoneLabelOffsets(
        offsets,
        milestoneLabelLayoutOffsetKeys,
      );
      const nextLayout = {
        fingerprint: milestoneLabelLayoutFingerprint,
        offsets: nextOffsets,
        updatedAt: new Date().toISOString(),
      };
      const saveSequence = ++milestoneLabelLayoutSaveSequenceRef.current;

      try {
        const response = await authenticatedFetch(
          `${apiBase}/api/projects/${currentProject.id}/ui-state`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ milestoneLabelLayout: nextLayout }),
          },
        );
        const result = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            result?.error ?? "Не удалось сохранить расположение подписей вех",
          );
        }
        if (saveSequence !== milestoneLabelLayoutSaveSequenceRef.current) return;

        const latestProject = projectRef.current;
        if (latestProject?.id === currentProject.id) {
          const nextProject = {
            ...latestProject,
            uiState: (result?.uiState ?? latestProject.uiState ?? {}) as ProjectUiState,
          };
          projectRef.current = nextProject;
          setProject(nextProject);
        }
      } catch (error) {
        setError(
          error instanceof Error
            ? error.message
            : "Не удалось сохранить расположение подписей вех",
        );
      }
    },
    [
      isReadOnly,
      milestoneLabelLayoutFingerprint,
      milestoneLabelLayoutOffsetKeys,
      projectRef,
      setError,
      setProject,
    ],
  );

  const setMilestoneLabelOffsetsForDrag = useCallback(
    (
      updater: (currentOffsets: MilestoneLabelOffsets) => MilestoneLabelOffsets,
    ) => {
      setMilestoneLabelOffsets((currentOffsets) => {
        const nextOffsets = updater(currentOffsets);
        milestoneLabelOffsetsRef.current = nextOffsets;
        return nextOffsets;
      });
    },
    [],
  );

  const startMilestoneLabelDrag = useCallback(
    (
      scope: MilestoneLabelScope,
      milestoneId: string,
      offset: MilestoneLabelOffset,
      event: ReactPointerEvent<Element>,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      const ownerSvg =
        event.currentTarget instanceof SVGElement
          ? event.currentTarget.ownerSVGElement
          : null;
      const ownerSvgRect = ownerSvg?.getBoundingClientRect();
      const deltaScaleX =
        ownerSvg && ownerSvgRect?.width
          ? ownerSvg.viewBox.baseVal.width / ownerSvgRect.width
          : 1;
      const deltaScaleY =
        ownerSvg && ownerSvgRect?.height
          ? ownerSvg.viewBox.baseVal.height / ownerSvgRect.height
          : 1;
      if ("setPointerCapture" in event.currentTarget) {
        try {
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Capturing can fail if the pointer is already released.
        }
      }
      milestoneLabelDragRef.current?.dragTarget.classList.remove("is-dragging");
      event.currentTarget.classList.add("is-dragging");
      document.body.classList.add("milestone-label-dragging");
      milestoneLabelDragRef.current = {
        scope,
        milestoneId,
        startClientX: event.clientX,
        startClientY: event.clientY,
        startOffset: offset,
        deltaScaleX,
        deltaScaleY,
        hasMoved: false,
        dragTarget: event.currentTarget,
      };
    },
    [],
  );

  const handleMilestoneLabelPointerMove = useCallback(
    (event: PointerEvent) => {
      const drag = milestoneLabelDragRef.current;
      if (!drag) return;
      event.preventDefault();

      const nextOffset = {
        x:
          drag.startOffset.x +
          (event.clientX - drag.startClientX) * drag.deltaScaleX,
        y:
          drag.startOffset.y +
          (event.clientY - drag.startClientY) * drag.deltaScaleY,
      };
      const offsetKey = milestoneLabelOffsetKey(drag.scope, drag.milestoneId);
      drag.hasMoved = true;
      setMilestoneLabelOffsetsForDrag((currentOffsets) => ({
        ...currentOffsets,
        [offsetKey]: {
          x: Math.round(nextOffset.x),
          y: Math.round(nextOffset.y),
        },
      }));
    },
    [setMilestoneLabelOffsetsForDrag],
  );

  const stopMilestoneLabelDrag = useCallback(() => {
    const drag = milestoneLabelDragRef.current;
    milestoneLabelDragRef.current = null;
    drag?.dragTarget.classList.remove("is-dragging");
    document.body.classList.remove("milestone-label-dragging");
    if (drag?.hasMoved) {
      void persistMilestoneLabelLayout(milestoneLabelOffsetsRef.current);
    }
  }, [persistMilestoneLabelLayout]);

  useEffect(() => {
    window.addEventListener("pointermove", handleMilestoneLabelPointerMove);
    window.addEventListener("pointerup", stopMilestoneLabelDrag);
    window.addEventListener("pointercancel", stopMilestoneLabelDrag);
    return () => {
      window.removeEventListener("pointermove", handleMilestoneLabelPointerMove);
      window.removeEventListener("pointerup", stopMilestoneLabelDrag);
      window.removeEventListener("pointercancel", stopMilestoneLabelDrag);
    };
  }, [handleMilestoneLabelPointerMove, stopMilestoneLabelDrag]);

  return {
    milestoneLabelOffsets,
    startMilestoneLabelDrag,
  };
}
