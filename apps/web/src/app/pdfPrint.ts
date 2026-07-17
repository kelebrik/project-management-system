export function printSectionAsPdf(sectionId: string, title: string) {
  const section = document.getElementById(sectionId);
  if (!section) return;
  const previousTitle = document.title;
  let cleanedUp = false;
  let fallbackTimer: number | null = null;

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (fallbackTimer !== null) window.clearTimeout(fallbackTimer);
    window.removeEventListener("afterprint", cleanup);
    delete document.documentElement.dataset.printTarget;
    delete document.body.dataset.printTarget;
    document.title = previousTitle;
  };

  document.documentElement.dataset.printTarget = sectionId;
  document.body.dataset.printTarget = sectionId;
  document.title = title;

  window.addEventListener("afterprint", cleanup, { once: true });
  fallbackTimer = window.setTimeout(cleanup, 30_000);

  // Apply print-only layout before opening the native dialog while preserving
  // the button click's user activation.
  void section.offsetHeight;
  try {
    window.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}
