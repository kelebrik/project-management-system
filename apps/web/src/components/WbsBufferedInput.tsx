import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { pendingBuffers } from "../app/wbsBuffers";


type WbsBufferedInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange"> & {
  value: string;
  onCommit: (value: string) => void;
};

/**
 * A WBS cell input that keeps keystrokes local while the user types, so typing
 * does not re-render the whole table. The text reaches the drafts on blur,
 * Enter and paste, before the existing save handlers run.
 */
export function WbsBufferedInput({
  value,
  onCommit,
  onBlur,
  onKeyDown,
  onPaste,
  ...inputProps
}: WbsBufferedInputProps) {
  const [local, setLocal] = useState<string | null>(null);
  // Read by event handlers in the same tick as the change, before React renders.
  const localRef = useRef<string | null>(null);
  // Escape restores the saved value itself; the blur that follows must not commit.
  const discardOnBlurRef = useRef(false);
  // One identity per mounted cell, made once.
  const [bufferId] = useState(() => ({}));

  useEffect(() => () => {
    pendingBuffers.delete(bufferId);
  }, [bufferId]);

  const setBuffer = (next: string | null) => {
    localRef.current = next;
    setLocal(next);
    if (next === null) pendingBuffers.delete(bufferId);
    else pendingBuffers.add(bufferId);
  };

  const commit = () => {
    const typed = localRef.current;
    setBuffer(null);
    if (typed !== null) onCommit(typed);
  };

  return (
    <input
      {...inputProps}
      value={local ?? value}
      onChange={(event) => setBuffer(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
        if (event.key === "Escape") discardOnBlurRef.current = true;
        onKeyDown?.(event);
      }}
      onPaste={(event) => {
        // A multi-cell paste is applied by the table; the typed text goes first.
        commit();
        onPaste?.(event);
      }}
      onBlur={(event) => {
        if (discardOnBlurRef.current) {
          discardOnBlurRef.current = false;
          setBuffer(null);
        } else {
          commit();
        }
        onBlur?.(event);
      }}
    />
  );
}
