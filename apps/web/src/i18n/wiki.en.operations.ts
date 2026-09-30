import type { WikiGroup } from "../app/wikiContent";

export const englishOperationsWikiGroup: WikiGroup = {
  id: "wiki-operations",
  title: "Operations",
  description: "The leave schedule and the workload of owners across all open projects.",
  articles: [
    {
      id: "wiki-leave-schedule",
      title: "Leave schedule",
      summary:
        "The people directory, leave types, leaves on a day grid, the production calendar and a list with export.",
      keywords: ["leave", "absences", "leave schedule", "production calendar", "people", "CSV", "operations"],
      sections: [
        {
          heading: "Where it is and who works with it",
          points: [
            "The Operations section in the top header holds the Leave schedule and Workload tabs. It is visible to every signed-in user, the public demo included.",
            "Any signed-in user can view and change the schedule; no special role or project access is needed.",
            "An API token can read the schedule, but every change made with a token is refused with a 403 error: the schedule changes only from a user session.",
            "Every change to people, types, leaves and calendar days is written to the audit log.",
          ],
        },
        {
          heading: "People",
          points: [
            "The People button opens the directory: name, department and whether the person is active.",
            "The field that links a person to a user account is shown in the directory to the system administrator and in the public demo. A user can be linked to one person only, and a switched-off user cannot be linked.",
            "A person without leaves is deleted. A person with leaves is archived and keeps the history; the Restore button brings them back.",
            "An archived person cannot get a new leave.",
            "The directory suggests names in the owner field of the WBS and in the work panel of the Workload page.",
          ],
        },
        {
          heading: "Leave types",
          points: [
            "The initial types are Vacation, Sick leave, Time off and Family leave.",
            "A type has a Russian and an English name and a colour. A type is not deleted but switched off; a switched-off type cannot be chosen for a new leave.",
          ],
        },
        {
          heading: "Adding and changing",
          points: [
            "Select days in a person's row with the mouse to open the new-leave form with those dates. The Add leave button opens an empty form.",
            "The People, Leave types and Add leave buttons sit on the right of the row with Today, the scales and Full screen.",
            "The form sets the person, type, dates and comment; the length is shown in working and calendar days.",
            "Click a leave to change or delete it. Deleting asks for confirmation.",
            "Leaves of one person cannot overlap by a single day: the form warns about an overlap and the server refuses it with a 409 error.",
            "The server checks dates: a date that does not exist and a finish before the start are refused.",
          ],
        },
        {
          heading: "Dragging and undo",
          points: [
            "Drag a leave to move it by whole calendar days. Drag an edge to make it longer or shorter; an edge never passes the other one.",
            "A leave cannot be dragged to another person. Short bars have no edges to drag and can only be moved or opened.",
            "Esc cancels a drag. A press without moving opens the leave.",
            "The new dates are saved at once. The Undo button in the message puts the old dates back.",
            "A drag and an undo send the version of the record (expectedUpdatedAt). If someone else has changed the leave meanwhile, the server answers 409, the change is not applied and the data is reloaded.",
            "The overlap check and the write run under a per-person lock, so simultaneous requests cannot create overlapping leaves.",
          ],
        },
        {
          heading: "Timeline and filters",
          points: [
            "The 3, 6 or 12 month scale sets how much time fits on screen; at 12 months the columns are weeks. The choice is kept in the browser.",
            "The timeline scrolls freely and loads another period near the edge. At most five years are kept loaded; the far end is dropped.",
            "The Today button brings the timeline back to the current day.",
            "The Planned column counts the working days of leaves in the visible part of the timeline. It, the name and the department can be sorted.",
            "Filters: search by name, departments, Absent today, By department and Show archived.",
            "The Full screen button keeps the timeline and the controls and hides the page description line. Scrolling down shows a one-time tip to expand the page; Esc returns to normal mode.",
          ],
        },
        {
          heading: "List and production calendar",
          points: [
            "The List tab shows the leaves of the period visible on the timeline with the people filters applied; a type can be picked and the columns sorted as well.",
            "Rows in the list can be selected and deleted together after confirmation.",
            "The CSV export writes the person, department, type, dates, working and calendar days and comment; the separator is a semicolon and the file opens in Excel with Cyrillic intact.",
            "The Production calendar tab shows a year: by default Monday to Friday are working days, and holidays and working weekends are stored as exceptions.",
            "2026 is filled in by the Russian Labour Code and Government Decree No. 1466; later years are entered by hand. Click a day to make it working or non-working, add a description or reset it.",
            "This calendar is used for working days in the Leave schedule and on the Workload page. It is not linked to the RU/CN calendars of the WBS.",
          ],
        },
      ],
    },
    {
      id: "wiki-workload",
      title: "Workload",
      summary: "Every owner of work in open projects on one timeline: overlaps, leaves and planning by dragging.",
      keywords: ["workload", "owners", "overlaps", "planning", "team planner", "operations"],
      sections: [
        {
          heading: "What the Workload shows",
          points: [
            "The Workload shows the work of all open projects of the selected business unit; CLOSED projects are left out.",
            "Work means WBS rows of the Task, Work package and Deliverable types without child rows, with an owner, start and finish dates and a status other than Cancelled. Phases, goals and milestones are not shown.",
            "Finished work stays on the timeline but makes no overlaps and is not planned.",
            "Any signed-in user can view the Workload.",
          ],
        },
        {
          heading: "Rows and the directory",
          points: [
            "One row is one owner. The name in the Owner field is matched to the Leave schedule directory ignoring case, extra spaces, ё/е and Unicode forms.",
            "If exactly one active person in the directory has that name, the row takes their department and shows their leaves hatched.",
            "If several people match, the row carries a warning and shows no leaves. An owner outside the directory goes to the Not in the directory group when grouping.",
            "The Everyone in the directory check box adds rows for active people without work, so work can be handed to them.",
            "Overlapping work of one person is laid out on separate lanes so bars do not cover each other.",
            "The My work page (Development section) shows your unfinished work across all readable open projects: overdue work and work running or starting within four weeks. You are the person of the leave schedule linked to your account; a row's owner is compared by name ignoring case, spaces and \"ё/е\". Without a link the page suggests asking an administrator to link the account on the leave schedule.",
            "Once a week each piece of work can get a confidence (on track, at risk, off track) and a note on what got done and what is in the way. There is one check-in per piece of work and week (weeks start on Monday); checking in again updates it, and only one's own work can be checked in. The Team check-ins tab shows the chosen project's check-ins of a week and who has unfinished work but no check-in.",
          ],
        },
        {
          heading: "Overlaps, colours and filters",
          points: [
            "An overlap is the days on which a person has two or more unfinished pieces of work. They are marked with a red strip on top.",
            "The Work and Overlap columns are separated by a line, and the numbers line up under their headers. Work counts work in the visible part of the timeline, Overlap the working days of overlaps in it. They and the name can be sorted.",
            "The bar colour is the project. Colours follow the list of projects sorted by code, so filtering does not repaint projects.",
            "Filters: search by owner, project choice, Only with overlaps, By department and Everyone in the directory.",
            "The 1, 3, 6 or 12 month scale is kept in the browser; the timeline scrolls freely and Today returns to the current day. Full screen works as on the Leave schedule.",
          ],
        },
        {
          heading: "Planning by dragging",
          points: [
            "Work can be changed in projects with EDIT or ADMIN access; the system administrator can change all of them. In other projects the work is view-only.",
            "Drag a bar to move its dates: the start lands on a working day and the number of working days is kept.",
            "Drag a bar onto another person's row to hand the work over: the owner changes in the WBS.",
            "Drag an edge to change the start or the finish. An edge lands on a working day and never passes the other one.",
            "Esc cancels a drag; a press without moving opens the work panel.",
          ],
        },
        {
          heading: "What does not move",
          points: [
            "Dates that WBS links set do not move: finish-to-start and start-to-start links hold the start, finish-to-finish and start-to-finish links hold the finish.",
            "If a link holds at least one date, the bar cannot be moved as a whole, but it can be handed to another person and its free edge changed. A held edge shows a not-allowed cursor and a title naming the link on hover.",
            "When the user tries to move such work, the Workload names the link: its type, the predecessor's code and name and the lag, and suggests changing the link on the Gantt chart or moving the predecessor.",
            "Work is view-only if the user has no rights on the project, if an open issue manages the work package (change it in the issue register) or if the work is done.",
          ],
        },
        {
          heading: "Work panel, saving and undo",
          points: [
            "Click a bar to open a panel with the project, status, owner and dates. Dates held by links cannot be edited.",
            "The Open in the structure link opens the project's WBS page with the work highlighted.",
            "A change is saved to the project's WBS at once, then the Workload reloads its data: links may have moved other work too.",
            "The Undo button in the message puts back the previous owner and dates.",
            "The change carries the row version (expectedUpdatedAt). If someone else has changed the row meanwhile, the server answers 409 and the change is not applied.",
            "The Even out the load button in the Workload toolbar opens a panel: pick 30, 60 or 90 days and press Suggest changes. The model suggests who should take which work and to which dates to move it, to remove overlaps and work that falls on leave.",
            "The model sees the work of the period in all projects you may read; only unfinished work in projects you may change and not managed by an open issue may be changed. A new owner comes only from the people directory and dates only from within the period; a date set by links cannot be changed. The rest is dropped and the panel shows how much.",
            "Only the ticked suggestions are applied, one by one, with the same edit as dragging, including the version check: work changed by someone meanwhile is not overwritten and the refusal is shown on its row. Undo applied puts the applied changes back in reverse order. Names, work titles, dates and leaves go to the model's provider; the button is shown only when a model is connected and you have work you may change.",
          ],
        },
      ],
    },
  ],
};
