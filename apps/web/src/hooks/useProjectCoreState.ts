import { useRef, useState } from "react";
import type {
  PassportRow,
  ProjectDetails,
  ProjectListItem,
  ProjectCalendarOverride,
} from "../app/domainTypes";
import { initialAppView, type AppView } from "../app/routes";
import {
  newProjectFormDefaults,
  type JiraFormState,
  type JiraWorkSectionDraft,
  type ProjectFormState,
  type ProjectRegistryDraft,
} from "../app/formState";

export function useProjectCoreState() {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [project, setProject] = useState<ProjectDetails | null>(null);
  const projectRef = useRef<ProjectDetails | null>(null);
  const projectLoadSequenceRef = useRef(0);
  const [activeView, setActiveView] = useState<AppView>(() => initialAppView());
  const [syncing, setSyncing] = useState(false);
  const [savingJira, setSavingJira] = useState(false);
  const [savingJiraWorkSections, setSavingJiraWorkSections] = useState(false);
  const [savingBaseline, setSavingBaseline] = useState(false);
  const [savingCalendar, setSavingCalendar] = useState<string | null>(null);
  const [selectedCalendarYear, setSelectedCalendarYear] = useState<number | null>(
    null,
  );
  const [savingProjectRegistryId, setSavingProjectRegistryId] =
    useState<string | null>(null);
  const [jiraForm, setJiraForm] = useState<JiraFormState>({
    baseUrl: "",
    boardUrl: "",
    projectKey: "",
    issuesJql: "",
    openIssuesJql: "",
  });
  const [jiraWorkSectionDrafts, setJiraWorkSectionDrafts] = useState<
    JiraWorkSectionDraft[]
  >([]);
  const [newProjectForm, setNewProjectForm] =
    useState<ProjectFormState>(() => newProjectFormDefaults());
  const [projectRegistryDrafts, setProjectRegistryDrafts] = useState<
    Record<string, ProjectRegistryDraft>
  >({});
  const [passportRows, setPassportRows] = useState<PassportRow[]>([]);
  const [savingPassportRows, setSavingPassportRows] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectSearch, setProjectSearch] = useState("");
  const [showProjectPicker, setShowProjectPicker] = useState(false);
  const [recentProjectIds, setRecentProjectIds] = useState<string[]>([]);

  return {
    projects,
    setProjects,
    selectedProjectId,
    setSelectedProjectId,
    project,
    setProject,
    projectRef,
    projectLoadSequenceRef,
    activeView,
    setActiveView,
    syncing,
    setSyncing,
    savingJira,
    setSavingJira,
    savingJiraWorkSections,
    setSavingJiraWorkSections,
    savingBaseline,
    setSavingBaseline,
    savingCalendar,
    setSavingCalendar,
    selectedCalendarYear,
    setSelectedCalendarYear,
    savingProjectRegistryId,
    setSavingProjectRegistryId,
    jiraForm,
    setJiraForm,
    jiraWorkSectionDrafts,
    setJiraWorkSectionDrafts,
    newProjectForm,
    setNewProjectForm,
    projectRegistryDrafts,
    setProjectRegistryDrafts,
    passportRows,
    setPassportRows,
    savingPassportRows,
    setSavingPassportRows,
    sidebarCollapsed,
    setSidebarCollapsed,
    projectSearch,
    setProjectSearch,
    showProjectPicker,
    setShowProjectPicker,
    recentProjectIds,
    setRecentProjectIds,
  };
}

export type CalendarOverrideByKey = Map<string, ProjectCalendarOverride>;
