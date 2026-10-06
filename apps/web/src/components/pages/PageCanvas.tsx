import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { PAGE_FORMATS, pagePlaceBox, type PageBox, type PageDocument, type PageQueryResult, type PageWidget } from "@pms/shared";
import { sheetGeometry, widgetPassport } from "../../app/pages/pageModel";
import { useI18n } from "../../i18n/I18nProvider";
import { chartColors } from "./charts/chartTheme";
import { useBoxSize } from "./useBoxSize";
import { WidgetBody } from "./widgets/WidgetView";

/**
 * The sheet of a page drawn at its real size and scaled to the screen. In
 * edit mode a widget moves by its title bar and resizes by its corner, cell
 * by cell; widgets it lands on move down, and a move that would push anything
 * off the sheet is shown red and not made. Arrows move the chosen widget,
 * Shift+arrows resize it.
 */

type Drag = { id: string; mode: "move" | "resize"; pointerId: number; startX: number; startY: number; origin: PageBox; candidate: PageBox; layout: PageWidget[] | null; active: boolean };

export type CanvasProps = {
  document: PageDocument;
  title: string;
  meta: ReactNode;
  results: Record<string, PageQueryResult>;
  /** The day the answers were counted for. */
  today: string;
  loading: boolean;
  editable: boolean;
  fit: "width" | "screen";
  selectedId: string | null;
  onSelect?: (id: string | null) => void;
  onLayout?: (widgets: PageWidget[], mergeKey?: string) => void;
  onRefuse?: (message: string) => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (id: string) => void;
  /** The id of the sheet element; the printed and exported sheet is "dashboard-page". */
  sheetId?: string;
};

export function PageCanvas(props: CanvasProps) {
  const { document, editable, selectedId } = props;
  const { t, locale } = useI18n();
  const outer = useRef<HTMLDivElement | null>(null);
  const sheet = useRef<HTMLDivElement | null>(null);
  const { width: outerWidth, height: outerHeight } = useBoxSize(outer);
  const geometry = sheetGeometry(document.format);
  const rows = PAGE_FORMATS[document.format].rows;
  const scale = outerWidth === 0 ? 1 : props.fit === "screen" ? Math.min(outerWidth / geometry.width, outerHeight / geometry.height) : Math.min(1.2, (outerWidth - 24) / geometry.width);
  const colors = chartColors(document.theme);
  const [drag, setDrag] = useState<Drag | null>(null);

  useEffect(() => {
    if (!drag) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrag(null);
    };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [drag]);

  const begin = (event: ReactPointerEvent, widget: PageWidget, mode: Drag["mode"]) => {
    if (!editable || event.button !== 0) return;
    event.stopPropagation();
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    const origin = { id: widget.id, x: widget.x, y: widget.y, w: widget.w, h: widget.h };
    setDrag({ id: widget.id, mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin, candidate: origin, layout: document.widgets, active: false });
    props.onSelect?.(widget.id);
  };

  const move = (event: ReactPointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = (event.clientX - drag.startX) / scale;
    const dy = (event.clientY - drag.startY) / scale;
    if (!drag.active && Math.hypot(dx, dy) < 4) return;
    const cells = Math.round(dx / (geometry.cellWidth + 10));
    const lines = Math.round(dy / (geometry.rowHeight + 10));
    const { origin } = drag;
    const candidate =
      drag.mode === "move"
        ? { ...origin, x: Math.max(0, Math.min(12 - origin.w, origin.x + cells)), y: Math.max(0, Math.min(rows - origin.h, origin.y + lines)) }
        : { ...origin, w: Math.max(1, Math.min(12 - origin.x, origin.w + cells)), h: Math.max(1, Math.min(rows - origin.y, origin.h + lines)) };
    if (drag.active && candidate.x === drag.candidate.x && candidate.y === drag.candidate.y && candidate.w === drag.candidate.w && candidate.h === drag.candidate.h) return;
    setDrag({ ...drag, active: true, candidate, layout: pagePlaceBox(document.widgets, candidate, rows) });
  };

  const end = (event: ReactPointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (drag.active) {
      if (drag.layout) props.onLayout?.(drag.layout);
      else props.onRefuse?.(t("ui.pages.canvas.noRoom"));
    }
    setDrag(null);
  };

  /** Arrows move, Shift+arrows resize; Delete removes; Ctrl+D copies. */
  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (!editable || !selectedId || drag) return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable]")) return;
    const widget = document.widgets.find((entry) => entry.id === selectedId);
    if (!widget) return;
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[event.key];
    if (step) {
      event.preventDefault();
      const box = event.shiftKey
        ? { id: widget.id, x: widget.x, y: widget.y, w: widget.w + step[0], h: widget.h + step[1] }
        : { id: widget.id, x: widget.x + step[0], y: widget.y + step[1], w: widget.w, h: widget.h };
      const layout = pagePlaceBox(document.widgets, box, rows);
      if (layout) props.onLayout?.(layout, `${event.shiftKey ? "size" : "move"}:${widget.id}`);
      else props.onRefuse?.(t("ui.pages.canvas.noRoom"));
      return;
    }
    if (event.key === "Delete" || event.key === "Backspace") {
      event.preventDefault();
      props.onDelete?.(widget.id);
    } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "d") {
      event.preventDefault();
      props.onDuplicate?.(widget.id);
    } else if (event.key === "Escape") {
      props.onSelect?.(null);
    }
  };

  const shown = drag?.active && drag.layout ? drag.layout : document.widgets;
  return (
    <div className={`mp-stage ${props.fit === "screen" ? "mp-stage-screen" : ""}`} ref={outer}>
      <div className="mp-scaler" style={{ width: geometry.width * scale, height: geometry.height * scale }}>
        <div
          aria-label={props.title}
          className={`mp-sheet ${editable ? "mp-sheet-editing" : ""}`}
          data-format={document.format}
          data-theme={document.theme}
          id={props.sheetId ?? "dashboard-page"}
          onKeyDown={onKeyDown}
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) props.onSelect?.(null);
          }}
          ref={sheet}
          role="region"
          style={{ width: geometry.width, height: geometry.height, transform: `scale(${scale})` }}
        >
          {editable && <div aria-hidden="true" className="mp-grid" style={{ left: 24, right: 24, top: 24 + 52, bottom: 24, backgroundSize: `${geometry.cellWidth + 10}px ${geometry.rowHeight + 10}px` }} />}
          <header className="mp-sheet-head">
            <h1>{props.title}</h1>
            <div className="mp-sheet-meta">{props.meta}</div>
          </header>
          {shown.map((widget) => {
            const box = drag?.id === widget.id && drag.active && drag.layout ? drag.candidate : widget;
            const rect = geometry.rect(box);
            const selected = widget.id === selectedId;
            const plain = widget.type === "heading" || widget.type === "divider";
            return (
              <section
                aria-label={widget.title || widget.text || widget.type}
                className={`mp-widget mp-widget-${widget.type} ${widget.tone ? `mp-tone-${widget.tone}` : ""} ${selected ? "mp-selected" : ""} ${drag?.id === widget.id && drag.active ? "mp-dragging" : ""}`}
                data-widget-id={widget.id}
                key={widget.id}
                onFocus={() => editable && props.onSelect?.(widget.id)}
                onPointerDown={(event) => {
                  if (editable) {
                    event.stopPropagation();
                    props.onSelect?.(widget.id);
                  }
                }}
                style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
                tabIndex={editable ? 0 : undefined}
              >
                {!plain && (
                  <header className="mp-widget-head" onPointerCancel={() => setDrag(null)} onPointerDown={(event) => begin(event, widget, "move")} onPointerMove={move} onPointerUp={end}>
                    <h2>{widget.title}</h2>
                    {widget.scope && <span className="mp-own-scope" title={t("ui.pages.widget.ownScope")}>{t("ui.pages.widget.ownScope")}</span>}
                    {widget.data && <span aria-label={t("ui.pages.widget.passport")} className="mp-passport" role="img" title={widgetPassport(widget, locale, document.periodDays)}>ⓘ</span>}
                  </header>
                )}
                {plain && editable && <div aria-hidden="true" className="mp-plain-handle" onPointerCancel={() => setDrag(null)} onPointerDown={(event) => begin(event, widget, "move")} onPointerMove={move} onPointerUp={end} />}
                <div className="mp-widget-body">
                  <WidgetBody colors={colors} loading={props.loading} periodDays={document.periodDays} result={props.results[widget.id]} today={props.today} drillable={!editable} widget={widget} />
                </div>
                {editable && selected && (
                  <span aria-label={t("ui.pages.widget.resize")} className="mp-resize" onPointerCancel={() => setDrag(null)} onPointerDown={(event) => begin(event, widget, "resize")} onPointerMove={move} onPointerUp={end} role="button" tabIndex={-1} />
                )}
              </section>
            );
          })}
          {drag?.active && !drag.layout && <div className="mp-ghost mp-ghost-refused" style={geometry.rect(drag.candidate)} />}
        </div>
      </div>
    </div>
  );
}
