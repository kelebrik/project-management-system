import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import type { AppView } from "../app/routes";
import { useI18n } from "../i18n/I18nProvider";
import type { SimpleTranslationKey as TranslationKey } from "../i18n/types";
import type { ProjectNavItem } from "./ProjectSidebarMenu";

type ProjectMoreMenuProps = {
  items: ProjectNavItem[];
  activeView: AppView;
  /** The label a section has in the bar. */
  labelOf: (item: ProjectNavItem) => TranslationKey;
  hrefOf: (view: AppView) => string;
  onNavigate: (view: AppView) => void;
  onPreload: (view: AppView) => void;
};

/**
 * The project's sections kept behind «Ещё»: a button in the bar and a menu
 * under it. The menu is drawn outside the bar, which scrolls and would clip
 * it; it closes on a choice, Escape, a click elsewhere or a change of page,
 * and Escape gives the focus back to the button. When the open section is one
 * of these, the button is marked and names it.
 */
export function ProjectMoreMenu({ items, activeView, labelOf, hrefOf, onNavigate, onPreload }: ProjectMoreMenuProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const active = items.find((item) => item.view === activeView) ?? null;

  const position = () => {
    const box = buttonRef.current?.getBoundingClientRect();
    if (!box) return;
    const width = menuRef.current?.offsetWidth ?? 240;
    setPlace({ top: box.bottom + 4, left: Math.max(8, Math.min(box.left, window.innerWidth - width - 8)) });
  };
  useLayoutEffect(() => {
    if (open) position();
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    window.addEventListener("pointerdown", away);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    return () => {
      window.removeEventListener("pointerdown", away);
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
    };
  }, [open]);
  // A change of page closes the menu.
  const [shownView, setShownView] = useState(activeView);
  if (shownView !== activeView) {
    setShownView(activeView);
    setOpen(false);
  }
  // The first entry takes the focus once the menu is placed (hidden until then, it cannot be focused).
  useEffect(() => {
    if (open && place) menuRef.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [open, place]);

  if (items.length === 0) return null;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };
  const onMenuKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const entries = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])];
    const index = entries.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const step = event.key === "ArrowDown" ? 1 : -1;
      entries[(index + step + entries.length) % entries.length]?.focus();
    } else if (event.key === "Tab") {
      close(false);
    }
  };
  const choose = (event: MouseEvent<HTMLAnchorElement>, view: AppView) => {
    // A modifier or the middle button opens the section in a new tab, as a link does.
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    close(false);
    onNavigate(view);
  };

  return (
    <>
      <button
        type="button"
        ref={buttonRef}
        className={`section-more-button ${active ? "active" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
          }
        }}
      >
        {active ? (
          <>
            <span className="section-more-prefix">{t("nav.more")} ·</span> {active.icon} {t(labelOf(active))}
          </>
        ) : (
          t("nav.more")
        )}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t("nav.moreSections")}
          className="section-more-menu"
          style={place ? { top: place.top, left: place.left } : { visibility: "hidden" }}
          onKeyDown={onMenuKey}
        >
          {items.map((item) => (
            <a
              key={item.view}
              role="menuitem"
              href={hrefOf(item.view)}
              className={item.view === activeView ? "active" : ""}
              aria-current={item.view === activeView ? "page" : undefined}
              onPointerEnter={() => onPreload(item.view)}
              onFocus={() => onPreload(item.view)}
              onClick={(event) => choose(event, item.view)}
            >
              {item.icon}
              {t(labelOf(item))}
            </a>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
