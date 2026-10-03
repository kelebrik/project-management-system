/** Small formatting and file helpers of the Structure page. */

export function emptyValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "" : String(value);
}

export function formatPercent(value: string | number | null | undefined) {
  const normalizedValue = emptyValue(value);
  return normalizedValue ? `${normalizedValue}%` : "";
}

export function downloadTextFile(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function safeFilename(value: string) {
  return value
    .trim()
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}
