import type { WikiGroup } from "../app/wikiContent";
import { englishOperationsWikiGroup } from "./wiki.en.operations";
import { englishPlatformWikiGroup } from "./wiki.en.platform";

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
              "The top header holds the sections Portfolio, Projects, Operations, Administration, Development and FAQ. Operations, Administration and Development are shown only to users who have access to them.",
              "Reports and Archive moved to tabs of the Development section. The old addresses /reports, /closed-projects and /closed still open these pages.",
              "Once a project is selected, a separate row appears below the header: the project picker on the left, then Registry, the sections of the enabled modules and the Create button.",
              "The order of the project sections is: Overview, Schedule, Gantt, Current Work, WBS, Jira Work, Charter, Requirements, Issues, Risks, Artifacts, Calendars. A disabled module removes its sections from the row: Schedule goes with the Project status module, Current Work with the WBS module.",
              "Administration is available to the system administrator and to the administrator of the selected BU. A BU administrator sees only the Project registry and Access tabs.",
              "The Development section is available only to the system administrator. The Development button opens the Resource management tab.",
              "In the public demo (a cloud installation with PUBLIC_DEMO_MODE) a visitor can open Administration and Development read-only and can change every other section, Operations included; closed projects stay read-only for the visitor too.",
              "The interface language switch RU/EN sits on the right-hand side of the header. The choice is stored in the browser and takes precedence over the default language.",
              "The default language comes from the build-time variable VITE_DEFAULT_LOCALE. If it is not set, sberdevices.ru hosts default to Russian and every other host defaults to English.",
              "On the FAQ page there is a horizontal table of contents with anchors above the articles, and the search box filters articles by title, keywords and body text.",
              "The product icon on the left of the header opens the Gantry page on GitHub in a new window.",
              "The Operations section holds the Leave schedule and Workload tabs. It is open to every signed-in user; without signing in the app asks the user to sign in.",
              "The Development section holds the Reports, Archive, Portfolio v2, Jira and WBS reconciliation, PM workspace, Issues, Decision queue, Resource management and Resource settings tabs.",
              "Changes and Budget are not shown in the row of project sections; those pages open only at the direct addresses /<project code>/changes and /<project code>/budget."
            ]
          },
          {
            "heading": "Page title and section title",
            "points": [
              "The page header renders a single H1. On any project section except the Create project page, that H1 is the name of the selected project, not the name of the section.",
              "The section name reaches the H1 only on non-project pages: Portfolio, Projects and FAQ; in Administration and Development it is the name of the open tab, such as Project registry or Closed projects. The PM workspace in Development shows the name of the selected project.",
              "Next to the project name a compact project strip is shown: status, project manager, target date, RAG or delay, and the forecast for the active goal. Non-project pages have no strip.",
              "On the Reports, Leave schedule and Workload pages the header with the title is not rendered: the section tab names them.",
              "The section name is additionally shown as an H2 inside the workspace: WBS and Gantt, for example, render their own heading and a short description above the toolbar."
            ]
          },
          {
            "heading": "Permissions and read-only mode",
            "points": [
              "Writing requires authentication. For project data the backend additionally checks access to the specific project.",
              "ADMIN can change any project. A BU administrator gets the ADMIN level on every project of the BU. Other users must have ProjectAccess EDIT or ADMIN. In the public demo a visitor can change any project that is not closed.",
              "If a project is closed, the project pages switch to read-only and the backend returns a write block.",
              "For entity routes the backend itself resolves the projectId from the id of a WBS row, dependency, artifact, RAID item, change request, open issue, task, milestone or overview, and applies the project permissions.",
              "The public demo can be turned on only on a cloud installation (DEPLOYMENT_PROFILE=cloud) with PUBLIC_DEMO_MODE=true. Without signing in the visitor works as the built-in Public demo account; on a corporate installation this mode is off."
            ]
          },
          {
            "heading": "Global search",
            "points": [
              "Search starts from two characters and searches across projects, WBS, open issues, decisions, RAID, artifacts and the executive overview.",
              "For WBS the indexed fields are code, title, owner, Jira key, Jira URL and description.",
              "For RAID the indexed fields are title, description, owner, mitigation, contingency and the Jira fields.",
              "Results are sorted by updatedAt and lead to the corresponding project section.",
              "The search field in the header is folded to a magnifier. It opens on hover, on click, when reached with Tab, or with Ctrl K (Cmd K).",
              "It folds back by itself after 10 seconds without use unless the mouse pointer is over it, and at once when the user goes to another page.",
              "Results are shown only while the field has focus. The arrows pick a result, Enter opens it, Escape closes the list.",
              "The request goes 250 ms after typing stops; the answer is limited to 12 results and to the projects the user may read."
            ]
          },
          {
            "heading": "Saved views",
            "points": [
              "The buttons to pick and save views are currently hidden: the /api/saved-views API and the settings format remain, but neither WBS, Gantt nor RAID shows them. What a view stores is described below.",
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
              "Active projects are all projects whose status is not CLOSED. Closed projects are left out of the Registry and the project picker and are collected on the Development -> Archive tab, available to the system administrator.",
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
              "Delay is calculated as the calendar difference between baselineDueDate and the current goal date.",
              "The Projects to show filter picks the projects on the Portfolio page; it applies to the goal timeline, blocking problems and key risks."
            ]
          },
          {
            "heading": "Roadmap v2",
            "points": [
              "Roadmap v2 opens on the Development -> Portfolio v2 tab and shows the HW, SW and G2M work packages of active projects on a shared calendar scale.",
              "The map offers project search, a portfolio filter, horizons of 6, 12 and 24 months, a jump to the current date and a full-screen mode.",
              "Old /portfolio-v2 links open the Portfolio v2 tab in the Development section. A user without access to Development sees a message that the section is for the administrator only."
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
              "Closing does not delete data: the project moves to the Development -> Archive tab (the Closed projects page) and becomes read-only."
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
              "All generate/status/publish actions are written to the audit log as overview.generate, overview.status and overview.publish.",
              "The Report for management button above the Status cards opens a panel: pick a period of 7, 14 or 30 days and press Prepare the report. The model writes a status (green, amber, red), a summary and the sections Done, Slipped, Risks and problems, Decisions needed and Next.",
              "The report is built only from the project's facts: work closed in the period, overdue work, checkpoints for the next 30 days and those moved against the baseline, open issues needing a decision and critical issues, risks and problems scored 15 and above. These facts go to the model's provider; nothing is saved in the project and the audit log keeps counters only.",
              "The report text can be edited in the panel, copied or downloaded as a .md file. The button is shown only when a model is connected and AI calls are allowed for the user; a corporate installation has no such button until GigaChat is connected."
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
              "Work items that are In progress, In review and At risk are shown regardless of their due date. In the All mode, Failed work and any work due before today are shown too.",
              "Not started work is shown if its due date falls between the next upcoming Monday and the date 10 working days after it.",
              "Work with the statuses Done and Cancelled does not appear in Current Work.",
              "Above the table there is a switch: All, Active, Blocked and Overdue. Active is work In progress, In review, At risk and not-started work in the window of the coming days, without Failed. Blocked is Failed only. Overdue is work due before today.",
              "The search above the table filters by number, name, owner and work package."
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
              "The toolbar also always has the Columns menu, the hierarchy level switch 1..5 and a state indicator: the number of unsaved rows, the saving state or the time of the last save.",
              "The full-screen tip appears once the page is scrolled more than 180 pixels and full screen is off; it has a button that switches to it.",
              "The Draft with AI button in the Structure header opens a panel: describe the project (at least 20 characters) and the model suggests phases, work packages, tasks, milestones, durations in working days and finish-to-start links. Nothing is created in the project until the draft is added.",
              "In the draft you can fix names and remove a row with everything under it. Invalid and circular links are dropped and the panel shows how many; a row has at most 6 predecessors, the depth is at most 4 levels and the draft at most 150 rows.",
              "Add to the structure creates the rows in one operation after the existing ones: codes continue after the last top row, existing rows are not renumbered, and the schedule is recalculated from the chosen start date. A second click does not create duplicates. Remove the added rows deletes only the rows that were added.",
              "The button is shown only when a model is connected and the user may change the project; it is disabled while the Structure has unsaved edits. The project description goes to the model's provider; adding the draft does not call the model."
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
              "Enter saves the cell being edited; Escape rolls the draft back to the current state of the row.",
              "Text and number cells of the WBS keep typing locally and hand it to the row draft when the user leaves the cell, presses Enter or pastes, so typing does not redraw the whole table and Escape discards what was typed. If text is still pending in a cell when the user goes to another page, the app asks for confirmation.",
              "In the Owner column the browser suggests the names of active people from the Leave schedule directory with their department; any other name can be typed too. The directory refreshes when the user comes back to the browser window.",
              "The type of a phase linked to an open issue cannot be changed: the backend answers 409. A level or order change that would break the link between a work package and an open issue is refused too."
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
              "Next to a predecessor code the WBS has a switch for how the date is counted: from the predecessor's finish (FS, the default) or from its start (SS). The row's leadLagDays counts only when there is a single predecessor; with several, each pair takes the lag of its link, or 0 without one.",
              "FF and SF links are made on the Gantt chart by dragging from the end or start of a bar to the end of another bar. The WBS does not tell them apart and shows such a link as FS, but the link itself stays FF or SF until it is changed on the Gantt chart.",
              "The same predecessor cannot be specified twice, a row cannot be its own predecessor, and the backend forbids dependency cycles.",
              "A single successor can have at most six unique predecessors.",
              "If a link is created between the same pair with a different type, the old link of the other type is deleted and the new one remains.",
              "The schedule takes predecessors from the predecessor1..6 fields: the link type and lag come from the WbsDependency of that pair, otherwise FS and the row's leadLagDays (only when there is a single predecessor). Links without fields are used only when the row's fields give no existing predecessor.",
              "The critical path merges explicit WbsDependency records with the predecessor fields; pairs without a WbsDependency get temporary FS links.",
              "If after a WBS save a typed start or finish came back because links set it, a warning appears. It stays 12 seconds, names the link with the predecessor's code and name, and explains that the link or its lag has to change on the Gantt chart or the predecessor has to move. Shifts caused by weekends and calendars are not reported.",
              "The WBS row PATCH accepts an optional expectedUpdatedAt: if the row was saved after that moment, the backend answers 409 and leaves the row as it is. The Workload page uses this check; the WBS table does not send it."
            ]
          },
          {
            "heading": "Date calculation",
            "points": [
              "The schedule is recalculated after creation, modification, deletion, reorder, renumber, dependency change, baseline copy and calendar changes.",
              "The topological order is built from the dependencies; if there is a cycle, the remaining rows are appended in plan order.",
              "FS sets the start to the next working day after the predecessor's finish plus the lag; SS sets it to the predecessor's start plus the lag.",
              "FF and SF set the finish: it goes to the predecessor's finish (FF) or start (SF) plus the lag, and a finish typed by hand is replaced by the link's date. With several links, the latest date wins.",
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
              "ProjectCalendarOverride redefines a specific day for the RU or CN calendar as working or non-working. In the RU+CN calendar a day is working only if it is working in both RU and CN.",
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
              "The Gantt saved-view format (its buttons are currently hidden) stores the week/month/quarter zoom level, the 30/90/180-day window or All, the hierarchy level, the visibility of dependencies, critical path, baseline and forecast, the width of the WBS column and the panel sizes."
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
              "The RU, CN or RU+CN calendar is chosen on each WBS row, so two adjacent tasks can count working days using different calendars. In RU+CN a day is working only if it is working in both calendars."
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
              "The demo turns on only with DEPLOYMENT_PROFILE=cloud and PUBLIC_DEMO_MODE=true. Requests without signing in come from the built-in public-demo-user: reading is open, Administration and Development are view-only, and every other section can be changed.",
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
              "The JiraIssueSnapshot upsert is done by projectId + issueKey, so a single ticket updates its snapshot instead of creating a duplicate.",
              "Snapshots of Jira issues the synchronization no longer finds are not deleted but marked as retired (retiredAt)."
            ]
          },
          {
            "heading": "Open issues",
            "points": [
              "An issue stores a source of INTERNAL or JIRA, a section (category), title, severity, readiness GREEN/AMBER/RED, status (Open, In Progress, Blocked, Resolved, Closed), owner, impact, decisionRequired, dueDate, a reference link, a linked risk, a WBS phase and Jira links.",
              "All statuses other than Done, Closed and Resolved are considered open.",
              "Jira links are given as issue keys. On creation the primary key is merged with jiraLinks, keys are normalised and duplicates removed; an invalid key is refused with a 400 error.",
              "The Jira link is built automatically as {baseUrl}/browse/{KEY}: baseUrl comes from the project's Jira settings or, if that is empty, from JIRA_BASE_URL. If the address cannot be built, the issue is not saved.",
              "The first Jira link becomes the issue's jiraTicketKey/jiraTicketUrl. If the links are deleted, the source returns to INTERNAL.",
              "If an issue has a WBS phase, a work package (WORK_PACKAGE) is created in it: it goes before the phase's last milestone or goal, or to the end of the phase if there is none.",
              "The work package's name, owner and due date repeat the issue and follow its changes; when the phase changes, the package moves to the new phase. Once the package exists, the phase cannot be cleared.",
              "Only the system administrator can choose a phase, and the user needs the right to change the project's WBS.",
              "While the issue is open, the WBS cannot change the name, owner, due date, type, level or parent of its work package: the server answers 409 and points to the issue register. On the Workload page such a package opens read-only.",
              "An open issue can be turned into a problem: a DEPENDENCY is created with probability 5 and an impact from the severity (CRITICAL 5, HIGH 4, MEDIUM 3, otherwise 2), and the issue becomes Resolved. A closed issue cannot be turned into a problem.",
              "The From meeting notes button in the issue register header opens a panel: paste the meeting text and the system prepares draft tasks, open issues and risks. Records are created only after review: tick the drafts you need and press Create reviewed records.",
              "With an AI provider configured (AI_PROVIDER), a model prepares the drafts: each has a quoted source, a description, probability and impact for a risk, and a decision flag for an issue. A draft is marked when its quote is not in the text or its owner is not in the directory. The notes go to the model's provider; the audit log keeps counters only.",
              "Calling the model needs a user session with the right to change the project; API tokens and the public demo (unless AI_ALLOW_PUBLIC_DEMO allows it) are refused. Call and token budgets are kept in the database. Without AI only labelled lines such as \"Risk: ...\" are parsed, which the Parse lines without AI button also does."
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
        "summary": "The RAID register, filters, risk and problem matrix, status history and portfolio impact.",
        "keywords": ["RAID", "risks", "problems", "assumptions", "riskScore", "matrix"],
        "sections": [
          {
            "heading": "Types and fields",
            "points": [
              "A RAID item has the type RISK, DEPENDENCY or ASSUMPTION. In the interface DEPENDENCY is called Problem.",
              "The main fields are title, description, owner, status, probability, impact, mitigationPlan, contingencyPlan, dueDate, residualRisk, validationDate, Jira key/url, decisionRequired, escalationLevel, scheduleImpactDays and budgetImpact.",
              "riskScore = probability × impact; it is used in the high-risk filter and in the portfolio.",
              "The statuses CLOSED and VALIDATED are considered inactive."
            ]
          },
          {
            "heading": "Summary and filters",
            "points": [
              "The summary counts active items, high risks (RISK only, riskScore >= 15), problems and assumptions, items with decisionRequired (closed ones included) and the sum of scheduleImpactDays of active items.",
              "The type filter can show everything, only RISK, only DEPENDENCY or only ASSUMPTION.",
              "Decision-only keeps the records with decisionRequired.",
              "Overdue-only keeps the records whose dueDate is earlier than today.",
              "High-only keeps the records with riskScore >= 15.",
              "The register and filters show active items only; closed RISK and DEPENDENCY items are listed in a separate block."
            ]
          },
          {
            "heading": "Matrix and closed records",
            "points": [
              "The risk and problem matrix takes active RISK and DEPENDENCY (problem) items and places them in probability:impact cells, clamping the values to the range 1..5; risks and problems are counted apart, problems with their own mark.",
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
              "DONE rows yield remainingHours = 0 but remain in the done/total counters.",
              "Resource management and Resource settings live in the Development section (/development/resources) and are available only to the system administrator."
            ]
          },
          {
            "heading": "Resource profiles",
            "points": [
              "A profile contains kind, role, baseHoursPerWeek, fte, projectAllocationPercent, currentProjectAllocationPercent, operationalAllocationPercent, executionFactorPercent and note.",
              "CVTE is automatically treated as a contractor team with fte = 5 and 100% project allocation.",
              "The surname Gladkov automatically receives the coordinator profile: 40% project allocation and 60% operational load.",
              "For everyone else the role is derived from owner/title by the words DevOps, QA, analytics, design, PMO, dev/front/back/API/developer.",
              "User overrides are normalized and take precedence over the automatic profile for that owner.",
              "Changes in Resource settings live only in the open browser tab and are reset when the page reloads."
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
              "Resource requests are created for unassigned demand and for each overloaded person (with their role), sorted by hours and limited to five requests.",
              "Recommendations first suggest resolving the critical conflict, then raising resource requests, or maintaining the plan if there are no conflicts."
            ]
          }
        ]
      }
    ]
  },
  englishOperationsWikiGroup,
  englishPlatformWikiGroup,
];
