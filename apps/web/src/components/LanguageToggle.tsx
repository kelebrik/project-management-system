import { Languages } from "lucide-react";
import { useI18n } from "../i18n/I18nProvider";
import { NavLabel } from "./NavLabel";

export function LanguageToggle({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const { locale, setLocale } = useI18n();
  const label = locale === "en" ? "Switch to Russian" : "Переключить на английский";
  return (
    <button
      type="button"
      className="theme-toggle-nav language-toggle-nav"
      data-testid="language-toggle"
      onClick={() => setLocale(locale === "en" ? "ru" : "en")}
      aria-label={label}
      title={label}
    >
      <NavLabel icon={<Languages size={17} />} label={label} sidebarCollapsed={sidebarCollapsed} />
    </button>
  );
}
