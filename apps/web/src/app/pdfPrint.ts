export function printSectionAsPdf(sectionId: string, title: string) {
  if (!document.getElementById(sectionId)) return;
  const previousTitle = document.title;
  document.documentElement.dataset.printTarget = sectionId;
  document.body.dataset.printTarget = sectionId;
  document.title = title;
  window.setTimeout(() => {
    window.print();
    window.setTimeout(() => {
      delete document.documentElement.dataset.printTarget;
      delete document.body.dataset.printTarget;
      document.title = previousTitle;
    }, 150);
  }, 50);
}
