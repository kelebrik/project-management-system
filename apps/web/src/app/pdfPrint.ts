export function printSectionAsPdf(sectionId: string, title: string) {
  if (!document.getElementById(sectionId)) return;
  const previousTitle = document.title;
  document.body.dataset.printTarget = sectionId;
  document.title = title;
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      delete document.body.dataset.printTarget;
      document.title = previousTitle;
    }, 150);
  }, 50);
}
