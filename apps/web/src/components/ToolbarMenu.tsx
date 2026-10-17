import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type ToolbarMenuProps = {
  label: string;
  icon?: ReactNode;
  title?: string;
  className?: string;
  /** Hears the menu open and close: a menu whose actions need something prepared asks for it then. */
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
};

/**
 * A toolbar button that opens a small menu of actions under it. The menu
 * closes on an action, Escape, Tab or a click elsewhere; Escape gives the
 * focus back to the button. An action that keeps the menu open (a checkbox)
 * marks itself with data-keep-open.
 */
export function ToolbarMenu({ label, icon, title, className = "", onOpenChange, children }: ToolbarMenuProps) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    return () => window.removeEventListener("pointerdown", away);
  }, [open]);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      buttonRef.current?.focus();
    }
  };
  return (
    <div
      ref={rootRef}
      className={`toolbar-menu ${className}`.trim()}
      onKeyDown={onKey}
      onBlur={(event) => {
        if (open && !rootRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <button
        type="button"
        ref={buttonRef}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        title={title}
        onClick={() => setOpen((current) => !current)}
      >
        {icon}
        {label}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={label}
          className="toolbar-menu-popover"
          onClick={(event) => {
            const action = (event.target as HTMLElement).closest("button, a, label");
            if (action && !action.hasAttribute("data-keep-open")) setOpen(false);
          }}
        >
          {children}
        </div>
      )}
    </div>
  );
}
