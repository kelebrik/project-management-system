import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AlertTriangle, CornerLeftDown, CornerLeftUp } from "lucide-react";
import {
  ConfirmContext,
  type ConfirmFn,
  type ConfirmOptions,
} from "../hooks/useConfirm";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useI18n } from "../i18n/I18nProvider";

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
  const { t } = useI18n();
  const containerRef = useFocusTrap<HTMLDivElement>(true, onCancel);
  const tone = options.tone ?? "danger";
  const [calloutPosition, setCalloutPosition] = useState<{
    arrowLeft: number;
    bottom?: number;
    left: number;
    placement: "above" | "below";
    top?: number;
  } | null>(null);

  useLayoutEffect(() => {
    if (!options.callout) return;
    const target = document.querySelector<HTMLElement>(options.callout.selector);
    if (!target) return;
    const updatePosition = () => {
      const rect = target.getBoundingClientRect();
      const targetCenter = rect.left + rect.width / 2;
      const calloutWidth = Math.min(248, window.innerWidth - 24);
      const left = Math.max(
        12,
        Math.min(window.innerWidth - calloutWidth - 12, targetCenter - 19),
      );
      const belowTop = rect.bottom + 16;
      const placeAbove = rect.top >= 76;
      setCalloutPosition({
        arrowLeft: targetCenter - left - 9,
        ...(placeAbove
          ? { bottom: window.innerHeight - rect.top + 16 }
          : { top: belowTop }),
        left,
        placement: placeAbove ? "above" : "below",
      });
    };
    updatePosition();
    let animationFrame = 0;
    const scheduleUpdate = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updatePosition);
    };
    const resizeObserver = new ResizeObserver(scheduleUpdate);
    resizeObserver.observe(target);
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
    };
  }, [containerRef, options.callout]);

  return (
    <div
      className={`confirm-overlay${options.callout ? " has-callout" : ""}`}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      {options.callout && calloutPosition && (
        <div
          className="confirm-business-unit-callout"
          aria-hidden="true"
          data-placement={calloutPosition.placement}
          style={{
            bottom: calloutPosition.bottom,
            left: calloutPosition.left,
            top: calloutPosition.top,
          }}
        >
          {calloutPosition.placement === "above" ? (
            <CornerLeftDown
              className="confirm-business-unit-callout-arrow"
              size={24}
              strokeWidth={2}
              style={{ left: calloutPosition.arrowLeft }}
            />
          ) : (
            <CornerLeftUp
              className="confirm-business-unit-callout-arrow"
              size={24}
              strokeWidth={2}
              style={{ left: calloutPosition.arrowLeft }}
            />
          )}
          <span>{options.callout.message}</span>
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
            {options.cancelLabel ?? t("common.cancel")}
          </button>
          <button
            type="button"
            className={`confirm-accept ${tone}`}
            onClick={onConfirm}
          >
            {options.confirmLabel ?? t("common.delete")}
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
