import type { WikiGroup } from "../app/wikiContent";

export const englishWikiGroups: WikiGroup[] = [
  {
    "id": "wiki-general",
    "title": "General structure",
    "description": "Navigation, access, search, saved views and the portfolio model.",
    "articles": [
      {
        "id": "wiki-navigation-access",
        "title": "Navigation, access and read-only modes",
        "summary": "How a user reaches each section, why some actions are blocked, and how global navigation differs from project navigation.",
        "keywords": ["navigation", "access", "permissions", "read only", "header", "search", "saved views", "language", "title"],
        "sections": [
          {
            "heading": "Top navigation",
            "points": [
              "The top header always exposes the global sections: Portfolio, Projects, Reports, Archive and FAQ.",
              "Once a project is selected, a separate row appears below the header: the project picker on the left, then Registry, the sections of the enabled modules and the Create button.",
              "The order of the project sections is: Status, Schedule, Gantt, Current Work, WBS, Jira Work, Charter, Business requirements, Open issues, Risks and problems, Changes, Budget, Calendars, Artifacts. A disabled module removes its sections from the row.",
              "Administration is available to the system administrator and to the administrator of the selected BU; the set of tabs depends on the role. The Development section is available only to the system administrator.",
              "The interface language switch RU/EN sits on the right-hand side of the header. The choice is stored in the browser and takes precedence over the default language.",
              "The default language comes from the build-time variable VITE_DEFAULT_LOCALE. If it is not set, sberdevices.ru hosts default to Russian and every other host defaults to English.",
              "On the FAQ page there is a horizontal table of contents with anchors above the articles, and the search box filters articles by title, keywords and body text."
            ]
          },
          {
            "heading": "Page title and section title",
            "points": [
              "The page header renders a single H1. On any project section except the Create project page, that H1 is the name of the selected project, not the name of the section.",
              "The section name reaches the H1 only on non-project pages: Portfolio, Projects, Archive, FAQ, Administration and Development.",
              "Next to the project name a compact project strip is shown: status, project manager, target date, RAG or delay, and the forecast for the active goal. Non-project pages have no strip.",
              "On the Reports page the header with the title is not rendered at all.",
              "The section name is additionally shown as an H2 inside the workspace: WBS and Gantt, for example, render their own heading and a short description above the toolbar."
            ]
          },
          {
            "heading": "Permissions and read-only mode",
            "points": [
              "Writing requires authentication. For project data the backend additionally checks access to the specific project.",
              "ADMIN can change any project. Other users must have ProjectAccess EDIT or ADMIN.",
              "If a project is closed, the project pages switch to read-only and the backend returns a write block.",
              "For entity routes the backend itself resolves the projectId from the id of a WBS row, dependency, artifact, RAID, issue, milestone or overview, and applies the project permissions."
            ]
          },
          {
            "heading": "Global search",
            "points": [
              "Search starts from two characters and searches across projects, WBS, open issues, decisions, RAID, artifacts and the executive overview.",
              "For WBS the indexed fields are code, title, owner, Jira key, Jira URL and description.",
              "For RAID the indexed fields are title, description, owner, mitigation, contingency and the Jira fields.",
              "Results are sorted by updatedAt and lead to the corresponding project section."
            ]
          },
          {
            "heading": "Saved views",
            "points": [
              "Saved views exist for WBS, Gantt and RAID.",
              "For WBS the saved settings are column order, widths and hiding, sorting, hierarchy level and the critical-path filter.",
              "For Gantt the saved settings are the zoom level, the visible window in days, the hierarchy level, the visibility of dependencies, critical path, baseline and forecast, plus the width of the WBS column and the height and width of the panel.",
              "For RAID the saved settings are the filters for type, decisions, overdue items and high risk.",
              "ADMIN saves a shared view, other users save personal views. Applying a view updates lastUsedAt."
            ]
          }
        ]
      },
      {
        "id": "wiki-portfolio-projects",
        "title": "Portfolio, projects and archive",
        "summary": "How project lists, portfolio risks, blockers, goals and closed projects are built.",
        "keywords": ["portfolio", "projects", "closed projects", "goals", "risks", "blockers", "archive"],
        "sections": [
          {
            "heading": "Active and closed projects",
            "points": [
              "Active projects are all projects whose status is not CLOSED. Closed projects are separated into the archive.",
              "The project list supports a tree built on parentId and is sorted by sortOrder/updatedAt.",
              "For an unauthenticated user, projects are returned with currentUserAccessLevel null. For ADMIN the level is shown as ADMIN.",
              "A closed project remains viewable, but writing is blocked both on the frontend and on the backend."
            ]
          },
          {
            "heading": "Portfolio goals",
            "points": [
              "The goal scale takes only active projects that have at least one WBS goal whose status is neither DONE nor CANCELLED.",
              "On the Portfolio page, goals are shown as separate timelines per such project, but on a shared calendar range so that project deadlines can be compared with each other.",
              "Projects with no outstanding goals do not get a row on the scale.",
              "The horizon of the scale runs from four months back to eight months ahead of the current date.",
              "The goal date is taken from dueDate, and if there is none, from forecastDueDate.",
              "Delay is calculated as the calendar difference between baselineDueDate and the current goal date."
            ]
          },
          {
            "heading": "Roadmap v2",
            "points": [
              "Roadmap v2 sits at the bottom of the Portfolio page and shows HW, SW and G2M work packages on a shared calendar scale.",
              "The map offers project search, a portfolio filter, horizons of 6, 12 and 24 months, a jump to the current date and a full-screen mode.",
              "Old links to Portfolio v2 automatically open the new section on the Portfolio page."
            ]
          },
          {
            "heading": "Portfolio risks and blockers",
            "points": [
              "A red portfolio risk is a RAID item of type RISK with riskScore >= 15 and a status other than CLOSED/VALIDATED.",
              "A blocking portfolio problem is a RAID item of type DEPENDENCY with riskScore >= 15 and a status other than CLOSED/VALIDATED.",
              "Grouping is done by portfolio; an empty portfolio becomes No portfolio.",
              "A project enters the red zone if it has at least one red risk or one blocking problem."
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "wiki-project-lifecycle",
    "title": "Project lifecycle",
    "description": "Project creation, charter, goals, closure and business requirements.",
    "articles": [
      {
        "id": "wiki-project-create-passport",
        "title": "Project creation, charter and target date",
        "summary": "What happens when a project is created, how the charter is built and how the management goal changes.",
        "keywords": ["project creation", "charter", "target date", "baseline", "copying", "closure"],
        "sections": [
          {
            "heading": "Project creation",
            "points": [
              "The creation form submits code, title, parentId, portfolio, sponsor, projectManager, status, RAG, dates, planned and forecast budget, schedule variance, progress, summary and sortOrder. The portfolio value is filled with the name of the selected BU.",
              "The businessUnitId itself is passed separately as the context of the selected business unit and is stored by the backend when the project is created.",
              "At creation time initialTargetDate equals targetDate. This is the project's starting goal.",
              "The Copy from project field supports searching across projects and phases and multiple selection: you can pick several current project WBS or individual phases together with their child items.",
              "Copying transfers the selected WBS rows, the hierarchy and the internal WBS dependencies. The merged WBS is renumbered, after which the schedule is recalculated.",
              "If the current WBS is not copied, a demo structure is created with phases, tasks, milestones and FS dependencies starting from the start date.",
              "The business unit is chosen in the Portfolio field. On the first click of Create project the user confirms the selected BU; a pointer in the dialog leads to that field.",
              "After creation the user receives EDIT access and becomes the project manager of the project without any change to their system role."
            ]
          },
          {
            "heading": "Project charter",
            "points": [
              "The first rows of the charter show two non-editable dates: Goal at project start and Current actual goal.",
              "Goal at project start is taken from initialTargetDate and never changes after the project is created.",
              "Current actual goal is taken from targetDate and changes only through the Approve new goal section.",
              "Below them are the user-defined field/description rows: they can be added, edited, deleted and saved through the charter controller."
            ]
          },
          {
            "heading": "Changing the target date",
            "points": [
              "The Approve new goal section requires a new date and a reason of at least 3 characters, and allows an optional approvedBy field.",
              "If there is an active GOAL row, previousDate is taken from its dueDate, otherwise from project.targetDate.",
              "The backend updates project.targetDate, stores a ProjectTargetDateChange and, if there is an active goal, moves its start/due/forecast dates to the new date.",
              "After the move the active goal gets workDays = 0 and calendarDays = 1, after which the WBS schedule recalculation is triggered.",
              "The goal change history shows the event date, the old value, the new value, the delta, the reason and the approver."
            ]
          },
          {
            "heading": "Closure and deletion",
            "points": [
              "A project can be closed by ADMIN. Closing an already closed project simply returns the current record.",
              "Project deletion goes through the cascade service and is recorded as an audit event with a full snapshot of the project.",
              "Closing does not delete data: the project moves to the Closed projects section and becomes read-only."
            ]
          }
        ]
      },
      {
        "id": "wiki-project-overview",
        "title": "Project status and executive overview",
        "summary": "How the project summary, red zone, tickets at risk, schedule variance and the versioned executive overview are calculated.",
        "keywords": ["project status", "overview", "executive overview", "red zone", "tickets", "schedule variance"],
        "sections": [
          {
            "heading": "Data on the Project status page",
            "points": [
              "When the overview loads, the backend guarantees the presence of three Jira work sections and returns the full project card, closed issues, the critical path and currentUserAccessLevel.",
              "The red zone shows up to five active RISK/DEPENDENCY items with riskScore >= 15, sorted by riskScore desc and then by title.",
              "Open decisions are taken from open issues with decisionRequired, sorted by due date and then limited to five records.",
              "Tickets at risk are calculated from the currently published revision of the critical-blocker-risk system aggregate; the Jira work sections do not affect this section.",
              "The nearest milestone is searched among WBS MILESTONE/GOAL items whose dueDate is not earlier than the current date."
            ]
          },
          {
            "heading": "Schedule variance in the overview",
            "points": [
              "The calculation uses baselineDueDate and forecastDueDate, and if there is no forecastDueDate, dueDate.",
              "CANCELLED rows are excluded; MILESTONE and GOAL are not used as open variance candidates.",
              "If the critical path has been calculated, the candidates are taken from the critical path; otherwise the whole WBS is used.",
              "If there is an active GOAL, the system looks for upstream work, the descendants of that work and the tasks from the branch of the active goal up to the goal itself.",
              "Reportable delay is computed only over leaf TASK rows, so that the parent variance and the child contribution are not double-counted.",
              "For delays an incremental impact is applied: the already explained contribution of the upstream cause is subtracted from the task's delay, so a downstream delay does not duplicate the upstream problem.",
              "Up to three work items with the largest contribution to delay and up to three work items with the largest contribution to acceleration are shown.",
              "The resulting scheduleVarianceFromStructure equals the delay of the active goal if it can be computed; otherwise it is the maximum open variance across the structure."
            ]
          },
          {
            "heading": "Executive overview generation",
            "points": [
              "A new version is created by the generate endpoint: version = last version + 1, status = GENERATED, generatedAt = the current moment.",
              "The executive summary gathers the project RAG, progress, scheduleVariance, critical open issues, the nearest unfinished milestone, active RAID items and decisions for management.",
              "The KPIs include Status, Progress, Schedule, Open issues, Risks and problems, Milestones. Tone depends on RAG, completion percentage, overdue milestones, critical issues and high-risk RAID items.",
              "Quality gates check that the Jira sync is up to date, that WBS dates are complete, that blockers are controlled, that approved/baseline artifacts exist and that mitigation discipline is followed for high risks.",
              "Risks are collected from open issues, active RISK items and BLOCKED/AT_RISK WBS rows, limited to five entries.",
              "Next steps are collected from decision issues, the nearest unfinished milestones and stale Jira snapshots older than seven days.",
              "Evidence records the sources of the metrics: charter, WBS, issues, Jira snapshots, milestones, artifacts and RAID."
            ]
          },
          {
            "heading": "Workflow and export",
            "points": [
              "Overview statuses: DRAFT, GENERATED, PM_REVIEW, APPROVED, PUBLISHED.",
              "Moving to PM_REVIEW sets reviewRequestedAt; moving to APPROVED sets approvedAt and approvedBy.",
              "A published overview cannot be moved to another workflow status.",
              "Publishing is allowed only from APPROVED and sets status = PUBLISHED, publishedAt = the current moment.",
              "The JSON export returns the project and the full overview snapshot with statusLabel, KPIs, gates, risks, nextSteps, decisions and evidence.",
              "The HTML export renders a standalone document and escapes HTML characters in the data.",
              "All generate/status/publish actions are written to the audit log as overview.generate, overview.status and overview.publish."
            ]
          }
        ]
      },
      {
        "id": "wiki-business-requirements",
        "title": "Business requirements",
        "summary": "An editable tabular requirements model with no XLSX dependency and no file import.",
        "keywords": ["business requirements", "requirements", "table", "excel", "clipboard"],
        "sections": [
          {
            "heading": "Data model",
            "points": [
              "A single ProjectBusinessRequirements record with JSON columns and rows is stored per project.",
              "If the record does not exist yet, the API returns the default columns: ID, Business requirement, Priority, Status, Comment.",
              "Columns have id/title; rows have an id and cells keyed by column id.",
              "API limits: up to 80 columns, up to 2000 rows, and a cell value of up to 5000 characters."
            ]
          },
          {
            "heading": "Working in the UI",
            "points": [
              "When the table is empty, the frontend shows three empty rows so that the user can start entering data immediately.",
              "Rows and columns can be added and deleted, but the last row and the last column cannot be deleted.",
              "Pasting from Excel works through the clipboard: the first line becomes the column headers, the rest become data rows.",
              "File-based XLSX import has been removed: the xlsx library is not used, so as not to keep a vulnerable dependency."
            ]
          },
          {
            "heading": "Saving",
            "points": [
              "PUT saves the entire table at once through an upsert by projectId.",
              "Writing requires ensureProjectWritable and is recorded as the audit event project.business_requirements.update.",
              "The dirty state is cleared only after a successful save."
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "wiki-planning",
    "title": "Planning and WBS",
    "description": "Current Work, WBS, schedule, dependencies, baseline, Gantt, milestones and calendars.",
    "articles": [
      {
        "id": "wiki-current-work",
        "title": "Current Work: the operational work list",
        "summary": "Which tasks appear in Current Work, what can be edited and how to jump to the corresponding WBS row.",
        "keywords": ["current work", "tasks", "deliverables", "work", "next Monday", "Jira", "MM", "comment"],
        "sections": [
          {
            "heading": "Which tasks are shown",
            "points": [
              "The table includes WBS rows of the types Task and Deliverable.",
              "Work items that are In progress, In review and At risk are shown regardless of their due date.",
              "Not started work is shown if its due date falls between the next upcoming Monday and the date 10 working days after it.",
              "Work with the statuses Failed, Done or Cancelled does not appear in Current Work."
            ]
          },
          {
            "heading": "Table and editing",
            "points": [
              "The table contains the number, work package, title, status, due date, owner, comment, Jira and MM.",
              "If the user has edit permission, status, due date, owner, a three-line comment and the Jira/MM links can be edited directly in Current Work. In read-only mode the values are only displayed.",
              "For Jira and MM a full URL is entered; after saving, the cell shows a short clickable Jira or MM label.",
              "The width of each column can be changed by dragging its right border. The setting is stored in the project UI state."
            ]
          },
          {
            "heading": "Jumping to WBS",
            "points": [
              "The task title is a link to the corresponding row on the WBS page.",
              "On navigation, WBS resets sorting and the critical-path filter, collapses the other branches as far as possible and leaves the chain of parents of the selected task expanded.",
              "The selected task is highlighted and scrolled to the center of the screen once. Subsequent user actions do not automatically return the scroll position to it."
            ]
          }
        ]
      },
      {
        "id": "wiki-wbs-model",
        "title": "WBS: row model and editing",
        "summary": "Which row types exist, which fields are editable and how the table behaves before saving.",
        "keywords": ["structure", "WBS", "row types", "columns", "editing", "level", "work package", "phase", "PDF", "PDF EN", "full screen"],
        "sections": [
          {
            "heading": "The WBS toolbar",
            "points": [
              "The full-screen button is available in both locales and expands the WBS workspace to the whole screen. A hint about the full-screen mode is shown once while the page is scrolled.",
              "The PDF button is available in both locales and prints the current WBS table. The title of the printed document is the project name plus the section name, for example \"Project - WBS\"; if the project has no name, the word Project is substituted.",
              "The PDF EN and EN buttons are shown only in the Russian locale. In the English locale the toolbar keeps the ordinary PDF button.",
              "PDF EN prints a separate English WBS block with its own title of the form \"English project name - Structure\", with English column, type and status labels.",
              "The EN menu contains Import and Export of translations. Export produces an HTML file with Russian title / English translation pairs, and import accepts the same HTML back.",
              "The English title of a row is chosen by priority: the manual translation from the import, the built-in glossary, the local translation cache, and then the original Russian title. Manual translations and the cache live in the browser, not on the server.",
              "Undo, Redo, Save changes and Capture the baseline plan are shown only when the user has edit permission; in read-only mode they are absent.",
              "The toolbar also always has the Columns menu, the hierarchy level switch 1..5 and a state indicator: the number of unsaved rows, the saving state or the time of the last save."
            ]
          },
          {
            "heading": "WBS row types",
            "points": [
              "PHASE - the top or aggregating level of the plan. It is used as a phase in the Milestones by phase section and as a thin line with a label and a date range in the Gantt chart.",
              "WORK_PACKAGE - a work package. In status aggregation it behaves as a parent; in the Gantt chart it is shown as the same thin line with a label and a date range.",
              "TASK - regular work with a duration, owner, progress, calendar and dependencies.",
              "DELIVERABLE - a deliverable. In the resource calculation it is counted as work together with TASK.",
              "MILESTONE - a checkpoint with zero duration. It is used in the project schedule.",
              "GOAL - a management goal of the project with zero duration. It participates in the portfolio goal scale and in the target summary calculation."
            ]
          },
          {
            "heading": "Table columns",
            "points": [
              "The fixed columns are Level and WBS. The rest can be hidden, reordered and resized.",
              "The editable fields are title, type, status, owner, comment, start/due, workDays, calendarDays, calendarCode, effortPercent, progress, Jira URL, MM URL, predecessor1..6, leadLagDays and wbsLevel.",
              "Jira and MM require a full URL, but after saving they are displayed as short clickable Jira and MM labels.",
              "The row code is read-only: it is shown from draftWbsCodes and is recalculated from the level/order of the rows.",
              "A dirty cell is highlighted if the draft differs from the source or if the future code differs from the current one.",
              "Enter saves the cell being edited; Escape rolls the draft back to the current state of the row."
            ]
          },
          {
            "heading": "Hierarchy and level",
            "points": [
              "Visual nesting is derived from parentId, but when the level changes the new parentId is recalculated: the nearest preceding row with a level lower than the current one is used.",
              "The minimum level is 1; in the UI the stepper limits increases up to 12.",
              "After a level change the backend renumbers the whole structure and updates parentId, wbsLevel and the predecessor fields.",
              "Row collapsing is stored locally in collapsedWbsIds. The quick depth buttons 1..5 collapse all rows deeper than the selected level."
            ]
          },
          {
            "heading": "Sorting and drag-and-drop",
            "points": [
              "Sorting works on the current draft values, including the localized type and status labels.",
              "Empty values are sorted after filled ones.",
              "When sorting is enabled, moving rows by drag-and-drop is disabled, so that the sorted view is not mixed with the physical WBS order.",
              "Drag-and-drop moves the entire sub-branch of a row: the source and all following rows with a greater level.",
              "A sub-branch cannot be dropped inside itself."
            ]
          },
          {
            "heading": "Work package -> Phase",
            "points": [
              "Changing WORK_PACKAGE to PHASE has a dedicated client-side algorithm; it is not a simple patch of the type field.",
              "The entire work-package block is taken: the row itself and all its descendants, for as long as the level of the following rows is greater than the original level of the package.",
              "The block is moved before the current top-level phase found above it in the list. If there is no such phase, the block stays near its original position.",
              "The levels of the whole block are decreased by the offset of the original package: the package itself becomes level 1, and the descendants keep their relative nesting.",
              "In metadata, typesById is sent only for the original row, and levelsById for the whole block.",
              "The backend saves the new order, type and levels, after which renumberProjectWbs assigns the codes and parentId again. As a result the package becomes a full first-level phase and its child tasks stay beneath it."
            ]
          }
        ]
      },
      {
        "id": "wiki-wbs-algorithms",
        "title": "WBS: schedule, dependencies, statuses and baseline",
        "summary": "The actual backend algorithms that run after WBS changes.",
        "keywords": ["schedule", "dependencies", "statuses", "baseline", "critical path", "renumber", "predecessor"],
        "sections": [
          {
            "heading": "Renumbering",
            "points": [
              "renumberProjectWbs walks the rows by sortOrder/createdAt/id and builds the codes using counters per wbsLevel.",
              "If the level jumps deeper without an explicit intermediate parent, the counters are filled with ones.",
              "parentId is chosen as the nearest preceding item of a lower level.",
              "To avoid a conflict on the unique projectId/code index, the backend first temporarily writes code = __renumber_id and then writes the final codes.",
              "After renumbering, the predecessor fields are synchronized with the existing WbsDependency records: a successor receives up to six predecessor codes."
            ]
          },
          {
            "heading": "Dependencies",
            "points": [
              "The supported types are FS, SS, FF and SF. In the predecessor1..6 columns the user enters row codes, while the backend stores normalized WbsDependency records by id.",
              "When predecessor fields are entered, the frontend creates FS dependencies. leadLagDays is applied to all predecessors entered in that save.",
              "The same predecessor cannot be specified twice, a row cannot be its own predecessor, and the backend forbids dependency cycles.",
              "A single successor can have at most six unique predecessors.",
              "If a link is created between the same pair with a different type, the old link of the other type is deleted and the new one remains.",
              "If there are no WbsDependency records but the predecessor fields are filled, the critical path and schedule calculations create temporary FS links from those fields."
            ]
          },
          {
            "heading": "Date calculation",
            "points": [
              "The schedule is recalculated after creation, modification, deletion, reorder, renumber, dependency change, baseline copy and calendar changes.",
              "The topological order is built from the dependencies; if there is a cycle, the remaining rows are appended in plan order.",
              "FS sets the successor start to the next working day after the predecessor finish plus the lag. SS constrains the start relative to the predecessor start. FF and SF constrain the finish.",
              "If the dates were changed, driver = dates: workDays is recalculated from start/due. If workDays was changed, driver = workDays: dueDate is computed from the start and the duration.",
              "The full-row autosave after a date edit is protected against stale durations: if the dates have not changed but old workDays/calendarDays values arrive, the backend does not overwrite the calculated durations.",
              "MILESTONE and GOAL always have zero duration: startDate = dueDate, workDays = 0. CANCELLED also collapses to a single day with workDays = 0.",
              "Parent rows get start as the minimum of the children's start, due as the maximum of the children's due, and forecast likewise. The parent's duration is computed using its own calendar.",
              "The calculation runs iteratively for up to 20 passes in order to stabilize the constraints and the parent aggregates."
            ]
          },
          {
            "heading": "Calendars in the calculations",
            "points": [
              "By default the working days are Monday to Friday.",
              "ProjectCalendarOverride redefines a specific day for the RU or CN calendar as working or non-working.",
              "addWorkingDays moves only across the working days of the calendar selected for the row.",
              "calendarDays is counted on the calendar and inclusively: both start and due are part of the duration.",
              "workingDays is counted over the calendar's working days, taking overrides into account."
            ]
          },
          {
            "heading": "Status aggregation",
            "points": [
              "Statuses are rolled up only for PHASE and WORK_PACKAGE.",
              "CANCELLED child rows are excluded from the aggregation.",
              "The aggregation priority is: AT_RISK, then BLOCKED, then IN_PROGRESS, then IN_REVIEW, then DONE if all active children are DONE, then IN_PROGRESS if at least one is DONE, otherwise NOT_STARTED.",
              "If a parent has no active children, its status is not changed.",
              "If the aggregated status becomes DONE, closedAt is set to the current moment; if it stops being DONE, closedAt is cleared."
            ]
          },
          {
            "heading": "Deletion, undo/redo and baseline",
            "points": [
              "Deleting a single row means lifting its direct children up to the parent of the deleted row, decreasing the levels of the descendants and deleting the dependencies where the row was a predecessor or a successor.",
              "Bulk deletion lifts the rows from deleted branches upward, decreasing the level by the number of deleted ancestors, and deletes the related dependencies.",
              "Undo/redo works on WBS snapshots: wbsItems and wbsDependencies are restored through the snapshot route.",
              "A full baseline capture is the Capture the baseline plan button in the WBS toolbar. It writes baselineStartDate/baselineDueDate from the current start/due across every row of the project and creates a new WbsBaseline version with a snapshot of all rows: version = the maximum one + 1, status ACTIVE.",
              "Empty forecastStartDate/forecastDueDate values are filled with the current start/due at the same time. A forecast that is already filled in is not overwritten.",
              "A selective baseline update is a separate button; it appears in the toolbar of the selected rows and is available only to the system administrator. It carries the current dates into the baseline for the selected rows only and does not create a new WbsBaseline version.",
              "The selective update button is disabled while the selected rows still have unsaved changes: the dates have to be saved first.",
              "If at least one of the supplied ids is not found in the project, the backend returns 400 with a missingItemIds list and updates no rows at all.",
              "Both actions require a confirmation dialog and record a WBS command of type BASELINE with a snapshot of the result.",
              "Copying a baseline into a new project creates the WBS rows, restores the parent by parentCode, creates FS dependencies from the predecessor fields and copies the calendar overrides."
            ]
          }
        ]
      },
      {
        "id": "wiki-gantt-critical-path",
        "title": "Gantt and critical path",
        "summary": "How the Gantt chart, dependencies, baseline/forecast and the critical/near-critical highlighting are built.",
        "keywords": ["gantt", "critical path", "baseline", "forecast", "dependencies", "zoom", "scenario"],
        "sections": [
          {
            "heading": "Gantt section settings",
            "points": [
              "The Gantt toolbar contains the full-screen mode, the Undo and Redo buttons, the zoom, the visible window, a jump to today, the View settings menu and the hierarchy level switch 1..5.",
              "The zoom switches between Weeks, Months and Quarters. Months are selected by default.",
              "The visible window is 30, 90, 180 days or All. The default is 90 days.",
              "The Today button scrolls the timeline horizontally to the marker of the current date.",
              "The View settings menu contains five toggles: dependencies, critical path, baseline, forecast and reset panel size. There is no separate near-critical toggle; near-critical rows are highlighted together with the critical path.",
              "The width of the WBS column and the panel sizes are changed by dragging; resetting the size restores the defaults.",
              "Below the toolbar a legend of statuses and row types is rendered, including the critical path and a float of up to five working days, together with the warnings from the critical-path calculation.",
              "Above the toolbar there is a scenario block: up to 20 changes of dates or durations, a calculation through a read-only endpoint and a comparison with the working plan. A scenario stores nothing in the project, and Undo and Redo are blocked while the preview is active; the button that returns to the working plan exits it.",
              "Scenario drafts are stored in the user's browser and are bound to the user-project pair."
            ]
          },
          {
            "heading": "Gantt model",
            "points": [
              "The Gantt chart takes the visible WBS tree, honoring collapsedWbsIds, and does not display CANCELLED rows.",
              "Only rows that have valid startDate and dueDate values appear on the scale.",
              "The horizon runs from the beginning of the month of the minimum date to the month after the maximum date, including the baseline and forecast dates.",
              "PHASE and WORK_PACKAGE are rendered as thin lines with the label Title | start - due directly on the timeline, while MILESTONE and GOAL are rendered as markers with a minimum width.",
              "Rows are highlighted by status tone, criticality and near-critical state."
            ]
          },
          {
            "heading": "Dependencies on the chart",
            "points": [
              "FS and FF leave from the end of the predecessor; SS and SF leave from its start.",
              "FS and SS enter the start of the successor; FF and SF enter its end.",
              "If several lines use the same endpoint, they are assigned slot offsets so that the lines do not lie exactly on top of each other.",
              "Only dependencies whose both rows are visible on the chart are shown."
            ]
          },
          {
            "heading": "Critical path",
            "points": [
              "The backend merges the explicit WbsDependency records and the predecessor fields, and then builds the topological order.",
              "The forward pass computes earlyStart/earlyFinish taking calendars and lag into account.",
              "The backward pass from projectFinishDate computes lateStart/lateFinish.",
              "totalFloatWorkDays <= 0 makes a row critical.",
              "Near-critical is a non-critical row with a float of <= 5 working days.",
              "If there is a cycle in the dependencies, the calculation adds a warning and computes the available part of the graph.",
              "A critical dependency is a tight link between critical rows; then an upstream traversal adds the dependencies that lead to critical successors."
            ]
          },
          {
            "heading": "Baseline and forecast",
            "points": [
              "The baseline overlay is built from baselineStartDate/baselineDueDate.",
              "The forecast overlay is built from forecastStartDate/forecastDueDate.",
              "The variance on a Gantt row is computed as the difference between baselineEnd and forecastEnd.",
              "The Gantt saved view stores the week/month/quarter zoom level, the 30/90/180-day window or All, the hierarchy level, the visibility of dependencies, critical path, baseline and forecast, the width of the WBS column and the panel sizes."
            ]
          }
        ]
      },
      {
        "id": "wiki-milestones-calendar",
        "title": "Project schedule, milestones and calendars",
        "summary": "How the Project schedule section builds milestones by phase and the serpentine scale, and how it stores user label offsets.",
        "keywords": ["project schedule", "milestones", "goals", "calendar", "dragging", "serpentine"],
        "sections": [
          {
            "heading": "Source of milestones",
            "points": [
              "The schedule includes WBS items of the types MILESTONE and GOAL.",
              "The phase of a milestone is determined by walking up parentId to the nearest ancestor of type PHASE.",
              "If the project has no phases, all milestones go into the common lane All milestones. If there are phases, milestones with no phase found go into No phase.",
              "The fallback lane All milestones or No phase is not shown if it contains only goals and no regular milestones. Goals attached to a phase continue to be displayed on that phase's lane.",
              "Milestones are sorted by dueDate and then by sortOrder."
            ]
          },
          {
            "heading": "Milestone state",
            "points": [
              "DONE yields the state Milestone passed and a green tone.",
              "If dueDate is earlier than today and the milestone is not DONE, the state is Milestone overdue with a red tone.",
              "For the remaining milestones, the last five non-CANCELLED tasks completed before the milestone date are examined.",
              "If the last tasks are all NOT_STARTED, the state is Last tasks not started.",
              "If among the last tasks there is an IN_PROGRESS or IN_REVIEW one, the state is Last tasks in progress.",
              "Otherwise the milestone is considered planned."
            ]
          },
          {
            "heading": "Scales",
            "points": [
              "The Milestones by phase section shows a range from two months back to four months ahead of the current date.",
              "A phase is hidden from the Milestones by phase block if all of its milestones have the status DONE and passed more than 3 weeks ago. Overdue unfinished milestones remain visible.",
              "The common serpentine scale takes the full date range of the milestones and compresses the offset relative to the position of today.",
              "If there are milestones but they fall outside the current range, the model returns hasMilestonesOutsideRange and the UI shows the corresponding message.",
              "Automatic label layout uses candidate positions and penalties for overlapping with other labels, markers and the axis."
            ]
          },
          {
            "heading": "Saving to PDF",
            "points": [
              "The Save to PDF button prints a separate two-page document: Project goals and Milestones.",
              "The document includes the headings of both sections and the milestone legend; the interface controls are hidden when printing.",
              "If the list of goals does not fit the height of the print area, it is scaled down proportionally so that it stays on the first page."
            ]
          },
          {
            "heading": "Manual label offsets",
            "points": [
              "Dragging a label changes only the project UI state, not the WBS date and not the order of the structure.",
              "The state is stored in project.uiState.milestoneLabelLayout with a fingerprint of the current model and offsets keyed by milestone.",
              "While dragging, the active label is highlighted with a red fill.",
              "If the model fingerprint has changed, the stale offsets are filtered out.",
              "A closed project and read-only mode do not allow new offsets to be saved."
            ]
          },
          {
            "heading": "Calendars",
            "points": [
              "The Calendars page shows the RU and CN calendars for three years from the earliest project date.",
              "Clicking a day creates or removes an override: a working day becomes a day off/holiday and vice versa.",
              "Changing an override immediately triggers a recalculation of the WBS schedule.",
              "RU/CN is selected on each WBS row, so two adjacent tasks can count working days using different calendars."
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "wiki-execution",
    "title": "Execution and control",
    "description": "Jira, open issues, RAID, changes, budget, artifacts and resources.",
    "articles": [
      {
        "id": "wiki-jira-issues",
        "title": "Jira work and open issues",
        "summary": "How a project stores Jira settings, synchronizes work sections and keeps internal issues.",
        "keywords": ["jira", "open issues", "issues", "decisions", "sync", "JQL", "filter", "read-only", "demo"],
        "sections": [
          {
            "heading": "Jira credentials",
            "points": [
              "Jira credentials are not set in the admin panel. The backend reads JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN and JIRA_MAX_RESULTS from the container environment.",
              "If the env fields are not set, sync returns Jira is not configured.",
              "The request uses Basic auth against /rest/api/2/search, and if that endpoint is unavailable, falls back to /rest/api/3/search/jql.",
              "The fields requested from Jira are summary, status, priority, assignee, reporter, issuetype, resolution and updated."
            ]
          },
          {
            "heading": "Jira is read-only",
            "points": [
              "Every request to Jira goes through a fail-closed guard. Only GET requests to /rest/api/2|3/filter/{id}, /myself and /issue/{key} with the optional changelog, comment, worklog and remotelink suffixes are allowed.",
              "Among POST requests only rest/api/2/search, rest/api/3/search/jql, rest/auth/1/session and login.jsp are allowed: these are search and authentication operations, not writes of Jira business data.",
              "Any other path, and any PUT, PATCH or DELETE, is blocked with a JiraReadOnlyRequestError before the network is touched. An invalid URL is blocked as well.",
              "Synchronization only reads Jira and writes snapshots into the application's own database. The application never creates or modifies Jira issues, comments, worklogs, links or fields.",
              "A metric is recorded for each call to Jira: the method, the route template, the status class of the response and the duration."
            ]
          },
          {
            "heading": "The public cloud demo",
            "points": [
              "The public cloud demo has no Jira access at all. Under PUBLIC_DEMO_MODE the Jira configuration is returned as disabled and with empty credentials, so the application makes no network request to Jira whatsoever.",
              "All Jira-like data in the demo is synthetic: the tickets, the history and the aggregates are produced by a fixture and live only in the demo database.",
              "The demo data is populated in English: the phases Design, Development, Testing and pilot, Go-live, plus English names for work items, milestones and owners.",
              "Populating a specific project with demo data is done by a dedicated administrative endpoint. Outside the demo runtime it answers 403, so the fixture cannot be run in a corporate installation.",
              "In the demo runtime requests are made on behalf of the built-in public-demo-user without signing in. Reading is open and writing is allowed outside the administration and user sections.",
              "A corporate installation works differently: there Jira is connected, but strictly read-only under the rules of the Jira is read-only section."
            ]
          },
          {
            "heading": "Project settings for Jira",
            "points": [
              "The project Jira integration stores baseUrl, boardUrl, projectKey, issuesJql and openIssuesJql.",
              "The Jira work page synchronizes only with production Jira; there is no dev/prod switch in the interface.",
              "For the Jira work sections the backend guarantees at least three sections with sortOrder 0..2.",
              "A section stores a direct JQL and a link to a Jira filter separately; if both fields are filled, the JQL is used.",
              "On sync all old JiraWorkSectionIssue links are deleted, after which new links to the current snapshots are created.",
              "The JiraIssueSnapshot upsert is done by projectId + issueKey, so a single ticket updates its snapshot instead of creating a duplicate."
            ]
          },
          {
            "heading": "Open issues",
            "points": [
              "Issues have a source of INTERNAL or JIRA, plus title, severity, status, owner, impact, decisionRequired, dueDate and Jira links.",
              "All statuses other than Done, Closed and Resolved are considered open.",
              "On creation the primary Jira key/url is merged with the jiraLinks array, and duplicates by jiraKey are removed.",
              "If the project has jiraIntegration.baseUrl configured, all Jira URLs must start with it.",
              "The first Jira link becomes the issue's jiraTicketKey/jiraTicketUrl. If the links are deleted, the source returns to INTERNAL."
            ]
          },
          {
            "heading": "Status history and closure",
            "points": [
              "An issue status update stores statusAt and text and is sorted by statusAt desc, then createdAt desc.",
              "On the first transition into a closed status the backend computes closedDelayDays as max(0, dueDate - initialDueDate) in calendar days.",
              "If there was no initialDueDate yet, it is captured on the first change of dueDate, from the old dueDate or from the new value.",
              "Open decisions are open issues with decisionRequired; they are used in the project overview."
            ]
          }
        ]
      },
      {
        "id": "wiki-raid",
        "title": "Risks, problems and assumptions",
        "summary": "The RAID register, filters, risk matrix, status history and portfolio impact.",
        "keywords": ["RAID", "risks", "problems", "assumptions", "riskScore", "matrix"],
        "sections": [
          {
            "heading": "Types and fields",
            "points": [
              "A RAID item has the type RISK, DEPENDENCY or ASSUMPTION. In the interface DEPENDENCY is called Problem.",
              "The main fields are title, description, owner, status, probability, impact, mitigationPlan, contingencyPlan, dueDate, residualRisk, validationDate, Jira key/url, decisionRequired, escalationLevel, scheduleImpactDays and budgetImpact.",
              "riskScore is calculated from probability and impact and is used in the high-risk filters and in the portfolio.",
              "The statuses CLOSED and VALIDATED are considered inactive."
            ]
          },
          {
            "heading": "Summary and filters",
            "points": [
              "The summary counts active RAID items, high risks with riskScore >= 15, problems, assumptions, decisions and the sum of scheduleImpactDays.",
              "The type filter can show everything, only RISK, only DEPENDENCY or only ASSUMPTION.",
              "Decision-only keeps the records with decisionRequired.",
              "Overdue-only keeps the records whose dueDate is earlier than today.",
              "High-only keeps the records with riskScore >= 15."
            ]
          },
          {
            "heading": "Matrix and closed records",
            "points": [
              "The risk matrix takes only active RISK items and places them in probability:impact cells, clamping the values to the range 1..5.",
              "The closed block shows only inactive RISK and DEPENDENCY items, sorted by validationDate or dueDate from newest to oldest.",
              "The RAID status history is stored as separate RaidItemStatusUpdate records and does not duplicate the record's current status.",
              "The portfolio takes only RISK/DEPENDENCY items with riskScore >= 15 and a status other than CLOSED/VALIDATED."
            ]
          }
        ]
      },
      {
        "id": "wiki-changes-budget-artifacts",
        "title": "Changes, budget and artifacts",
        "summary": "What is currently implemented in the change/budget area and how the artifact catalog works.",
        "keywords": ["changes", "budget", "artifacts", "change requests", "documents"],
        "sections": [
          {
            "heading": "Change management",
            "points": [
              "For now the section only displays data: three counters (change requests, open decisions, rows with a baseline variance), a search box and a table of the shifted work items with the size of the shift and the owner.",
              "Change requests cannot be created, approved or driven through the interface. The ChangeRequest model with the types SCOPE, BUDGET, SCHEDULE, RESOURCE and the statuses DRAFT, SUBMITTED, IN_REVIEW, APPROVED, REJECTED, IMPLEMENTED exists in the database, but there is no screen for working with it."
            ]
          },
          {
            "heading": "Budget",
            "points": [
              "The Budget management section is a placeholder: the page renders a heading, a description and an informational block; it has no plan-fact-forecast calculations or tables.",
              "The project budget values are stored in the budgetPlanned and budgetForecast fields and are entered when the project is created, not in this section."
            ]
          },
          {
            "heading": "Artifacts",
            "points": [
              "Artifacts use an editable table like Business requirements. A new table starts with four columns and one row; the first column contains a date picker instead of a row number.",
              "Edit the two-line column headings directly, or add columns. The date column can be renamed but cannot be deleted.",
              "Add row inserts a blank row directly below the header. Save persists dates, headings, text and attachment references for the project.",
              "HTTP and HTTPS URLs in cells appear as clickable links. Attach file uploads a file into a cell; click its filename to download it. Limits are 3 MB per file and 30 MB per project.",
              "Removing a saved attachment, row or column and saving removes its unreferenced files. Unsaved uploads expire after 24 hours and are cleaned up on subsequent uploads.",
              "If another user saves first, your edits remain on screen and a conflict message appears. Reload saved table asks before discarding your edits. Existing catalog entries remain visible until converted by saving the table."
            ]
          }
        ]
      },
      {
        "id": "wiki-resources",
        "title": "Resource management",
        "summary": "How load is calculated from the WBS, plus resource profiles, overloads, requests and recommendations.",
        "keywords": ["resources", "capacity", "load", "assignees", "8 weeks"],
        "sections": [
          {
            "heading": "Data source",
            "points": [
              "The resource model is built from the active projects of the portfolio. If there are no active projects, the WBS of the current project is used.",
              "Only WBS rows of the types TASK and DELIVERABLE with a status other than CANCELLED enter the calculation.",
              "An empty owner becomes Unassigned and goes into a separate unassigned row.",
              "DONE rows yield remainingHours = 0 but remain in the done/total counters."
            ]
          },
          {
            "heading": "Resource profiles",
            "points": [
              "A profile contains kind, role, baseHoursPerWeek, fte, projectAllocationPercent, currentProjectAllocationPercent, operationalAllocationPercent, executionFactorPercent and note.",
              "CVTE is automatically treated as a contractor team with fte = 5 and 100% project allocation.",
              "The surname Gladkov automatically receives the coordinator profile: 40% project allocation and 60% operational load.",
              "For everyone else the role is derived from owner/title by the words DevOps, QA, analytics, design, PMO, dev/front/back/API/developer.",
              "User overrides are normalized and take precedence over the automatic profile for that owner."
            ]
          },
          {
            "heading": "Hours and load",
            "points": [
              "plannedHours is computed only if effortPercent > 0.",
              "The duration for plannedHours is taken from workDays, then planWorkDays, then from the working days between start/due, otherwise 1.",
              "remainingHours = plannedHours * (100 - progress) / 100, except for overdue work, for which remainingHours becomes 0.",
              "Demand is distributed across eight weekly buckets starting from the current week, proportionally to the overlap of the task's working days with the week.",
              "capacityHoursPerWeek = baseHoursPerWeek * fte * projectAllocationPercent * currentProjectAllocationPercent.",
              "Utilization > 100% is bad, 86..100% is warn, <= 50% is low, and everything else is ok."
            ]
          },
          {
            "heading": "Conflicts and recommendations",
            "points": [
              "A critical conflict is created when a resource is overloaded, especially if the resource has a task on the critical path.",
              "A separate critical conflict is created for unassigned work with remainingHours > 0.",
              "Overdue work for a resource produces a warning.",
              "Resource requests are created for unassigned demand and for role overload, sorted by hours and limited to five requests.",
              "Recommendations first suggest resolving the critical conflict, then raising resource requests, or maintaining the plan if there are no conflicts."
            ]
          }
        ]
      }
    ]
  },
  {
    "id": "wiki-admin-platform",
    "title": "Administration and platform",
    "description": "Back office, integrations, API, audit, security and operations.",
    "articles": [
      {
        "id": "wiki-admin",
        "title": "Back office: users, roles, dictionaries and modules",
        "summary": "Which administrative settings exist and which guard rules protect the system.",
        "keywords": ["admin panel", "users", "roles", "dictionaries", "modules", "project access"],
        "sections": [
          {
            "heading": "Users",
            "points": [
              "The administrator creates users with email, name, role and isActive. This form does not set a password; available sign-in methods depend on the installation settings.",
              "The email is normalized to lower case; a duplicate returns 409.",
              "The last active ADMIN cannot be disabled or demoted."
            ]
          },
          {
            "heading": "Roles and permissions",
            "points": [
              "The managed system roles are ADMIN and EXECUTIVE_VIEWER, which in the interface are called \"System administrator\" and \"User\".",
              "ADMIN receives all permissions and its rights cannot be disabled.",
              "A User sees the projects of all business units and can create projects. Edit rights are determined by access to the specific project.",
              "The administrator of the selected BU sees the Administration section, but only the Project registry and Access tabs. System settings, users, roles, dictionaries and the BU registry are not available to them.",
              "A BU administrator can grant and revoke only EDIT access for regular users and only for projects of the selected BU. They cannot grant, change or remove the ADMIN level.",
              "There are legacy fallback permissions: for example, wbs.update can be satisfied by the old wbs.write."
            ]
          },
          {
            "heading": "Attendance",
            "points": [
              "The Attendance page is available only to the system administrator and shows views for the last 7 days.",
              "System administrators are not counted. BU administrators are counted as regular authenticated visitors.",
              "The chart separates the views of authenticated users from those of guests who are not logged in; below it a visitor list and a visitor - project - page aggregation are available.",
              "Guests are distinguished by a server-side hash of a stable browser identifier. IP addresses, emails and full page URLs are not stored in the analytics.",
              "Visit events are deleted automatically once the configured retention period expires, by default after 30 days."
            ]
          },
          {
            "heading": "Project access",
            "points": [
              "Viewing all projects is already open to every user, so individual access grants regulate the ability to change a project, not its visibility.",
              "Access to projects is granted at the VIEW, EDIT and ADMIN levels.",
              "Grant supports a batch of users and a batch of projects and performs an upsert by projectId/userId.",
              "Access is not granted to inactive or missing users.",
              "The access list is sorted by project.code, then level desc, then user name.",
              "All grant/update/delete actions are written to the audit log."
            ]
          },
          {
            "heading": "Business units and moving projects",
            "points": [
              "The Business units registry is a separate administration tab and is available only to the system administrator.",
              "In the Project registry the system administrator can move a project to another BU. All child projects, including closed ones, are moved with it.",
              "During the move the root project is detached from its previous parent, and the individual access grants for all moved projects are deleted. A confirmation is shown before the operation.",
              "A BU administrator sees a project's BU in the Project registry but cannot perform the move."
            ]
          },
          {
            "heading": "Dictionaries, RAG, workflow and templates",
            "points": [
              "Dictionaries are seeded with the default project_status, project_type, risk_type, wbs_type, wbs_status, issue_severity, raid_type and raid_status.",
              "Deleting a dictionary in the UI actually deactivates the record with isActive=false rather than deleting it physically.",
              "The RAG formulas are stored in the system settings rag.formula.green/amber/red as textual rules for the management layer.",
              "The workflow settings workflow.overview, workflow.baseline and workflow.projectClose store textual approval chains.",
              "The WBS templates live in the system setting wbs.templates as JSON and describe the starting sets of phases/work."
            ]
          },
          {
            "heading": "Module management",
            "points": [
              "The list of project modules is stored in the system setting project.modules.",
              "normalizeProjectModules always returns the full list of default modules and takes only enabled from the setting, by known key.",
              "If a module is disabled, it disappears from the project section row.",
              "If all modules are disabled, the firstEnabledProjectView fallback is project-overview."
            ]
          }
        ]
      },
      {
        "id": "wiki-integrations-api",
        "title": "Integrations, API tokens, webhooks and OpenAPI",
        "summary": "How external integrations, tokens, webhook delivery and API documentation are arranged.",
        "keywords": ["integrations", "API token", "webhook", "OpenAPI", "GitLab", "GitHub", "BI"],
        "sections": [
          {
            "heading": "Integration settings",
            "points": [
              "The admin panel stores the settings for GitLab, GitHub, Azure DevOps and the BI export URL.",
              "Secret settings are returned from the API with an empty value and a hasValue flag, so that the stored token is not disclosed.",
              "When a secret setting is updated, an empty value keeps the old value if one was already there.",
              "Jira credentials are intentionally not part of these settings and are read only from the env of the backend container."
            ]
          },
          {
            "heading": "API tokens",
            "points": [
              "A new token has the format pms_ + random base64url and is shown only in the creation response.",
              "The database stores a SHA-256 hash and the tokenPrefix, not the original token.",
              "Token scopes can be *, namespace.* or a specific permission.",
              "A token can have expiresAt, isActive and rateLimitPerMinute.",
              "When a token is used, lastUsedAt is updated."
            ]
          },
          {
            "heading": "Webhooks",
            "points": [
              "An endpoint stores name, url, an optional secret, a list of events and isActive.",
              "events can contain * or a specific eventType.",
              "The delivery is created in the database before sending and goes out asynchronously via setTimeout.",
              "If a secret is set, the payload is signed with the header X-PMS-Signature: sha256=<hmac>.",
              "Attempts, timeout and backoff are controlled by WEBHOOK_TIMEOUT_MS, WEBHOOK_MAX_ATTEMPTS and WEBHOOK_RETRY_BASE_MS.",
              "The delivery result stores status, statusCode, responseBody/error and attemptedAt."
            ]
          },
          {
            "heading": "REST API and OpenAPI",
            "points": [
              "The OpenAPI spec is published by the backend application and is covered by an integration test that checks it against the concrete Express routes.",
              "Mutating endpoints must have security responses and must pass the permission/project guards.",
              "The API covers projects, WBS, WBS dependencies, baseline, calendars, business requirements, Jira sync, issues, RAID, artifacts, saved views, search and the admin back office.",
              "All application APIs, including read-only views and global search, require authentication."
            ]
          }
        ]
      },
      {
        "id": "wiki-security-ops",
        "title": "Authentication, audit and operations",
        "summary": "Sessions, Keycloak/OIDC, the audit trail, health, backup/restore and the deployment pipeline.",
        "keywords": ["auth", "keycloak", "OIDC", "audit", "health", "backup", "restore", "deploy", "prisma"],
        "sections": [
          {
            "heading": "Application session",
            "points": [
              "The session is stored in UserSession as a SHA-256 hash of the cookie token.",
              "The cookie is HttpOnly, SameSite=Lax, with Max-Age from AUTH_SESSION_DAYS. Secure is enabled in production unless AUTH_COOKIE_SECURE is false.",
              "If a session has expired, it is deleted. If the user is disabled, the session is not attached to the request.",
              "Without an active session the interface and all application APIs are unavailable.",
              "The public cloud demo is the exception: under PUBLIC_DEMO_MODE a request without a session is executed on behalf of the built-in demo user. In a corporate installation that mode is off."
            ]
          },
          {
            "heading": "Keycloak/OIDC",
            "points": [
              "The frontend supports the Keycloak login flow, while the backend works with the resulting application user session.",
              "Alongside configured Keycloak authentication, local email and password sign-in is supported. Passwords are only ever stored as individually salted scrypt hashes; there is no environment-variable bootstrap path.",
              "OIDC does not pass the user's password to the application, so Jira cannot be accessed with the user's own login and password.",
              "Access to Jira is implemented through a service account via JIRA_EMAIL/JIRA_API_TOKEN in the container env."
            ]
          },
          {
            "heading": "Audit trail",
            "points": [
              "AuditEvent records actorId/email/name, action, objectType, objectId, projectId, ipAddress, userAgent, beforeValue, afterValue and metadata.",
              "Failures to write the audit record do not break the main request, but are logged to console.error.",
              "The audit covers project create/update/delete/close, target date, ui state, business requirements, users, roles, dictionaries, config import, project access, saved views, api tokens and webhooks.",
              "The admin log returns the most recent events with a limit of up to 200."
            ]
          },
          {
            "heading": "Health and backup",
            "points": [
              "System health runs SELECT 1 and shows the database status, databaseLatencyMs, uptimeSeconds, startedAt and NODE_ENV.",
              "Backup status reads BACKUP_DIR or ./backups, looks for .dump files, sorts them by updatedAt and tries to read the .sha256 file next to the latest backup.",
              "Retention is taken from BACKUP_RETENTION_DAYS, by default 14.",
              "The admin config export/import transfers rolePermissions, dictionaryItems, systemSettings and projectModules, but secret settings are exported without their value."
            ]
          },
          {
            "heading": "Deployment and CI",
            "points": [
              "Prisma migrations are applied by the startup scripts before the API is launched.",
              "There are operational scripts for backup, restore, restore drill, migration dry-run, security smoke and performance smoke.",
              "CI checks the shared build, Prisma generate, integration tests, OpenAPI coverage, migration safety, the Docker/Kubernetes/operations scripts and the corporate runner restrictions.",
              "The migration safety test forbids dangerous operations such as DELETE FROM without an explicit allow list.",
              "The SCA job checks the Node.js dependencies, which is why the vulnerable xlsx dependency was removed together with the XLSX WBS import."
            ]
          }
        ]
      }
    ]
  }
];
