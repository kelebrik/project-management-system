import { Moon, Sun } from "lucide-react";
import { useTheme } from "../hooks/useTheme";
import { NavLabel } from "./NavLabel";

type ThemeToggleProps = {
  sidebarCollapsed: boolean;
};

export function ThemeToggle({ sidebarCollapsed }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  const label = isDark ? "Светлая тема" : "Тёмная тема";

  return (
    <button
      type="button"
      className="theme-toggle-nav"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
    >
      <NavLabel
        icon={isDark ? <Sun size={17} /> : <Moon size={17} />}
        label={label}
        sidebarCollapsed={sidebarCollapsed}
      />
    </button>
  );
}
