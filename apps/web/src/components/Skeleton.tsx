import { useI18n } from "../i18n/I18nProvider";
import type { CSSProperties } from "react";

type SkeletonBlockProps = {
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  style?: CSSProperties;
};

export function SkeletonBlock({
  width = "100%",
  height = 16,
  radius,
  style,
}: SkeletonBlockProps) {
  return (
    <div
      className="skeleton-block"
      aria-hidden="true"
      style={{ width, height, borderRadius: radius, ...style }}
    />
  );
}

/** Универсальный скелетон страницы: заголовок, ряд KPI-карточек и крупный блок. */
export function PageSkeleton({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="skeleton-page" role="status" aria-busy="true" aria-label={label ?? t("common.loading")}>
      <SkeletonBlock height={26} width="38%" />
      <div className="skeleton-row">
        <SkeletonBlock height={78} />
        <SkeletonBlock height={78} />
        <SkeletonBlock height={78} />
        <SkeletonBlock height={78} />
      </div>
      <SkeletonBlock height={260} />
    </div>
  );
}
