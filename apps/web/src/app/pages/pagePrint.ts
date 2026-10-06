import { PAGE_FORMATS, type PageFormat } from "@pms/shared";
import { printSectionAsPdf } from "../pdfPrint";

/**
 * Prints the sheet on exactly one page of its own size: 16:9 as a 16:9 page,
 * A4 as A4, without margins, at its real size (no scaling on screen applies).
 */
export function printDashboardPage(format: PageFormat, title: string) {
  const sheet = PAGE_FORMATS[format];
  const style = document.createElement("style");
  style.id = "mp-print-page-size";
  style.textContent = `@media print { @page { size: ${sheet.width}px ${sheet.height}px; margin: 0; } }`;
  document.getElementById(style.id)?.remove();
  document.head.appendChild(style);
  const cleanup = () => style.remove();
  window.addEventListener("afterprint", cleanup, { once: true });
  window.setTimeout(cleanup, 30_000);
  printSectionAsPdf("dashboard-page", title);
}
