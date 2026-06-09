import {
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
} from "react";

import {
  handleEditableKey,
  isEditableElement,
  rememberEditableInitialValue,
} from "./editableFields";

export function useEditableCaptureHandlers() {
  const handleEditableFocus = useCallback(
    (event: ReactFocusEvent<HTMLDivElement>) => {
      if (!isEditableElement(event.target)) return;
      if (event.target.closest(".wbs-excel-table")) return;
      rememberEditableInitialValue(event.target);
    },
    [],
  );

  const handleEditableKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!isEditableElement(event.target)) return;
      if (event.target.closest(".wbs-excel-table")) return;
      handleEditableKey(event.target, event.key, {
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        preventDefault: () => event.preventDefault(),
      });
    },
    [],
  );

  return { handleEditableFocus, handleEditableKeyDown };
}
