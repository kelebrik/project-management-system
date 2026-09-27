import gantryIcon from "../assets/gantry-icon.svg";
import { useI18n } from "../i18n/I18nProvider";

const PRODUCT_SITE = "https://github.com/kelebrik/project-management-system";

/** The product icon; it opens the product page on GitHub in a new window. */
export function GantryIconLink({ className }: { className: string }) {
  const { t } = useI18n();
  return (
    <a
      aria-label={t("auth.productSite")}
      className="gantry-icon-link"
      href={PRODUCT_SITE}
      rel="noopener noreferrer"
      target="_blank"
      title={t("auth.productSite")}
    >
      <img alt="" className={className} src={gantryIcon} />
    </a>
  );
}
