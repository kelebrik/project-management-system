import { AlignJustify, Rows3 } from "lucide-react";
import { useDensity } from "../hooks/useDensity";
import { useI18n } from "../i18n/I18nProvider";
import { NavLabel } from "./NavLabel";

export function DensityToggle({ sidebarCollapsed }: { sidebarCollapsed: boolean }) {
  const { density, toggleDensity } = useDensity();
  const { t } = useI18n();
  const compact = density === "compact";
  const label = t(compact ? "density.toComfortable" : "density.toCompact");
  return (
    <button
      type="button"
      className="theme-toggle-nav density-toggle-nav"
      data-testid="density-toggle"
      aria-pressed={compact}
      onClick={toggleDensity}
      aria-label={label}
      title={label}
    >
      <NavLabel icon={compact ? <Rows3 size={17} /> : <AlignJustify size={17} />} label={label} sidebarCollapsed={sidebarCollapsed} />
    </button>
  );
}
