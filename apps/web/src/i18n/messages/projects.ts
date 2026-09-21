import { projectsIssuesMessages } from "./projectsIssues";
import { projectsRaidMessages } from "./projectsRaid";

export const projectsCoreMessages = {
  "ui.projects.loadingPage": {
    "en": "Loading page",
    "ru": "Загрузка страницы"
  },
  "ui.projects.decisionQueue": {
    "en": "Decision queue",
    "ru": "Очередь решений"
  },
  "ui.projects.decisionQueueDescription": {
    "en": "Issues that require a management decision",
    "ru": "Вопросы, по которым требуется управленческое решение"
  },
  "ui.projects.notAssignedLowercase": {
    "en": "not assigned",
    "ru": "не назначен"
  },
  "ui.projects.noIssuesForFilter": {
    "en": "There are no issues matching the selected filter.",
    "ru": "Вопросов по выбранному фильтру нет."
  },
  "ui.projects.createOpenIssue": {
    "en": "Create open issue",
    "ru": "Создать открытый вопрос"
  },
  "ui.projects.closePanel": {
    "en": "Close panel",
    "ru": "Закрыть панель"
  },
  "ui.projects.section": {
    "en": "Section",
    "ru": "Раздел"
  },
  "ui.projects.phase": {
    "en": "Phase",
    "ru": "Фаза"
  },
  "ui.projects.noPhase": {
    "en": "No phase",
    "ru": "Без фазы"
  },
  "ui.projects.phaseSelectionHint": {
    "en": "Selecting a phase creates a work package before its last goal or milestone.",
    "ru": "Выбор фазы создаёт пакет работ перед её последней целью или вехой."
  },
  "ui.projects.criticality": {
    "en": "Severity",
    "ru": "Критичность"
  },
  "ui.projects.readiness": {
    "en": "Readiness",
    "ru": "Готовность"
  },
  "ui.projects.red": {
    "en": "Red",
    "ru": "Красная"
  },
  "ui.projects.yellow": {
    "en": "Yellow",
    "ru": "Жёлтая"
  },
  "ui.projects.green": {
    "en": "Green",
    "ru": "Зелёная"
  },
  "ui.projects.ownerPlaceholderRoles": {
    "en": "PM / vendor / IT operations",
    "ru": "РП / поставщик / ИТ-эксплуатация"
  },
  "ui.projects.impact": {
    "en": "Impact",
    "ru": "Влияние"
  },
  "ui.projects.impactPlaceholder": {
    "en": "Impact on schedule, scope, or a management decision",
    "ru": "Влияние на сроки, содержание или решение руководства"
  },
  "ui.projects.requiresDecision": {
    "en": "Requires a decision",
    "ru": "Требует решения"
  },
  "ui.projects.primaryTicketKey": {
    "en": "Primary ticket key",
    "ru": "Ключ основного тикета"
  },
  "ui.projects.additionalTicketLinks": {
    "en": "Additional ticket links",
    "ru": "Дополнительные ссылки на тикеты"
  },
  "ui.projects.addTicketLink": {
    "en": "+ Add ticket link",
    "ru": "+ Добавить ссылку на тикет"
  },
  "ui.projects.createIssue": {
    "en": "Create issue",
    "ru": "Создать вопрос"
  },
  "ui.projects.jiraKeyLabel": {
    "en": "Jira key",
    "ru": "Ключ Jira"
  },
  "ui.projects.delayColumnLabel": {
    "en": "Delay",
    "ru": "Отставание"
  },
  "ui.projects.noneValue": {
    "en": "none",
    "ru": "нет"
  },
  "ui.projects.delayAtClosureLabel": {
    "en": "Delay at closure:",
    "ru": "Отставание на момент закрытия:"
  },
  "ui.projects.sourceLabel": {
    "en": "Source:",
    "ru": "Источник:"
  },
  "ui.projects.sourceInternalValue": {
    "en": "Internal",
    "ru": "Внутренний"
  },
  "ui.projects.notFilledInValue": {
    "en": "not filled in",
    "ru": "не заполнено"
  },
  "ui.projects.noJiraIssuesLinked": {
    "en": "No Jira issues linked",
    "ru": "Задачи Jira не связаны"
  },
  "ui.projects.noClosedQuestionsYet": {
    "en": "No closed issues yet.",
    "ru": "Закрытых вопросов пока нет."
  },
  "ui.projects.currentWorkPageTitle": {
    "en": "Current work",
    "ru": "Текучка"
  },
  "ui.projects.currentWorkPageSubtitle": {
    "en": "Current and upcoming project work",
    "ru": "Текущие и ближайшие работы проекта"
  },
  "ui.projects.currentWorkSearchLabel": {
    "en": "Search current work",
    "ru": "Поиск текущих работ"
  },
  "ui.projects.currentWorkNotFoundTitle": {
    "en": "No work found",
    "ru": "Работы не найдены"
  },
  "ui.projects.currentWorkNoneForConditionsTitle": {
    "en": "No work matches the selected conditions",
    "ru": "Работ по заданным условиям нет"
  },
  "ui.projects.changeQueryOrClearSearchHint": {
    "en": "Change your query or clear the search.",
    "ru": "Измените запрос или очистите поиск."
  },
  "ui.projects.currentWorkEmptyStructureHint": {
    "en": "Tasks will appear once you add dates and work items to the project structure.",
    "ru": "Задачи появятся после добавления дат и работ в структуру проекта."
  },
  "ui.projects.clearSearchAction": {
    "en": "Clear search",
    "ru": "Очистить поиск"
  },
  "ui.projects.currentWorkRegionLabel": {
    "en": "Project current work",
    "ru": "Текучка проекта"
  },
  "ui.projects.currentWorkOpenInStructure": {
    "en": "Open the work item in WBS",
    "ru": "Открыть работу в Структуре"
  },
  "ui.projects.structureTabLabel": {
    "en": "WBS",
    "ru": "Структура"
  },
  "ui.projects.structureColumnResizeHandle": {
    "en": "Resize the WBS column",
    "ru": "Изменить ширину колонки Структуры"
  },
  "ui.projects.ganttTimeScaleLabel": {
    "en": "Timeline",
    "ru": "Шкала времени"
  },
  "ui.projects.ganttRequiresStartAndDueDates": {
    "en": "The Gantt chart requires start and due dates on WBS items.",
    "ru": "Для Гантта нужны start и due даты элементов Структуры."
  },
  "ui.projects.structureItemExpand": {
    "en": "Expand WBS item",
    "ru": "Раскрыть элемент Структуры"
  },
  "ui.projects.structureItemCollapse": {
    "en": "Collapse WBS item",
    "ru": "Схлопнуть элемент Структуры"
  },
  "ui.projects.ganttDependencyLabel": {
    "en": "Gantt dependency",
    "ru": "Связь Гантта"
  },
  "ui.projects.ganttDependencyStart": {
    "en": "Dependency start",
    "ru": "Начало связи"
  },
  "ui.projects.ganttDependencyEnd": {
    "en": "Dependency end",
    "ru": "Конец связи"
  },
  "ui.projects.ganttCollapsedHierarchyHint": {
    "en": "Part of the hierarchy is collapsed. Expand the phases you need to see child tasks and dependencies.",
    "ru": "Часть иерархии схлопнута. Раскройте нужные фазы, чтобы увидеть дочерние задачи и связи."
  },
  "ui.projects.ganttRangeOverviewLabel": {
    "en": "Gantt range overview",
    "ru": "Обзор диапазона Гантта"
  },
  "ui.projects.ganttResizeWidthHandle": {
    "en": "Resize the Gantt area width",
    "ru": "Изменить ширину поля Гантта"
  },
  "ui.projects.ganttResizeHeightHandle": {
    "en": "Resize the Gantt area height",
    "ru": "Изменить высоту поля Гантта"
  },
  "ui.projects.ganttResizeHandle": {
    "en": "Resize the Gantt area",
    "ru": "Изменить размер поля Гантта"
  },
  "ui.projects.ganttScenarioPreviewNotice": {
    "en": "Showing a scenario · the working plan is unchanged",
    "ru": "Показан сценарий · рабочий план не изменён"
  },
  "ui.projects.ganttBackToWorkingPlan": {
    "en": "Back to the working plan",
    "ru": "Вернуться к рабочему плану"
  },
  "ui.projects.ganttExitFullScreen": {
    "en": "Restore the normal Gantt view",
    "ru": "Вернуть обычный режим Гантта"
  },
  "ui.projects.ganttEnterFullScreen": {
    "en": "Expand the Gantt to full screen",
    "ru": "Развернуть Гантт на весь экран"
  },
  "ui.projects.ganttUndoLastChange": {
    "en": "Undo the last Gantt change",
    "ru": "Откатить последнее изменение Гантта"
  },
  "ui.projects.undoBackLabel": {
    "en": "Back",
    "ru": "Назад"
  },
  "ui.projects.ganttRedoLastChange": {
    "en": "Redo the undone Gantt change",
    "ru": "Вернуть отмененное изменение Гантта"
  },
  "ui.projects.redoForwardLabel": {
    "en": "Forward",
    "ru": "Вперед"
  },
  "ui.projects.ganttZoomLabel": {
    "en": "Gantt zoom",
    "ru": "Масштаб Гантта"
  },
  "ui.projects.ganttZoomWeeks": {
    "en": "Weeks",
    "ru": "Недели"
  },
  "ui.projects.ganttZoomMonths": {
    "en": "Months",
    "ru": "Месяцы"
  },
  "ui.projects.ganttZoomQuarters": {
    "en": "Quarters",
    "ru": "Кварталы"
  },
  "ui.projects.ganttRangeLabel": {
    "en": "Gantt range",
    "ru": "Диапазон Гантта"
  },
  "ui.projects.ganttViewSettingsLabel": {
    "en": "View settings",
    "ru": "Настройки вида"
  },
  "ui.projects.ganttDependenciesToggle": {
    "en": "Dependencies",
    "ru": "Связи"
  },
  "ui.projects.ganttShowZeroFloatToggle": {
    "en": "Show tasks and dependencies with zero float",
    "ru": "Показать задачи и связи с нулевым резервом"
  },
  "ui.projects.ganttBaselineToggle": {
    "en": "Baseline",
    "ru": "Базовый план"
  },
  "ui.projects.ganttForecastToggle": {
    "en": "Forecast",
    "ru": "Прогноз"
  },
  "ui.projects.ganttResetSize": {
    "en": "Reset size",
    "ru": "Сбросить размер"
  },
  "ui.projects.ganttHierarchyDepthLabel": {
    "en": "Gantt hierarchy depth",
    "ru": "Глубина иерархии Гантта"
  },
  "ui.projects.statusLegendTitle": {
    "en": "Status legend",
    "ru": "Легенда статусов"
  },
  "ui.projects.statusInProgress": {
    "en": "In progress",
    "ru": "В работе"
  },
  "ui.projects.statusDone": {
    "en": "Done",
    "ru": "Сделано"
  },
  "ui.projects.statusFailed": {
    "en": "Failed",
    "ru": "Провалено"
  },
  "ui.projects.statusOverdue": {
    "en": "Overdue",
    "ru": "Просрочено"
  },
  "ui.projects.statusNotStarted": {
    "en": "Not started",
    "ru": "Не начато"
  },
  "ui.projects.itemTypeMilestone": {
    "en": "Milestone",
    "ru": "Веха"
  },
  "ui.projects.itemTypeGoal": {
    "en": "Goal",
    "ru": "Цель"
  },
  "ui.projects.ganttFloatUpToFiveDays": {
    "en": "Float up to 5 days",
    "ru": "Резерв до 5 дн."
  },
  "ui.projects.filterHighCriticality": {
    "en": "High criticality",
    "ru": "Высокая критичность"
  },
  "ui.projects.filterOverduePlural": {
    "en": "Overdue",
    "ru": "Просроченные"
  },
  "ui.projects.noOpenQuestions": {
    "en": "No open issues.",
    "ru": "Открытых вопросов нет."
  },
  "ui.projects.currentIssueStatusLabel": {
    "en": "Current status",
    "ru": "Текущий статус"
  },
  "ui.projects.projectPhaseColumn": {
    "en": "Project phase",
    "ru": "Фаза проекта"
  },
  "ui.projects.workPackageColumn": {
    "en": "Package",
    "ru": "Пакет"
  },
  "ui.projects.editThreadLink": {
    "en": "Edit thread link",
    "ru": "Изменить ссылку на трэд"
  },
  "ui.projects.deleteThreadLink": {
    "en": "Delete thread link",
    "ru": "Удалить ссылку на трэд"
  },
  "ui.projects.additionalThreadUrlLabel": {
    "en": "Additional thread URL",
    "ru": "URL дополнительного трэда"
  },
  "ui.projects.addThreadAction": {
    "en": "Add thread",
    "ru": "Добавить трэд"
  },
  "ui.projects.additionalTicketKeyLabel": {
    "en": "Additional ticket key",
    "ru": "Ключ дополнительного тикета"
  },
  "ui.projects.saveTicketLinkAction": {
    "en": "Save ticket link",
    "ru": "Сохранить ссылку на тикет"
  },
  "ui.projects.historyPrefixLabel": {
    "en": "History ·",
    "ru": "История ·"
  },
  "ui.projects.addNewStatusAction": {
    "en": "Add a new status",
    "ru": "Добавить новый статус"
  },
  "ui.projects.newStatusTextLabel": {
    "en": "New status text",
    "ru": "Текст нового статуса"
  },
  "ui.projects.addStatusWithCurrentDateAction": {
    "en": "Add status with the current date",
    "ru": "Добавить статус с текущей датой"
  },
  "ui.projects.linkedRiskLabel": {
    "en": "Linked risk",
    "ru": "Связанный риск"
  },
  "ui.projects.noLinkedRiskValue": {
    "en": "No risk",
    "ru": "Без риска"
  },
  "ui.projects.changeLinkedRiskAction": {
    "en": "Change linked risk",
    "ru": "Изменить связанный риск"
  },
  "ui.projects.linkRiskAction": {
    "en": "Link risk",
    "ru": "Связать риск"
  },
  "ui.projects.originalDueDateLabel": {
    "en": "Original due date:",
    "ru": "Исходный срок:"
  },
  "ui.projects.dateShiftLabel": {
    "en": "Shift:",
    "ru": "Сдвиг:"
  },
  "ui.projects.calendarDaysShortUnit": {
    "en": "cal. days",
    "ru": "кал. дн."
  },
  "ui.projects.convertToIssueAction": {
    "en": "Convert to problem",
    "ru": "В проблему"
  },
  "ui.projects.projectGoalsTitle": {
    "en": "Project goals",
    "ru": "Цели проекта"
  },
  "ui.projects.noGoalsOnTimeline": {
    "en": "No goals on the timeline.",
    "ru": "Целей на шкале нет."
  },
  "ui.projects.milestonesTitle": {
    "en": "Milestones",
    "ru": "Вехи"
  },
  "ui.projects.noStatusesAddedYet": {
    "en": "No statuses added yet.",
    "ru": "Статусы пока не добавлены."
  },
  "ui.projects.overviewRedZoneRisksAndIssuesTitle": {
    "en": "Key red-zone risks and problems",
    "ru": "Ключевые риски и проблемы в красной зоне"
  },
  "ui.projects.overviewNoScore15PlusRecords": {
    "en": "No risks or problems scored 15+.",
    "ru": "Рисков и проблем с оценкой 15+ нет."
  },
  "ui.projects.overviewDecisionsOnKeyQuestionsTitle": {
    "en": "Decisions on key open issues",
    "ru": "Решения по ключевым открытым вопросам"
  },
  "ui.projects.dueDateInlineSuffix": {
    "en": "/ due",
    "ru": "/ срок"
  },
  "ui.projects.overviewNoQuestionsRequiringDecision": {
    "en": "No open issues require a decision.",
    "ru": "Открытых вопросов, требующих решения, нет."
  },
  "ui.projects.sectionAnchorLabel": {
    "en": "Link to section",
    "ru": "Ссылка на раздел"
  },
  "ui.projects.aggregateLoadingMessage": {
    "en": "Loading aggregate...",
    "ru": "Загрузка агрегата..."
  },
  "ui.projects.noTicketsAtRisk": {
    "en": "No tickets at risk.",
    "ru": "Тикетов под риском нет."
  },
  "ui.projects.showingFirstPrefix": {
    "en": "Showing the first",
    "ru": "Показаны первые"
  },
  "ui.projects.scheduleVarianceTitle": {
    "en": "Schedule variance",
    "ru": "Отклонение сроков"
  },
  "ui.projects.scheduleVarianceAnchorLabel": {
    "en": "Link to the Schedule variance section",
    "ru": "Ссылка на раздел Отклонение сроков"
  },
  "ui.projects.largestDelayImpactLabel": {
    "en": "Largest delay impact",
    "ru": "Максимальное влияние на отставание"
  },
  "ui.projects.calendarDaysAssigneeLabel": {
    "en": "calendar days / assignee:",
    "ru": "календарных дней / исполнитель:"
  },
  "ui.projects.largestAheadOfScheduleImpactLabel": {
    "en": "Largest ahead-of-schedule impact",
    "ru": "Максимальное влияние на опережение"
  },
  "ui.projects.noBaselineDeviations": {
    "en": "No deviations from the baseline.",
    "ru": "Отклонений от базового плана нет."
  },
  "ui.projects.pmWorkspaceTitle": {
    "en": "PM workspace",
    "ru": "Рабочий стол PM"
  },
  "ui.projects.pmWorkspaceOpenTopRisk": {
    "en": "Open the top risk",
    "ru": "Открыть главный риск"
  },
  "ui.projects.metricProgressLowercase": {
    "en": "progress",
    "ru": "прогресс"
  },
  "ui.projects.metricScheduleLowercase": {
    "en": "schedule",
    "ru": "сроки"
  },
  "ui.projects.metricDecisionsLowercase": {
    "en": "decisions",
    "ru": "решений"
  },
  "ui.projects.pmWorkspaceRedZoneRaidTitle": {
    "en": "Red-zone RAID",
    "ru": "RAID красной зоны"
  },
  "ui.projects.pmWorkspaceDecisionNeededTitle": {
    "en": "Decision needed",
    "ru": "Нужно решение"
  },
  "ui.projects.pmWorkspaceNoActiveTasks": {
    "en": "No active tasks for the workspace.",
    "ru": "Активных задач для рабочего стола нет."
  },
  "ui.projects.monthJulyLowercase": {
    "en": "July",
    "ru": "июль"
  },
  "ui.projects.monthAugustLowercase": {
    "en": "August",
    "ru": "август"
  },
  "ui.projects.monthSeptemberLowercase": {
    "en": "September",
    "ru": "сентябрь"
  },
  "ui.projects.riskMatrixTitle": {
    "en": "Risk matrix",
    "ru": "Матрица рисков"
  },
  "ui.projects.newEntryAction": {
    "en": "New entry",
    "ru": "Новая запись"
  },
  "ui.projects.filtersLabel": {
    "en": "Filters",
    "ru": "Фильтры"
  },
  "ui.projects.addStatusAction": {
    "en": "Add status",
    "ru": "Добавить статус"
  },
  "ui.projects.convertToAssumptionAction": {
    "en": "Convert to assumption",
    "ru": "В допущение"
  },
  "ui.projects.structureToolbarLabel": {
    "en": "WBS toolbar",
    "ru": "Панель управления Структурой"
  },
  "ui.projects.structureViewModeTipLabel": {
    "en": "View mode tip",
    "ru": "Подсказка по режиму просмотра"
  },
  "ui.projects.closeTipAction": {
    "en": "Close tip",
    "ru": "Закрыть подсказку"
  },
  "ui.projects.structureFullScreenTipTitle": {
    "en": "Want an easier way to work with the structure?",
    "ru": "Удобнее работать со структурой?"
  },
  "ui.projects.structureFullScreenTipBody": {
    "en": "Expand it to full screen — the header and toolbar stay available at all times.",
    "ru": "Разверните её на весь экран — шапка и панель управления всегда будут доступны."
  },
  "ui.projects.structureExitFullScreen": {
    "en": "Restore the normal WBS view",
    "ru": "Вернуть обычный режим Структуры"
  },
  "ui.projects.structureEnterFullScreen": {
    "en": "Expand WBS to full screen",
    "ru": "Развернуть Структуру на весь экран"
  },
  "ui.projects.structureUndoLastChange": {
    "en": "Undo the last WBS change",
    "ru": "Откатить последнее изменение Структуры"
  },
  "ui.projects.structureUndoBackLabel": {
    "en": "← Back",
    "ru": "← Назад"
  },
  "ui.projects.structureRedoLastChange": {
    "en": "Redo the undone WBS change",
    "ru": "Вернуть отмененное изменение Структуры"
  },
  "ui.projects.structureRedoForwardLabel": {
    "en": "Forward →",
    "ru": "Вперед →"
  },
  "ui.projects.saveChangesAction": {
    "en": "Save changes",
    "ru": "Сохранить изменения"
  },
  "ui.projects.structureSetBaselineAction": {
    "en": "Set the baseline",
    "ru": "Зафиксировать базовый план"
  },
  "ui.projects.structureColumnsAction": {
    "en": "Columns",
    "ru": "Колонки"
  },
  "ui.projects.structureSaveToPdfAction": {
    "en": "Save WBS to PDF",
    "ru": "Сохранить Структуру в PDF"
  },
  "ui.projects.structureTranslationsImportExportAction": {
    "en": "Import and export WBS English translations",
    "ru": "Импорт и экспорт английских переводов Структуры"
  },
  "ui.projects.structureHierarchyDepthLabel": {
    "en": "WBS hierarchy depth",
    "ru": "Глубина иерархии Структуры"
  },
  "ui.projects.allChangesSavedNotice": {
    "en": "All changes saved",
    "ru": "Все изменения сохранены"
  },
  "ui.projects.selectedCountPrefix": {
    "en": "Selected:",
    "ru": "Выбрано:"
  },
  "ui.projects.structureBulkChangeStatusAction": {
    "en": "Bulk change status",
    "ru": "Массово изменить статус"
  },
  "ui.projects.structureBulkChangeCalendarAction": {
    "en": "Bulk change calendar",
    "ru": "Массово изменить календарь"
  },
  "ui.projects.calendarLabel": {
    "en": "Calendar",
    "ru": "Календарь"
  },
  "ui.projects.structureSaveSelectedFirstHint": {
    "en": "Save the changes to the selected work items first",
    "ru": "Сначала сохраните изменения выбранных работ"
  },
  "ui.projects.structureSetSelectedDatesAsBaselineHint": {
    "en": "Set the current dates of the selected work items as the baseline",
    "ru": "Зафиксировать текущие даты выбранных работ как базовые"
  },
  "ui.projects.structureUpdatingBaselineMessage": {
    "en": "Updating the baseline...",
    "ru": "Обновляю базовый план..."
  },
  "ui.projects.structureUpdateBaselineAction": {
    "en": "Update baseline",
    "ru": "Обновить базовый план"
  },
  "ui.projects.deleteSelectedAction": {
    "en": "Delete selected",
    "ru": "Удалить выбранные"
  },
  "ui.projects.clearSelectionAction": {
    "en": "Clear selection",
    "ru": "Снять выбор"
  },
  "ui.projects.structureStatusLegendLabel": {
    "en": "WBS status legend",
    "ru": "Легенда статусов Структуры"
  },
  "ui.projects.structureNotCreatedYet": {
    "en": "The structure has not been created yet.",
    "ru": "Структура еще не создана."
  },
  "ui.projects.structureNoCriticalPathTasksForFilter": {
    "en": "No critical path tasks for the current filter.",
    "ru": "Нет задач критического пути для текущего фильтра."
  },
  "ui.projects.startColumnLabel": {
    "en": "Start",
    "ru": "Старт"
  },
  "ui.projects.workSummaryHighlightTaskInStructure": {
    "en": "Highlight the task in WBS",
    "ru": "Выделить задачу в Структуре"
  },
  "ui.projects.workSummaryTitle": {
    "en": "Work summary",
    "ru": "Сводка по работам"
  },
  "ui.projects.workSummarySubtitle": {
    "en": "Current tasks and tasks starting next week",
    "ru": "Текущие задачи и задачи со стартом на следующей неделе"
  },
  "ui.projects.workSummaryExpandCurrentTasks": {
    "en": "Expand current tasks",
    "ru": "Развернуть текущие задачи"
  },
  "ui.projects.workSummaryCollapseCurrentTasks": {
    "en": "Collapse current tasks",
    "ru": "Свернуть текущие задачи"
  },
  "ui.projects.workSummaryCurrentTasksTitle": {
    "en": "Current tasks",
    "ru": "Текущие задачи"
  },
  "ui.projects.workSummaryPhaseFilterLabel": {
    "en": "Filter current tasks by phase",
    "ru": "Фильтр текущих задач по фазе"
  },
  "ui.projects.workSummaryAllPhasesOption": {
    "en": "All phases",
    "ru": "Все фазы"
  },
  "ui.projects.workSummaryExpandNextWeekTasks": {
    "en": "Expand tasks starting next week",
    "ru": "Развернуть задачи на следующей неделе"
  },
  "ui.projects.workSummaryCollapseNextWeekTasks": {
    "en": "Collapse tasks starting next week",
    "ru": "Свернуть задачи на следующей неделе"
  },
  "ui.projects.workSummaryNextWeekStartTitle": {
    "en": "Starting next week",
    "ru": "Старт на следующей неделе"
  },
  "ui.projects.ganttTabLabel": {
    "en": "Gantt",
    "ru": "Гантт"
  },
  "ui.projects.structureTabDescription": {
    "en": "Project work hierarchy, dates, owners, calendar, and predecessor dependencies",
    "ru": "Иерархия работ проекта, сроки, ответственные, календарь и связи с предшественниками"
  },
  "ui.projects.ganttTabDescription": {
    "en": "Project timeline, dependencies, and baseline",
    "ru": "Временная шкала проекта, связи и базовый план"
  }
} as const;

export const projectsMessages = {
  ...projectsCoreMessages,
  ...projectsIssuesMessages,
  ...projectsRaidMessages,
} as const;
