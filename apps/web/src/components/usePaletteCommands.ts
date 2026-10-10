import { useMemo } from "react";
import type { PaletteCommand } from "../app/commandPalette";
import type { ProjectDetails, ProjectListItem } from "../app/domainTypes";
import { projectModuleKeyByView, type ProjectModuleKey } from "../app/projectModules";
import { canViewAppView, type AppView, type ProjectSectionView, type SectionAccess } from "../app/routes";
import { useI18n } from "../i18n/I18nProvider";
import { createTranslator } from "../i18n/translate";
import type { PageContextValue } from "../pages/PageContext";
import { adminNavItems, developmentNavItems, operationsNavItems } from "./appNavItems";

type PaletteInput = {
  context: PageContextValue;
  isAuthenticated: boolean;
  isReadOnly: boolean;
  isProjectModuleEnabled: (key: ProjectModuleKey) => boolean;
  openView: (view: AppView, options?: { projectCode?: string | null }) => void;
  project: ProjectDetails | null;
  projects: ProjectListItem[];
  recentProjects: ProjectListItem[];
  sectionAccess: SectionAccess;
  selectProject: (projectId: string, nextView?: AppView) => void;
};

/** Everything Ctrl K can do for this person on this page. */
export function usePaletteCommands({
  context, isAuthenticated, isReadOnly, isProjectModuleEnabled, openView, project, projects, recentProjects, sectionAccess, selectProject,
}: PaletteInput): PaletteCommand[] {
  const { t, locale, setLocale } = useI18n();
  return useMemo(() => {
    const commands: PaletteCommand[] = [];
    // Each command also answers to its name in the other language.
    const other = createTranslator(locale === "ru" ? "en" : "ru");
    const go = (view: AppView, label: string, keywords: string[] = []) =>
      commands.push({ id: `goto:${view}`, group: "goto", label, keywords, run: () => openView(view) });

    if (isAuthenticated && !isReadOnly) {
      commands.push({ id: "action:new-project", group: "actions", label: t("ui.palette.newProject"), keywords: [other("ui.palette.newProject")], run: () => void context.openProjectCreate() });
    }
    if (project && !isReadOnly && project.status !== "CLOSED" && isProjectModuleEnabled("issues")) {
      commands.push({
        id: "action:new-issue", group: "actions", label: t("ui.palette.newIssue"), hint: project.code, keywords: [other("ui.palette.newIssue"), "issue", "вопрос"],
        run: () => {
          openView("project-issues");
          context.setIssueForm(context.emptyIssueForm);
          context.setIssueDrawerMode("create");
        },
      });
    }
    commands.push({
      id: "action:language", group: "actions", label: t("ui.palette.switchLanguage"), hint: locale === "ru" ? "English" : "Русский", keywords: ["language", "язык", "english", "русский"],
      run: () => setLocale(locale === "ru" ? "en" : "ru"),
    });

    if (project) {
      // Every section of the project whose module is on, those the header leaves out included.
      for (const [view, moduleKey] of Object.entries(projectModuleKeyByView) as Array<[ProjectSectionView, ProjectModuleKey]>) {
        if (!isProjectModuleEnabled(moduleKey)) continue;
        const label = `view.${view}` as const;
        commands.push({ id: `section:${view}`, group: "sections", label: t(label), hint: project.code, keywords: [other(label)], run: () => openView(view) });
      }
    }

    if (isAuthenticated) go("my-page", t("view.my-page"), [other("view.my-page")]);
    go("portfolio", t("view.portfolio"), [other("view.portfolio")]);
    go("projects", t("nav.registry"), [t("nav.projects"), other("nav.registry"), other("nav.projects")]);
    for (const item of [...operationsNavItems, ...adminNavItems, ...developmentNavItems]) {
      if (canViewAppView(item.view, sectionAccess)) go(item.view, t(item.label), [other(item.label)]);
    }
    go("wiki", "FAQ", ["help", "справка", "wiki"]);

    // Recent projects first, the rest after; the current one is where we are.
    const recentIds = new Set(recentProjects.map((item) => item.id));
    const ordered = [...recentProjects, ...projects.filter((item) => !recentIds.has(item.id))];
    for (const item of ordered) {
      if (item.id === project?.id) continue;
      commands.push({
        id: `project:${item.id}`, group: "projects", label: `${item.code} · ${item.name}`, hint: item.status === "CLOSED" ? t("ui.palette.closed") : undefined,
        keywords: [item.projectManager ?? ""], run: () => selectProject(item.id),
      });
    }
    return commands;
  }, [context, isAuthenticated, isProjectModuleEnabled, isReadOnly, locale, openView, project, projects, recentProjects, sectionAccess, selectProject, setLocale, t]);
}
