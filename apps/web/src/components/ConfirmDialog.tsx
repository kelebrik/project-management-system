import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CornerLeftUp } from "lucide-react";
import {
  ConfirmContext,
  type ConfirmFn,
  type ConfirmOptions,
} from "../hooks/useConfirm";
import { useFocusTrap } from "../hooks/useFocusTrap";

type PendingState = {
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
};

function ConfirmDialog({
  options,
  onConfirm,
  onCancel,
}: {
  options: ConfirmOptions;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const containerRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  const tone = options.tone ?? "danger";
  const [businessUnitCalloutPosition, setBusinessUnitCalloutPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!options.highlightBusinessUnit) return;
    const updatePosition = () => {
      const switcher = document.querySelector<HTMLElement>(
        ".business-unit-switcher",
      );
      if (!switcher) {
        setBusinessUnitCalloutPosition(null);
        return;
      }
      const rect = switcher.getBoundingClientRect();
      setBusinessUnitCalloutPosition({
        left: Math.max(
          12,
          Math.min(window.innerWidth - 260, rect.left + rect.width / 2 - 12),
        ),
        top: rect.bottom + 8,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [options.highlightBusinessUnit]);

  return (
    <div
      className="confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {options.highlightBusinessUnit && businessUnitCalloutPosition && (
        <div
          className="confirm-business-unit-callout"
          aria-hidden="true"
          style={businessUnitCalloutPosition}
        >
          <CornerLeftUp size={24} strokeWidth={2} />
          <span>Отмените и смените БЮ здесь</span>
        </div>
      )}
      <div
        className={`confirm-dialog ${tone}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={options.message ? "confirm-dialog-message" : undefined}
        ref={containerRef}
        tabIndex={-1}
      >
        <div className="confirm-dialog-head">
          {tone === "danger" && (
            <span className="confirm-dialog-icon" aria-hidden="true">
              <AlertTriangle size={18} />
            </span>
          )}
          <h2 id="confirm-dialog-title">{options.title}</h2>
        </div>
        {options.message && (
          <p id="confirm-dialog-message" className="confirm-dialog-message">
            {options.message}
          </p>
        )}
        <div className="confirm-dialog-actions">
          <button
            type="button"
            className="confirm-cancel"
            onClick={onCancel}
          >
            {options.cancelLabel ?? "Отмена"}
          </button>
          <button
            type="button"
            className={`confirm-accept ${tone}`}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingState | null>(null);

  const confirm = useCallback<ConfirmFn>(
    (options) =>
      new Promise<boolean>((resolve) => {
        setPending({ options, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (result: boolean) => {
      setPending((current) => {
        current?.resolve(result);
        return null;
      });
    },
    [],
  );

  const value = useMemo(() => confirm, [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {pending && (
        <ConfirmDialog
          options={pending.options}
          onConfirm={() => settle(true)}
          onCancel={() => settle(false)}
        />
      )}
    </ConfirmContext.Provider>
  );
}
