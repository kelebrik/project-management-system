import type { KeyboardEvent as ReactKeyboardEvent } from "react";

export type EditableElement =
  | HTMLInputElement
  | HTMLSelectElement
  | HTMLTextAreaElement;

export function isEditableElement(
  value: EventTarget | null,
): value is EditableElement {
  return (
    value instanceof HTMLInputElement ||
    value instanceof HTMLSelectElement ||
    value instanceof HTMLTextAreaElement
  );
}

export function rememberEditableInitialValue(target: EditableElement) {
  target.dataset.editInitialValue =
    target instanceof HTMLInputElement && target.type === "checkbox"
      ? String(target.checked)
      : target.value;
}

function setNativeEditableValue(target: EditableElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(target, "value");
  const prototype = Object.getPrototypeOf(target) as EditableElement;
  const prototypeDescriptor = Object.getOwnPropertyDescriptor(
    prototype,
    "value",
  );
  const setter =
    prototypeDescriptor?.set && prototypeDescriptor.set !== descriptor?.set
      ? prototypeDescriptor.set
      : descriptor?.set;
  setter?.call(target, value);
}

export function restoreEditableInitialValue(target: EditableElement) {
  const initialValue = target.dataset.editInitialValue;
  if (initialValue === undefined) return;
  if (target instanceof HTMLInputElement && target.type === "checkbox") {
    target.checked = initialValue === "true";
    target.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  setNativeEditableValue(target, initialValue);
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.dispatchEvent(new Event("change", { bubbles: true }));
}

export function handleEditableKey(
  target: EditableElement,
  key: string,
  options: {
    metaKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    preventDefault: () => void;
    onEnter?: () => void;
    onEscape?: () => void;
  },
) {
  const isTextArea = target instanceof HTMLTextAreaElement;
  if (isTextArea && key === "Enter" && options.shiftKey) {
    return;
  }
  if (key === "Enter" && (!isTextArea || options.metaKey || options.ctrlKey)) {
    options.preventDefault();
    options.onEnter?.();
    target.blur();
    return;
  }
  if (key === "Escape") {
    options.preventDefault();
    restoreEditableInitialValue(target);
    options.onEscape?.();
    target.blur();
  }
}

export function editableKeyHandler(
  options: {
    onEnter?: () => void;
    onEscape?: () => void;
  } = {},
) {
  return (event: ReactKeyboardEvent<EditableElement>) => {
    handleEditableKey(event.currentTarget, event.key, {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      shiftKey: event.shiftKey,
      preventDefault: () => event.preventDefault(),
      ...options,
    });
  };
}
