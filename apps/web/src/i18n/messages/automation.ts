export const automationMessages = {
  "ui.automation.meetingNotesIntro": {
    "en": "Paste the meeting text, review the drafts, and select the records to create. Due dates and owners that are not specified will stay empty.",
    "ru": "Вставьте текст встречи, проверьте черновики и отметьте записи для создания. Неуказанные сроки и ответственные останутся пустыми."
  },
  "ui.automation.meetingNotesParsingRules": {
    "en": "Rule-based parsing: one line — one draft. Markers: «Task:», «Issue:», «Risk:», «Owner:», «Due:». Up to 20 lines. The text is not sent to an external AI.",
    "ru": "Разбор по правилам: одна строка — один черновик. Метки: «Задача:», «Вопрос:», «Риск:», «Ответственный:», «Срок:». До 20 строк. Текст не отправляется внешнему ИИ."
  },
  "ui.automation.meetingNotesText": {
    "en": "Meeting notes text",
    "ru": "Текст протокола"
  },
  "ui.automation.meetingNotesPlaceholder": {
    "en": "Task: Check the samples; Owner: Ivanov; Due: 2026-09-20\nIssue: Agree on the delivery date\nRisk: Component delay",
    "ru": "Задача: Проверить образцы; Ответственный: Иванов; Срок: 2026-09-20\nВопрос: Согласовать дату поставки\nРиск: Задержка компонентов"
  },
  "ui.automation.prepareDrafts": {
    "en": "Prepare drafts",
    "ru": "Подготовить черновики"
  },
  "ui.automation.creatingRecords": {
    "en": "Creating records…",
    "ru": "Создаем записи…"
  },
  "ui.automation.createReviewedRecords": {
    "en": "Create the reviewed records",
    "ru": "Создать проверенные записи"
  },
  "ui.automation.firstTwentyLinesProcessed": {
    "en": "Only the first 20 non-empty lines are processed. Process the rest in the next batch.",
    "ru": "Обрабатываются первые 20 непустых строк. Остальные обработайте следующей порцией."
  },
  "ui.automation.createRecord": {
    "en": "Create record",
    "ru": "Создать запись"
  },
  "ui.automation.recordType": {
    "en": "Record type",
    "ru": "Тип записи"
  },
  "ui.automation.wbsWork": {
    "en": "WBS work item",
    "ru": "Работа WBS"
  },
  "ui.automation.openIssue": {
    "en": "Open issue",
    "ru": "Открытый вопрос"
  },
  "ui.automation.risk": {
    "en": "Risk",
    "ru": "Риск"
  },
  "ui.automation.owner": {
    "en": "Owner",
    "ru": "Ответственный"
  },
  "ui.automation.dueDate": {
    "en": "Due date",
    "ru": "Срок"
  },
  "ui.automation.sourceLine": {
    "en": "Source line",
    "ru": "Исходная строка"
  },
  "ui.automation.similarNameExists": {
    "en": "A similar name already exists. Refine the record before creating it.",
    "ru": "Похожее название уже существует. Уточните запись перед созданием."
  },
  "ui.automation.workCreatedAtTopLevel": {
    "en": "The work item is created at the top level. Move it into the right package in WBS.",
    "ru": "Работа создается на верхнем уровне. Разместите ее в нужном пакете в Структуре."
  },
  "ui.automation.rateRiskAfterCreation": {
    "en": "After creating it, rate the risk's probability and impact in the register.",
    "ru": "После создания оцените вероятность и влияние риска в реестре."
  },
  "ui.automation.moduleDisabledChooseAnotherType": {
    "en": "The module is disabled. Choose a different record type.",
    "ru": "Модуль отключен. Выберите другой тип записи."
  },
  "ui.automation.removeDraft": {
    "en": "Remove draft",
    "ru": "Убрать черновик"
  },
  "ui.automation.meetingNotesToActionItems": {
    "en": "From meeting notes to action items",
    "ru": "Из протокола — в поручения"
  },
  "ui.automation.readinessCheckDescription": {
    "en": "Checked against WBS predecessors and linked issues and risks. Readiness is confirmed only within the defined links.",
    "ru": "Проверка по предшественникам WBS и связанным вопросам и рискам. Готовность подтверждается только в пределах заданных связей."
  },
  "ui.automation.checkingMilestones": {
    "en": "Checking milestones…",
    "ru": "Проверяем вехи…"
  },
  "ui.automation.noMilestonesOrGoalsYet": {
    "en": "No milestones or goals have been defined yet.",
    "ru": "Вехи и цели пока не заданы."
  },
  "ui.automation.workItemsRemaining": {
    "en": "Work items remaining:",
    "ru": "Осталось работ:"
  },
  "ui.automation.milestoneReadiness": {
    "en": "Milestone readiness",
    "ru": "Готовность вех"
  },
  "ui.automation.reconciliationDescription": {
    "en": "Comparison of linked work items with the latest loaded Jira snapshot. Select the fields to change in the WBS. Jira is not modified.",
    "ru": "Сравнение связанных работ с последним загруженным снимком Jira. Выберите поля для изменения в WBS. Jira не изменяется."
  },
  "ui.automation.rerunReconciliation": {
    "en": "Run reconciliation again",
    "ru": "Повторить сверку"
  },
  "ui.automation.applying": {
    "en": "Applying…",
    "ru": "Применяем…"
  },
  "ui.automation.applySelectionToWbs": {
    "en": "Apply selection to WBS",
    "ru": "Применить выбранное к WBS"
  },
  "ui.automation.reconcilingData": {
    "en": "Reconciling data…",
    "ru": "Сверяем данные…"
  },
  "ui.automation.noDiscrepanciesFound": {
    "en": "No discrepancies found. Only work items with a Jira key set are checked.",
    "ru": "Расхождения не найдены. Проверяются только работы с указанным ключом Jira."
  },
  "ui.automation.jiraStatusInline": {
    "en": "· Jira status:",
    "ru": "· Статус Jira:"
  },
  "ui.automation.noData": {
    "en": "No data",
    "ru": "Нет данных"
  },
  "ui.automation.snapshotLoadedInline": {
    "en": "· Snapshot loaded:",
    "ru": "· Снимок загружен:"
  },
  "ui.automation.ownerLabel": {
    "en": "Owner:",
    "ru": "Ответственный:"
  },
  "ui.automation.notAssigned": {
    "en": "Not assigned",
    "ru": "Не назначен"
  },
  "ui.automation.scenarioPanelDescription": {
    "en": "Change the dates or duration of leaf work items. Milestones, dependent work items, and the critical path are recalculated in a separate scenario. The working plan is not modified.",
    "ru": "Измените даты или длительность конечных работ. Вехи, зависимые работы и критический путь пересчитаются в отдельном сценарии. Рабочий план не изменяется."
  },
  "ui.automation.scenarioPanelHint": {
    "en": "“Start no earlier than” moves the work item and keeps its duration. A new finish date changes the duration. Dependencies and the calendar may shift the result.",
    "ru": "«Начать не раньше» переносит работу с сохранением длительности. Новое окончание меняет длительность. Зависимости и календарь могут сдвинуть результат."
  },
  "ui.automation.addChange": {
    "en": "Add change",
    "ru": "Добавить изменение"
  },
  "ui.automation.calculating": {
    "en": "Calculating…",
    "ru": "Рассчитываем…"
  },
  "ui.automation.compareWithWorkingPlan": {
    "en": "Compare with the working plan",
    "ru": "Сравнить с рабочим планом"
  },
  "ui.automation.workItem": {
    "en": "Work item",
    "ru": "Работа"
  },
  "ui.automation.startNoEarlierThan": {
    "en": "Start no earlier than",
    "ru": "Начать не раньше"
  },
  "ui.automation.newFinish": {
    "en": "New finish",
    "ru": "Новое окончание"
  },
  "ui.automation.durationWorkingDays": {
    "en": "Duration, working days",
    "ru": "Длительность, раб. дней"
  },
  "ui.automation.removeChange": {
    "en": "Remove change",
    "ru": "Убрать изменение"
  },
  "ui.automation.scheduleFinishLabel": {
    "en": "Schedule finish:",
    "ru": "Завершение графика:"
  },
  "ui.automation.criticalWorkItemsCount": {
    "en": ". Critical work items:",
    "ru": ". Критических работ:"
  },
  "ui.automation.datesUnchanged": {
    "en": "The dates did not change. Check the dependencies and the values you entered.",
    "ru": "Сроки не изменились. Проверьте зависимости и введенные значения."
  },
  "ui.automation.workItemOrMilestone": {
    "en": "Work item / milestone",
    "ru": "Работа / веха"
  },
  "ui.automation.startBeforeAfter": {
    "en": "Start: before → after",
    "ru": "Начало: было → стало"
  },
  "ui.automation.finishBeforeAfter": {
    "en": "Finish: before → after",
    "ru": "Окончание: было → стало"
  },
  "ui.automation.criticalPath": {
    "en": "Critical path",
    "ru": "Критический путь"
  },
  "ui.automation.milestoneInline": {
    "en": "· Milestone",
    "ru": "· Веха"
  },
  "ui.automation.yes": {
    "en": "Yes",
    "ru": "Да"
  },
  "ui.automation.no": {
    "en": "No",
    "ru": "Нет"
  },
  "ui.automation.variantName": {
    "en": "Variant name",
    "ru": "Название варианта"
  },
  "ui.automation.saveVariant": {
    "en": "Save variant",
    "ru": "Сохранить вариант"
  },
  "ui.automation.savedVariantsInBrowser": {
    "en": "Variants saved in this browser",
    "ru": "Сохраненные варианты в этом браузере"
  },
  "ui.automation.load": {
    "en": "Load",
    "ru": "Загрузить"
  },
  "ui.automation.deleteVariant": {
    "en": "Delete variant",
    "ru": "Удалить вариант"
  },
  "ui.automation.whatIfScenarios": {
    "en": "“What if…” scenarios",
    "ru": "Сценарии «Что будет, если…»"
  },
  "ui.automation.whatChangedThisWeek": {
    "en": "What changed this week",
    "ru": "Что изменилось за неделю"
  },
  "ui.automation.weeklyBriefDescription": {
    "en": "A summary of the recorded history for the selected project or for the portfolio projects available to you.",
    "ru": "Сводка по записанной истории для выбранного проекта или доступных вам проектов портфеля."
  },
  "ui.automation.reportScope": {
    "en": "Report scope",
    "ru": "Область отчета"
  },
  "ui.automation.allAvailablePortfolioProjects": {
    "en": "All available portfolio projects",
    "ru": "Все доступные проекты портфеля"
  },
  "ui.automation.period": {
    "en": "Period",
    "ru": "Период"
  },
  "ui.automation.sevenDays": {
    "en": "7 days",
    "ru": "7 дней"
  },
  "ui.automation.fourteenDays": {
    "en": "14 days",
    "ru": "14 дней"
  },
  "ui.automation.thirtyDays": {
    "en": "30 days",
    "ru": "30 дней"
  },
  "ui.automation.refreshSummary": {
    "en": "Refresh summary",
    "ru": "Обновить сводку"
  },
  "ui.automation.copied": {
    "en": "Copied",
    "ru": "Скопировано"
  },
  "ui.automation.copySummary": {
    "en": "Copy summary",
    "ru": "Копировать сводку"
  },
  "ui.automation.collectingChanges": {
    "en": "Collecting changes…",
    "ru": "Собираем изменения…"
  },
  "ui.automation.projectsInScopeLabel": {
    "en": "Projects in report scope:",
    "ru": "Проектов в области отчета:"
  },
  "ui.automation.projectsWithChangesLabel": {
    "en": ". Projects with changes:",
    "ru": ". Проектов с изменениями:"
  },
  "ui.automation.structureAndScheduleWbsHistory": {
    "en": "WBS and schedule — WBS history",
    "ru": "Структура и график — история WBS"
  },
  "ui.automation.issuesRisksProjectChangeLog": {
    "en": "Issues, risks, and project — change log",
    "ru": "Вопросы, риски и проект — журнал изменений"
  },
  "ui.automation.noRecordedChangesForPeriod": {
    "en": "No changes were recorded for this period.",
    "ru": "За период записанных изменений нет."
  },
  "ui.automation.projectOrObject": {
    "en": "Project / object",
    "ru": "Проект / объект"
  },
  "ui.automation.changeColumn": {
    "en": "Change",
    "ru": "Изменение"
  },
  "ui.automation.before": {
    "en": "Before",
    "ru": "Было"
  },
  "ui.automation.after": {
    "en": "After",
    "ru": "Стало"
  },
  "ui.automation.whenWho": {
    "en": "When / who",
    "ru": "Когда / кто"
  }
} as const;
