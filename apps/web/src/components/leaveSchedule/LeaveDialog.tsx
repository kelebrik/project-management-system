import { X } from "lucide-react";
import type { ReactNode } from "react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

export function LeaveDialog({
  title,
  closeLabel,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useFocusTrap<HTMLElement>(true, onClose);
  return (
    <div
      className="leave-dialog-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        aria-label={title}
        aria-modal="true"
        className={`leave-dialog ${wide ? "wide" : ""}`}
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <h2>{title}</h2>
          <button aria-label={closeLabel} className="leave-icon-button" onClick={onClose} title={closeLabel} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className="leave-dialog-body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </section>
    </div>
  );
}
