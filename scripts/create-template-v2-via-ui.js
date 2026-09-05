(() => {
  "use strict";

  const PROD_ORIGIN = "https://tv-dashboard.rnd.dev.sberdevices.ru";
  const PROJECT = {
    code: "TEMPLATE-V2",
    name: "Шаблон проекта v2",
    businessUnitId: "business-unit-default",
    businessUnitName: "TV&Box",
    projectManager: "Не назначен",
    sponsor: "Не назначен",
    start: "2026-07-01",
    due: "2028-02-29",
    summary:
      "Шаблон на основе Glasses (with camera), первый лист Google Sheets. Треки HW, SW и G2M импортированы как фазы, этапы - как пакеты работ.",
  };

  const PHASES = [
    {
      title: "HW",
      start: "2026-07-01",
      due: "2028-02-29",
      packages: [
        ["UX / HW / SW Concept", "2026-07-01", "2026-07-31"],
        ["UX / HW / SW Concept", "2026-08-03", "2026-08-31"],
        ["Discovery", "2026-09-01", "2026-09-30"],
        ["Discovery", "2026-10-01", "2026-10-30"],
        ["HW Prod.Req", "2026-11-02", "2026-11-30"],
        ["ID CMF Design", "2026-12-01", "2026-12-31"],
        ["HW preES", "2027-01-01", "2027-01-29"],
        ["CNY", "2027-02-01", "2027-02-26"],
        ["HW preES", "2027-03-01", "2027-03-31"],
        ["HW ES1", "2027-04-01", "2027-04-30"],
        ["HW ES2", "2027-05-03", "2027-05-31"],
        ["HW EVT1", "2027-06-01", "2027-06-30"],
        ["HW EVT1", "2027-07-01", "2027-07-30"],
        ["HW EVT2", "2027-08-02", "2027-08-31"],
        ["HW DVT", "2027-09-01", "2027-09-30"],
        ["PVT", "2027-10-01", "2027-10-29"],
        ["PVT / MP", "2027-11-01", "2027-11-30"],
        ["MP", "2027-12-01", "2027-12-31"],
        ["MP", "2028-01-03", "2028-01-31"],
        ["MP Launch", "2028-02-01", "2028-02-29"],
      ],
    },
    {
      title: "SW",
      start: "2026-09-01",
      due: "2028-01-31",
      packages: [
        ["Feasibility", "2026-09-01", "2026-09-30"],
        ["Feasibility", "2026-10-01", "2026-10-30"],
        ["SW Prod.Req", "2026-11-02", "2026-11-30"],
        ["SW Prod.Req", "2026-12-01", "2026-12-31"],
        ["Architecture", "2027-01-01", "2027-01-29"],
        ["Architecture", "2027-02-01", "2027-02-26"],
        ["Bring-up", "2027-03-01", "2027-03-31"],
        ["Bring-up", "2027-04-01", "2027-04-30"],
        ["Bring-up", "2027-05-03", "2027-05-31"],
        ["Alpha", "2027-06-01", "2027-06-30"],
        ["Alpha", "2027-07-01", "2027-07-30"],
        ["Alpha", "2027-08-02", "2027-08-31"],
        ["Beta", "2027-09-01", "2027-09-30"],
        ["Beta / MP FW-RC", "2027-10-01", "2027-10-29"],
        ["Beta", "2027-11-01", "2027-11-30"],
        ["Beta / MP FW+OTA", "2027-12-01", "2027-12-31"],
        ["Beta", "2028-01-03", "2028-01-31"],
      ],
    },
    {
      title: "G2M",
      start: "2026-12-01",
      due: "2028-01-31",
      packages: [
        ["Product Vision, Positioning & Design Concept", "2026-12-01", "2026-12-31"],
        ["Product Vision, Positioning & Design Concept", "2027-01-01", "2027-01-29"],
        ["Product Vision, Positioning & Design Concept", "2027-02-01", "2027-02-26"],
        ["Product Vision, Positioning & Design Concept", "2027-03-01", "2027-03-31"],
        ["Integrated GTM Plan Development", "2027-04-01", "2027-04-30"],
        ["Marketing & Commercial Strategy", "2027-05-03", "2027-05-31"],
        ["Marketing & Commercial Strategy", "2027-06-01", "2027-06-30"],
        ["Content Creation & Approval", "2027-07-01", "2027-07-30"],
        ["Content Creation & Approval", "2027-08-02", "2027-08-31"],
        ["Marketing & Support Asset Production", "2027-09-01", "2027-09-30"],
        ["Marketing & Support Asset Production", "2027-10-01", "2027-10-29"],
        ["Marketing & Support Asset Production", "2027-11-01", "2027-11-30"],
        ["Training and Demo Activities", "2027-12-01", "2027-12-31"],
        ["Pre‑Launch Alignment & Announcement Planning", "2028-01-03", "2028-01-31"],
      ],
    },
  ];

  const DEFAULT_STRUCTURE_TITLES = [
    "Инициация проекта",
    "Паспорт проекта",
    "Команда и роли",
    "Старт проекта",
    "Планирование",
    "Декомпозиция структуры",
    "Уточнение зависимостей",
    "Базовый план согласован",
    "Исполнение",
    "Первый пакет работ",
  ];
  const RETAINED_DEFAULT_ROW_INDEXES = new Set([6, 7, 8]);
  const LEDGER_STORAGE_KEY = "template-v2-ui-import:last-run";

  const options = window.__TEMPLATE_V2_UI_IMPORT_OPTIONS__ ?? {};
  const state = {
    runId: `${options.mode ?? "dry-run"}-${new Date().toISOString()}`,
    status: "running",
    mode: options.mode ?? "dry-run",
    step: "starting",
    startedAt: new Date().toISOString(),
    logs: [],
    mutationLedger: [],
    result: null,
    error: null,
  };
  window.__TEMPLATE_V2_UI_IMPORT_ABORT__ = false;
  window.__TEMPLATE_V2_UI_IMPORT__ = state;

  function persistState() {
    localStorage.setItem(
      LEDGER_STORAGE_KEY,
      JSON.stringify({
        runId: state.runId,
        mode: state.mode,
        status: state.status,
        step: state.step,
        startedAt: state.startedAt,
        finishedAt: state.finishedAt ?? null,
        mutationLedger: state.mutationLedger,
        result: state.result,
        error: state.error,
      }),
    );
  }

  function readPersistedState() {
    try {
      return JSON.parse(localStorage.getItem(LEDGER_STORAGE_KEY) ?? "null");
    } catch {
      return null;
    }
  }

  function log(step, details = "") {
    state.step = step;
    state.logs.push({ at: new Date().toISOString(), step, details });
    persistState();
  }

  function assert(condition, message) {
    if (!condition) throw new Error(message);
  }

  function sleep(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function assertNotAborted() {
    assert(
      window.__TEMPLATE_V2_UI_IMPORT_ABORT__ !== true,
      "Импорт остановлен внешним флагом; дальнейшие изменения запрещены",
    );
  }

  function beginMutation(action, details = "") {
    const entry = {
      id: state.mutationLedger.length + 1,
      action,
      details,
      status: "attempted",
      attemptedAt: new Date().toISOString(),
      confirmedAt: null,
    };
    state.mutationLedger.push(entry);
    persistState();
    return entry;
  }

  function confirmMutation(entry, details = entry.details) {
    entry.details = details;
    entry.status = "confirmed";
    entry.confirmedAt = new Date().toISOString();
    persistState();
  }

  function errorToastTexts() {
    return [...document.querySelectorAll(".toast.error")]
      .map((toast) => toast.textContent.trim())
      .filter(Boolean);
  }

  async function waitFor(predicate, description, timeout = 30000) {
    const deadline = Date.now() + timeout;
    let lastError = null;
    const existingErrors = new Set(errorToastTexts());
    while (Date.now() < deadline) {
      assertNotAborted();
      const newError = errorToastTexts().find((message) => !existingErrors.has(message));
      if (newError) throw new Error(`Интерфейс сообщил об ошибке: ${newError}`);
      try {
        const value = predicate();
        if (value) return value;
      } catch (error) {
        lastError = error;
      }
      await sleep(150);
    }
    const suffix = lastError instanceof Error ? `: ${lastError.message}` : "";
    throw new Error(`Таймаут ожидания: ${description}${suffix}`);
  }

  function buttonByExactText(text, root = document) {
    return [...root.querySelectorAll("button")].find(
      (button) => button.textContent.trim() === text && !button.disabled,
    );
  }

  function nativeValueSetter(element) {
    if (element instanceof HTMLSelectElement) {
      return Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value").set;
    }
    if (element instanceof HTMLTextAreaElement) {
      return Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    }
    return Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  }

  function setControlValue(element, value, eventName = "input") {
    assert(element, `Не найден элемент для значения «${value}»`);
    element.focus();
    nativeValueSetter(element).call(element, value);
    element.dispatchEvent(new Event(eventName, { bubbles: true }));
  }

  function setInputValue(element, value) {
    setControlValue(element, value, "input");
  }

  function setSelectValue(element, value) {
    setControlValue(element, value, "change");
  }

  function pressEnter(element) {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Enter",
        code: "Enter",
        keyCode: 13,
        which: 13,
        bubbles: true,
        cancelable: true,
      }),
    );
  }

  function directLabelText(label) {
    const ownText = [...label.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent.trim())
      .filter(Boolean)
      .join(" ");
    return ownText || label.querySelector(":scope > span")?.textContent?.trim() || "";
  }

  function fieldByLabel(form, labelText) {
    const label = [...form.querySelectorAll("label")].find(
      (candidate) => directLabelText(candidate) === labelText,
    );
    return label?.querySelector("input, select, textarea") ?? null;
  }

  function wbsRows() {
    return [...document.querySelectorAll(".wbs-row-stack")];
  }

  function rowTitle(row) {
    return row.querySelector(".wbs-title-input")?.value ?? "";
  }

  function rowLevel(row) {
    return Number(row.querySelector(".wbs-level-input")?.value ?? 0);
  }

  function rowTypeSelect(row) {
    return [...row.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => option.value === "WORK_PACKAGE"),
    );
  }

  function rowStatusSelect(row) {
    return [...row.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => option.value === "NOT_STARTED"),
    );
  }

  function rowCalendarSelect(row) {
    return [...row.querySelectorAll("select")].find((select) =>
      [...select.options].some((option) => option.value === "RU_CN"),
    );
  }

  function headerIndex(label) {
    const normalizedLabel = label.trim().toLocaleLowerCase("ru-RU");
    const headers = [...document.querySelectorAll(".wbs-table-head .wbs-column-title")];
    return headers.findIndex(
      (header) => header.textContent.trim().toLocaleLowerCase("ru-RU") === normalizedLabel,
    );
  }

  function rowCellByHeader(row, label) {
    const index = headerIndex(label);
    assert(index >= 0, `В таблице Структуры нет колонки «${label}»`);
    const cell = row.querySelectorAll(":scope > .wbs-table-row > div")[index];
    assert(cell, `В строке Структуры нет ячейки «${label}»`);
    return cell;
  }

  function currentRow(rowId) {
    const row = document.getElementById(rowId);
    assert(row, `Строка ${rowId} исчезла из Структуры`);
    return row;
  }

  async function waitForRowClean(rowId, expected, description) {
    await waitFor(() => {
      const row = currentRow(rowId);
      if (row.querySelector(".dirty")) return false;
      return expected(row);
    }, description, 45000);
    await sleep(350);
  }

  async function saveInput(rowId, inputGetter, value, description) {
    assertNotAborted();
    const input = inputGetter(currentRow(rowId));
    setInputValue(input, value);
    pressEnter(input);
    await waitForRowClean(
      rowId,
      (row) => inputGetter(row)?.value === value,
      description,
    );
  }

  async function saveSelect(rowId, selectGetter, value, description) {
    assertNotAborted();
    const select = selectGetter(currentRow(rowId));
    if (select.value === value) return;
    setSelectValue(select, value);
    await waitForRowClean(
      rowId,
      (row) => selectGetter(row)?.value === value,
      description,
    );
  }

  async function saveRowTextFields(rowId, title, owner) {
    assertNotAborted();
    const row = currentRow(rowId);
    const titleInput = row.querySelector(".wbs-title-input");
    const ownerInput = rowCellByHeader(row, "ИСПОЛНИТЕЛЬ").querySelector("input");
    setInputValue(titleInput, title);
    setInputValue(ownerInput, owner);
    const predecessors = [...row.querySelectorAll(".wbs-predecessor-input")];
    assert(predecessors.length === 6, `У строки «${title}» видны не все 6 предшественников`);
    for (const predecessor of predecessors) {
      setInputValue(predecessor, "");
    }
    pressEnter(titleInput);
    await waitForRowClean(
      rowId,
      (updatedRow) =>
        rowTitle(updatedRow) === title &&
        rowCellByHeader(updatedRow, "ИСПОЛНИТЕЛЬ").querySelector("input")?.value === owner &&
        updatedRow.querySelectorAll(".wbs-predecessor-input").length === 6 &&
        [...updatedRow.querySelectorAll(".wbs-predecessor-input")].every(
          (input) => input.value === "",
        ),
      `сохранение текста строки «${title}»`,
    );
  }

  async function saveRowDates(rowId, start, due) {
    assertNotAborted();
    const row = currentRow(rowId);
    const startInput = rowCellByHeader(row, "СТАРТ").querySelector('input[type="date"]');
    const dueInput = rowCellByHeader(row, "СРОК").querySelector('input[type="date"]');
    setInputValue(startInput, start);
    setInputValue(dueInput, due);
    pressEnter(dueInput);
    await waitForRowClean(
      rowId,
      (updatedRow) =>
        rowCellByHeader(updatedRow, "СТАРТ").querySelector('input[type="date"]')?.value === start &&
        rowCellByHeader(updatedRow, "СРОК").querySelector('input[type="date"]')?.value === due,
      `сохранение дат ${start} - ${due}`,
    );
  }

  async function configureWbsRow(rowId, item) {
    assertNotAborted();
    if (rowLevel(currentRow(rowId)) !== item.level) {
      await saveInput(
        rowId,
        (row) => row.querySelector(".wbs-level-input"),
        String(item.level),
        `уровень ${item.level} для «${item.title}»`,
      );
    }
    await saveSelect(rowId, rowTypeSelect, item.type, `тип ${item.type} для «${item.title}»`);
    await saveSelect(
      rowId,
      rowStatusSelect,
      "NOT_STARTED",
      `статус «Не начата» для «${item.title}»`,
    );
    await saveRowTextFields(rowId, item.title, "Не назначен");
    await saveRowDates(rowId, item.start, item.due);
    await saveSelect(rowId, rowCalendarSelect, "RU", `календарь RU для «${item.title}»`);
  }

  async function repairPhaseDates() {
    await expandWbsToLevelFive();
    validateRootPhases({ checkDates: false });
    assert(
      wbsRows().length === PHASES.length,
      `Восстановление дат разрешено только без пакетов: найдено строк ${wbsRows().length}`,
    );
    for (const phase of PHASES) {
      assertNotAborted();
      const { phaseRow, children } = phaseChildren(phase.title);
      assert(children.length === 0, `У фазы ${phase.title} неожиданно есть дочерние строки`);
      const actual = rowSnapshot(phaseRow);
      if (actual.start === phase.start && actual.due === phase.due) continue;
      const mutation = beginMutation(
        "phase-dates-repair",
        `${phase.title}: ${actual.start} - ${actual.due} -> ${phase.start} - ${phase.due}`,
      );
      await saveRowDates(phaseRow.id, phase.start, phase.due);
      confirmMutation(mutation);
    }
    validatePhasesOnly();
  }

  function rowSnapshot(row) {
    return {
      code: row.querySelector(".wbs-code-input")?.value ?? "",
      title: rowTitle(row),
      level: rowLevel(row),
      type: rowTypeSelect(row)?.value ?? "",
      status: rowStatusSelect(row)?.value ?? "",
      owner: rowCellByHeader(row, "ИСПОЛНИТЕЛЬ").querySelector("input")?.value ?? "",
      start: rowCellByHeader(row, "СТАРТ").querySelector('input[type="date"]')?.value ?? "",
      due: rowCellByHeader(row, "СРОК").querySelector('input[type="date"]')?.value ?? "",
      calendar: rowCalendarSelect(row)?.value ?? "",
      predecessors: [...row.querySelectorAll(".wbs-predecessor-input")].map(
        (input) => input.value,
      ),
    };
  }

  function assertRowMatches(row, item) {
    const actual = rowSnapshot(row);
    assert(actual.title === item.title, `Ожидалась строка «${item.title}», получена «${actual.title}»`);
    assert(actual.level === item.level, `Неверный уровень у «${item.title}»: ${actual.level}`);
    assert(actual.type === item.type, `Неверный тип у «${item.title}»: ${actual.type}`);
    assert(actual.status === "NOT_STARTED", `Неверный статус у «${item.title}»: ${actual.status}`);
    assert(actual.owner === "Не назначен", `Неверный исполнитель у «${item.title}»`);
    assert(actual.start === item.start, `Неверный старт у «${item.title}»: ${actual.start}`);
    assert(actual.due === item.due, `Неверный срок у «${item.title}»: ${actual.due}`);
    assert(actual.calendar === "RU", `Неверный календарь у «${item.title}»: ${actual.calendar}`);
    assert(actual.predecessors.length === 6, `У «${item.title}» видны не все 6 предшественников`);
    assert(actual.predecessors.every((value) => value === ""), `У «${item.title}» остались зависимости`);
  }

  async function expandWbsToLevelFive() {
    const button = await waitFor(
      () => document.querySelector('button[title="Показать структуру до 5 уровня"]'),
      "кнопка глубины Структуры 5",
    );
    button.click();
    await sleep(250);
  }

  function preflightOrigin() {
    assert(location.origin === PROD_ORIGIN, `Запрещенный домен: ${location.origin}`);
  }

  async function preflightWbsTable() {
    preflightOrigin();
    const table = await waitFor(
      () => document.querySelector(".wbs-excel-table"),
      "таблица Структуры",
      60000,
    );
    const row = await waitFor(() => wbsRows()[0], "редактируемая строка Структуры", 60000);
    assert(!document.querySelector(".closed-project-banner"), "Открыт закрытый проект");
    assert(!row.querySelector(".wbs-readonly-control"), "Структура доступна только для чтения");

    for (const label of [
      "Структура",
      "Тип",
      "Статус",
      "Исполнитель",
      "Старт",
      "Срок",
      "Календарь",
      "Предшественник 1",
      "Предшественник 2",
      "Предшественник 3",
      "Предшественник 4",
      "Предшественник 5",
      "Предшественник 6",
    ]) {
      assert(headerIndex(label) >= 0, `Перед изменениями должна быть видна колонка «${label}»`);
    }
    const title = row.querySelector(".wbs-title-input");
    const level = row.querySelector(".wbs-level-input");
    const checkbox = row.querySelector(".wbs-row-select");
    const deleteButton = row.querySelector(".wbs-row-delete-button");
    const insertButton = row.querySelector(".wbs-inline-insert-button");
    assert(title && !title.readOnly && !title.disabled, "Название строки нельзя редактировать");
    assert(level && !level.readOnly && !level.disabled, "Уровень строки нельзя редактировать");
    assert(checkbox && !checkbox.disabled, "Строку нельзя выбрать");
    assert(deleteButton && !deleteButton.disabled, "Строку нельзя удалить");
    assert(insertButton && !insertButton.disabled, "После строки нельзя добавить строку");
    assert(rowTypeSelect(row) && !rowTypeSelect(row).disabled, "Тип строки нельзя изменить");
    assert(rowStatusSelect(row) && !rowStatusSelect(row).disabled, "Статус строки нельзя изменить");
    assert(rowCalendarSelect(row) && !rowCalendarSelect(row).disabled, "Календарь строки нельзя изменить");
    assert(
      row.querySelectorAll(".wbs-predecessor-input").length === 6,
      "В строке должны быть видны все 6 полей предшественников",
    );

    const owner = rowCellByHeader(row, "Исполнитель").querySelector("input");
    const start = rowCellByHeader(row, "Старт").querySelector('input[type="date"]');
    const due = rowCellByHeader(row, "Срок").querySelector('input[type="date"]');
    assert(owner && !owner.readOnly && !owner.disabled, "Исполнителя нельзя редактировать");
    assert(start && !start.readOnly && !start.disabled, "Дату старта нельзя редактировать");
    assert(due && !due.readOnly && !due.disabled, "Дату срока нельзя редактировать");
    assert(table.contains(row), "Строка не принадлежит таблице Структуры");
  }

  function assertProjectIsDraftOnWbsPage() {
    assert(
      document.body.innerText.includes("Статус: Черновик"),
      `Проект ${PROJECT.code} должен оставаться в статусе DRAFT`,
    );
  }

  async function preflightCreatePage() {
    preflightOrigin();
    assert(location.pathname === "/new-project", `Ожидалась страница /new-project, открыта ${location.pathname}`);
    const form = await waitFor(
      () => document.querySelector("form.compact-form"),
      "форма создания проекта",
    );
    const businessUnit = form.querySelector(".project-create-business-unit select");
    assert(businessUnit, "Не найдено поле БЮ в форме проекта");
    await waitFor(
      () =>
        [...businessUnit.options].some(
          (option) =>
            option.value === PROJECT.businessUnitId &&
            option.textContent.trim() === PROJECT.businessUnitName,
        ),
      `загрузка БЮ ${PROJECT.businessUnitName}`,
    );
    const topBusinessUnit = document.querySelector('select[aria-label="Бизнес-юнит"]');
    assert(topBusinessUnit?.value === PROJECT.businessUnitId, "В верхней панели выбран не TV&Box");
    assert(form.querySelector('.structure-copy-trigger')?.textContent.includes("Не копировать"), "Выбрано копирование чужой Структуры");
    const parentSelect = fieldByLabel(form, "Родительский проект");
    assert(parentSelect, "Не найдено поле родительского проекта");
    assert(
      ![...parentSelect.options].some((option) => option.textContent.includes(PROJECT.code)),
      `Проект ${PROJECT.code} уже существует`,
    );
    return form;
  }

  async function assertProjectAbsentViaUi() {
    log("check-project-absence");
    const adminButton = buttonByExactText("Администрирование");
    assert(adminButton, "Не найдена кнопка «Администрирование»");
    adminButton.click();
    const adminTable = await waitFor(
      () => document.querySelector(".project-admin-table"),
      "реестр активных проектов",
      60000,
    );
    const activeCodes = [...adminTable.querySelectorAll(".project-admin-row")]
      .map((row) => row.querySelector("input")?.value?.trim())
      .filter(Boolean);
    assert(!activeCodes.includes(PROJECT.code), `Активный проект ${PROJECT.code} уже существует`);

    const archiveButton = buttonByExactText("Архив");
    assert(archiveButton, "Не найдена кнопка «Архив»");
    archiveButton.click();
    const archive = await waitFor(
      () =>
        [...document.querySelectorAll("h2")].some(
          (heading) => heading.textContent.trim() === "Закрытые проекты",
        )
          ? document.querySelector(".project-tree-list")
          : null,
      "архив проектов",
      60000,
    );
    const closedCodes = [...archive.querySelectorAll(".project-tree-code-static")].map(
      (item) => item.textContent.trim(),
    );
    assert(!closedCodes.includes(PROJECT.code), `Закрытый проект ${PROJECT.code} уже существует`);

    const returnToAdminButton = buttonByExactText("Администрирование");
    assert(returnToAdminButton, "Не найдена кнопка возврата в администрирование");
    returnToAdminButton.click();
    const returnedAdminTable = await waitFor(
      () => document.querySelector(".project-admin-table"),
      "возврат в реестр проектов",
      60000,
    );
    const createButton = buttonByExactText("Создать проект", returnedAdminTable.parentElement);
    assert(createButton, "Не найдена кнопка возврата к созданию проекта");
    createButton.click();
    await preflightCreatePage();
  }

  async function createProjectThroughForm() {
    const form = await preflightCreatePage();
    log("fill-project-form");
    setInputValue(form.querySelector('input[placeholder="CRM"]'), PROJECT.code);
    setInputValue(form.querySelector('input[placeholder="Миграция CRM"]'), PROJECT.name);
    setSelectValue(fieldByLabel(form, "Родительский проект"), "");
    setInputValue(fieldByLabel(form, "Порядок"), "0");
    setSelectValue(form.querySelector(".project-create-business-unit select"), PROJECT.businessUnitId);
    setInputValue(form.querySelector('input[placeholder="Руководитель проекта"]'), PROJECT.projectManager);
    setInputValue(
      form.querySelector('input[placeholder="Финансовый директор / ИТ-директор"]'),
      PROJECT.sponsor,
    );
    setSelectValue(fieldByLabel(form, "Индикатор"), "GREEN");
    setInputValue(fieldByLabel(form, "Старт"), PROJECT.start);
    setInputValue(fieldByLabel(form, "Целевая дата"), PROJECT.due);
    setInputValue(fieldByLabel(form, "Прогресс"), "0");
    setInputValue(fieldByLabel(form, "Отклонение сроков"), "0");
    setInputValue(fieldByLabel(form, "Сводка"), PROJECT.summary);
    await sleep(200);

    assert(form.querySelector('input[placeholder="CRM"]').value === PROJECT.code, "Код не попал в форму");
    assert(form.querySelector('input[placeholder="Миграция CRM"]').value === PROJECT.name, "Название не попало в форму");
    log("submit-project-form");
    const submitButton = buttonByExactText("Создать проект", form);
    assert(submitButton, "Не найдена кнопка отправки формы проекта");
    const projectMutation = beginMutation(
      "project-create",
      `${PROJECT.code} в ${PROJECT.businessUnitName}`,
    );
    submitButton.click();

    const nextStep = await waitFor(
      () => {
        const dialog = [...document.querySelectorAll('[role="dialog"]')].find((item) =>
          item.textContent.includes("Создать проект?"),
        );
        if (dialog) return { dialog };
        if (
          location.pathname.endsWith("/wbs") &&
          [...document.querySelectorAll("button")].some(
            (button) => button.textContent.trim() === PROJECT.code,
          )
        ) {
          return { created: true };
        }
        return null;
      },
      "подтверждение или завершение создания проекта",
      90000,
    );
    if (nextStep.dialog) {
      const confirmButton = buttonByExactText("Создать", nextStep.dialog);
      assert(confirmButton, "В подтверждении нет кнопки «Создать»");
      confirmButton.click();
    }

    await waitFor(
      () =>
        location.pathname.endsWith("/wbs") &&
        [...document.querySelectorAll("button")].some(
          (button) => button.textContent.trim() === PROJECT.code,
        ),
      `открытие Структуры ${PROJECT.code}`,
      90000,
    );
    confirmMutation(projectMutation);
    log("project-created", location.pathname);
  }

  async function replaceDefaultStructureWithPhases() {
    await preflightWbsTable();
    await expandWbsToLevelFive();
    const rows = await waitFor(
      () => (wbsRows().length === DEFAULT_STRUCTURE_TITLES.length ? wbsRows() : null),
      "10 строк тестовой Структуры",
      60000,
    );
    const titles = rows.map(rowTitle);
    assert(
      JSON.stringify(titles) === JSON.stringify(DEFAULT_STRUCTURE_TITLES),
      `Тестовая Структура отличается от ожидаемой: ${JSON.stringify(titles)}`,
    );

    log("delete-unused-default-rows");
    rows.forEach((row, index) => {
      if (!RETAINED_DEFAULT_ROW_INDEXES.has(index)) {
        row.querySelector(".wbs-row-select").click();
      }
    });
    await waitFor(
      () => document.querySelector(".wbs-bulk-toolbar")?.textContent.includes("Выбрано: 7"),
      "выбор 7 лишних строк",
    );
    const deleteButton = buttonByExactText(
      "Удалить выбранные",
      document.querySelector(".wbs-bulk-toolbar"),
    );
    assert(deleteButton, "Не найдена кнопка удаления выбранных строк");
    deleteButton.click();
    const dialog = await waitFor(
      () => [...document.querySelectorAll('[role="dialog"]')].find((item) => item.textContent.includes("Удалить выбранные элементы?")),
      "подтверждение удаления тестовых строк",
    );
    const deleteMutation = beginMutation(
      "default-wbs-bulk-delete",
      "Попытка удалить 7 строк; должны остаться seed-строки 7, 8 и 9",
    );
    buttonByExactText("Удалить", dialog).click();

    const retainedRows = await waitFor(
      () => (wbsRows().length === 3 ? wbsRows() : null),
      "три оставшиеся строки",
      60000,
    );
    const retainedTitles = retainedRows.map(rowTitle);
    const expectedRetained = [...RETAINED_DEFAULT_ROW_INDEXES].map(
      (index) => DEFAULT_STRUCTURE_TITLES[index],
    );
    assert(
      JSON.stringify(retainedTitles) === JSON.stringify([...expectedRetained]),
      `После удаления остались неожиданные строки: ${JSON.stringify(retainedTitles)}`,
    );
    assert(retainedRows.every((row) => rowLevel(row) === 1), "Оставшиеся строки не стали корневыми");
    confirmMutation(deleteMutation, "Удалены 7 строк; оставлены 3 строки с progress=0");

    log("configure-phases");
    for (let index = 0; index < PHASES.length; index += 1) {
      const phase = PHASES[index];
      const rowId = wbsRows()[index]?.id;
      assert(rowId, `Нет строки для фазы ${phase.title}`);
      const phaseMutation = beginMutation(
        "phase-configure",
        `${phase.title}: ${phase.start} - ${phase.due}`,
      );
      await configureWbsRow(rowId, {
        title: phase.title,
        type: "PHASE",
        level: 1,
        start: phase.start,
        due: phase.due,
      });
      confirmMutation(phaseMutation);
    }
    validatePhasesOnly();
  }

  function validatePhasesOnly() {
    const rows = wbsRows();
    assert(rows.length === 3, `Ожидалось 3 фазы, найдено строк: ${rows.length}`);
    PHASES.forEach((phase, index) => {
      assertRowMatches(rows[index], {
        title: phase.title,
        type: "PHASE",
        level: 1,
        start: phase.start,
        due: phase.due,
      });
    });
  }

  function validateRootPhases({ checkDates = true } = {}) {
    const roots = wbsRows().filter((row) => rowLevel(row) === 1);
    assert(roots.length === 3, `Ожидалось 3 корневые фазы, найдено: ${roots.length}`);
    PHASES.forEach((phase, index) => {
      if (checkDates) {
        assertRowMatches(roots[index], {
          title: phase.title,
          type: "PHASE",
          level: 1,
          start: phase.start,
          due: phase.due,
        });
        return;
      }
      const actual = rowSnapshot(roots[index]);
      assert(actual.title === phase.title, `Неверная корневая фаза: ${actual.title}`);
      assert(actual.level === 1 && actual.type === "PHASE", `Неверный тип фазы ${phase.title}`);
      assert(actual.status === "NOT_STARTED", `Неверный статус фазы ${phase.title}`);
      assert(actual.owner === "Не назначен", `Неверный исполнитель фазы ${phase.title}`);
      assert(actual.calendar === "RU", `Неверный календарь фазы ${phase.title}`);
      assert(actual.predecessors.length === 6, `У фазы ${phase.title} видны не все предшественники`);
      assert(actual.predecessors.every((value) => value === ""), `У фазы ${phase.title} есть зависимости`);
    });
  }

  function phaseChildren(phaseTitle) {
    const rows = wbsRows();
    const phaseIndex = rows.findIndex(
      (row) => rowLevel(row) === 1 && rowTitle(row) === phaseTitle,
    );
    assert(phaseIndex >= 0, `Не найдена фаза ${phaseTitle}`);
    const children = [];
    for (let index = phaseIndex + 1; index < rows.length; index += 1) {
      if (rowLevel(rows[index]) === 1) break;
      children.push(rows[index]);
    }
    return { phaseRow: rows[phaseIndex], children };
  }

  function validatePackageImportProgress({ requireEmpty = false, checkPhaseDates = false } = {}) {
    const existingPackageCount = PHASES.reduce(
      (sum, phase) => sum + phaseChildren(phase.title).children.length,
      0,
    );
    validateRootPhases({ checkDates: checkPhaseDates });
    assert(
      wbsRows().length === PHASES.length + existingPackageCount,
      "В Структуре есть строки вне трех ожидаемых фаз и их прямых дочерних пакетов",
    );
    if (requireEmpty) {
      assert(existingPackageCount === 0, `Импорт должен начинаться без пакетов, найдено: ${existingPackageCount}`);
    }
    const existingByPhase = {};
    for (const phase of PHASES) {
      const current = phaseChildren(phase.title);
      assert(
        current.children.length <= phase.packages.length,
        `В фазе ${phase.title} уже больше пакетов, чем в шаблоне`,
      );
      current.children.forEach((row, index) => {
        const [title, start, due] = phase.packages[index];
        assertRowMatches(row, {
          title,
          start,
          due,
          type: "WORK_PACKAGE",
          level: 2,
        });
      });
      existingByPhase[phase.title] = current.children.length;
    }
    return { existingPackageCount, existingByPhase };
  }

  async function addMissingPackages() {
    await expandWbsToLevelFive();
    const startingPoint = validatePackageImportProgress({
      requireEmpty: true,
      checkPhaseDates: true,
    });
    let confirmedPackageCount = startingPoint.existingPackageCount;
    for (const phase of PHASES) {
      let current = phaseChildren(phase.title);

      for (let index = current.children.length; index < phase.packages.length; index += 1) {
        assertNotAborted();
        await expandWbsToLevelFive();
        const progress = validatePackageImportProgress();
        assert(
          progress.existingPackageCount === confirmedPackageCount,
          `Перед вставкой ожидалось ${confirmedPackageCount} пакетов, найдено ${progress.existingPackageCount}`,
        );
        current = phaseChildren(phase.title);
        assert(
          current.children.length === index,
          `Перед вставкой ${phase.title} ${index + 1} найдено ${current.children.length} дочерних строк`,
        );
        const [title, start, due] = phase.packages[index];
        const rowsBefore = wbsRows();
        const beforeCount = rowsBefore.length;
        assert(
          beforeCount === PHASES.length + confirmedPackageCount,
          `Перед вставкой ожидалось ${PHASES.length + confirmedPackageCount} строк, найдено ${beforeCount}`,
        );
        const rootsBefore = rowsBefore.filter((row) => rowLevel(row) === 1);
        assert(rootsBefore.length === 3, `Перед вставкой найдено корневых фаз: ${rootsBefore.length}`);
        const insertAfter = current.children.at(-1) ?? current.phaseRow;
        const insertAfterIndex = rowsBefore.findIndex((row) => row.id === insertAfter.id);
        assert(insertAfterIndex >= 0, `Не найдена позиция вставки для «${title}»`);
        assert(
          rowsBefore[insertAfterIndex]?.id === insertAfter.id,
          `Перед вставкой изменилась целевая строка для «${title}»`,
        );
        const beforeItem = rowsBefore[insertAfterIndex + 1] ?? null;
        const expectedInitialLevel = beforeItem ? rowLevel(beforeItem) : rowLevel(insertAfter);
        assert(
          expectedInitialLevel === 1 || expectedInitialLevel === 2,
          `Новая строка «${title}» получила бы недопустимый начальный уровень ${expectedInitialLevel}`,
        );
        log("insert-package", `${phase.title} ${index + 1}/${phase.packages.length}: ${title}`);
        const packageMutation = beginMutation(
          "package-insert-and-configure",
          `${phase.title} ${index + 1}: ${title}`,
        );
        insertAfter.querySelector(".wbs-inline-insert-button").click();
        await waitFor(
          () => wbsRows().length === beforeCount + 1,
          `добавление пакета «${title}»`,
          60000,
        );
        const rowsAfterInsert = wbsRows();
        const inserted = rowsAfterInsert[insertAfterIndex + 1];
        assert(inserted, `Не найдена новая строка пакета «${title}»`);
        assert(rowTitle(inserted) === "", `Новая строка для «${title}» оказалась непустой`);
        assert(
          rowLevel(inserted) === expectedInitialLevel,
          `Новая строка «${title}» вставлена на уровне ${rowLevel(inserted)}, ожидался ${expectedInitialLevel}`,
        );
        const expectedRootsAfterInsert = 3 + (expectedInitialLevel === 1 ? 1 : 0);
        assert(
          rowsAfterInsert.filter((row) => rowLevel(row) === 1).length === expectedRootsAfterInsert,
          `После вставки «${title}» нарушено ожидаемое число корневых строк`,
        );
        await configureWbsRow(inserted.id, {
          title,
          start,
          due,
          type: "WORK_PACKAGE",
          level: 2,
        });
        await expandWbsToLevelFive();
        const rowsAfterConfigure = wbsRows();
        assert(
          rowsAfterConfigure.length === beforeCount + 1,
          `После настройки «${title}» ожидалось ${beforeCount + 1} строк`,
        );
        assert(
          rowsAfterConfigure.filter((row) => rowLevel(row) === 1).length === 3,
          `После перевода «${title}» на второй уровень должно остаться 3 корневые фазы`,
        );
        const configured = document.getElementById(inserted.id);
        assert(configured, `Настроенная строка «${title}» исчезла`);
        assertRowMatches(configured, {
          title,
          start,
          due,
          type: "WORK_PACKAGE",
          level: 2,
        });
        confirmMutation(packageMutation);
        confirmedPackageCount += 1;
        current = phaseChildren(phase.title);
        assert(
          current.children[index]?.id === inserted.id,
          `Пакет «${title}» оказался не на ожидаемой позиции ${index + 1} в фазе ${phase.title}`,
        );
      }
    }
  }

  function validateFullStructure() {
    const expectedCount = PHASES.length + PHASES.reduce((sum, phase) => sum + phase.packages.length, 0);
    assert(wbsRows().length === expectedCount, `Ожидалось ${expectedCount} строк, найдено ${wbsRows().length}`);
    for (const phase of PHASES) {
      const current = phaseChildren(phase.title);
      assertRowMatches(current.phaseRow, {
        title: phase.title,
        type: "PHASE",
        level: 1,
        start: phase.start,
        due: phase.due,
      });
      assert(current.children.length === phase.packages.length, `Неверное число пакетов в ${phase.title}`);
      current.children.forEach((row, index) => {
        const [title, start, due] = phase.packages[index];
        assertRowMatches(row, {
          title,
          start,
          due,
          type: "WORK_PACKAGE",
          level: 2,
        });
      });
    }
  }

  async function setProjectStatus(status) {
    log("set-project-status", status);
    const adminButton = buttonByExactText("Администрирование");
    assert(adminButton, "Не найдена кнопка «Администрирование»");
    adminButton.click();
    const projectRow = await waitFor(
      () =>
        [...document.querySelectorAll(".project-admin-row")].find(
          (row) => row.querySelector("input")?.value === PROJECT.code,
        ),
      `строка ${PROJECT.code} в администрировании`,
      60000,
    );
    const statusLabel = [...projectRow.querySelectorAll("label")].find(
      (label) => label.querySelector(":scope > span")?.textContent.trim() === "Статус",
    );
    const statusSelect = statusLabel?.querySelector("select");
    assert(statusSelect, `Не найден статус проекта ${PROJECT.code}`);
    const statusMutation = beginMutation(
      "project-status-update",
      `${PROJECT.code}: ${statusSelect.value} -> ${status}`,
    );
    if (statusSelect.value !== status) setSelectValue(statusSelect, status);
    await waitFor(
      () => {
        const row = [...document.querySelectorAll(".project-admin-row")].find(
          (candidate) => candidate.querySelector("input")?.value === PROJECT.code,
        );
        const label = row
          ? [...row.querySelectorAll("label")].find(
              (candidate) => candidate.querySelector(":scope > span")?.textContent.trim() === "Статус",
            )
          : null;
        return label?.querySelector("select")?.value === status;
      },
      `сохранение статуса ${status}`,
      60000,
    );
    await sleep(1800);
    confirmMutation(statusMutation, `${PROJECT.code}: ${status}`);
  }

  async function run() {
    preflightOrigin();
    assert(
      ["dry-run", "full-dry-run", "phases-only", "repair-phases", "full", "full-verify"].includes(
        state.mode,
      ),
      `Неизвестный режим: ${state.mode}`,
    );

    if (state.mode === "dry-run") {
      await preflightCreatePage();
      await assertProjectAbsentViaUi();
      const structureButton = buttonByExactText("Структура");
      assert(structureButton, "Нет выбранного редактируемого проекта для проверки WBS UI");
      structureButton.click();
      await waitFor(
        () => location.pathname.endsWith("/wbs") && document.querySelector(".wbs-excel-table"),
        "переход к существующей Структуре для dry-run",
        60000,
      );
      await preflightWbsTable();
      state.result = {
        message: "Проверки формы и редактируемой WBS-таблицы пройдены; prod не изменен",
        project: PROJECT.code,
        phases: PHASES.length,
        packagesPrepared: PHASES.reduce((sum, phase) => sum + phase.packages.length, 0),
      };
      return;
    }

    if (state.mode === "full-dry-run") {
      assert(
        location.pathname === `/${PROJECT.code}/wbs`,
        `Проверка полного импорта разрешена только со страницы /${PROJECT.code}/wbs`,
      );
      await preflightWbsTable();
      assertProjectIsDraftOnWbsPage();
      await expandWbsToLevelFive();
      const startingPoint = validatePackageImportProgress({
        requireEmpty: true,
        checkPhaseDates: true,
      });
      state.result = {
        message: "Проверка полного импорта пройдена; prod не изменен",
        projectUrl: `${PROD_ORIGIN}/${PROJECT.code}/wbs`,
        statusExpected: "DRAFT",
        ...startingPoint,
        packagesRemaining:
          PHASES.reduce((sum, phase) => sum + phase.packages.length, 0) -
          startingPoint.existingPackageCount,
      };
      return;
    }

    if (state.mode === "repair-phases") {
      assert(
        options.mutationToken === "REPAIR_TEMPLATE_V2_PHASE_DATES",
        "Нет защитного токена для восстановления дат фаз",
      );
      assert(
        location.pathname === `/${PROJECT.code}/wbs`,
        `Восстановление дат разрешено только со страницы /${PROJECT.code}/wbs`,
      );
      await preflightWbsTable();
      assertProjectIsDraftOnWbsPage();
      await repairPhaseDates();
      assertProjectIsDraftOnWbsPage();
      state.result = {
        message: "Даты трех фаз восстановлены через UI; проект оставлен в DRAFT",
        projectUrl: `${PROD_ORIGIN}/${PROJECT.code}/wbs`,
        status: "DRAFT",
        phases: PHASES.map(({ title, start, due }) => ({ title, start, due })),
      };
      return;
    }

    if (state.mode === "full-verify") {
      assert(
        location.pathname === `/${PROJECT.code}/wbs`,
        `Итоговая проверка разрешена только со страницы /${PROJECT.code}/wbs`,
      );
      const previousRun = readPersistedState();
      assert(previousRun?.mode === "full", "Не найден сохраненный журнал полного импорта");
      assert(previousRun?.status === "complete", "Сохраненный полный импорт не завершен успешно");
      await preflightWbsTable();
      assertProjectIsDraftOnWbsPage();
      await expandWbsToLevelFive();
      validateFullStructure();
      state.result = {
        message: "Полная Структура проверена после нового открытия страницы",
        projectUrl: `${PROD_ORIGIN}/${PROJECT.code}/wbs`,
        status: "DRAFT",
        phases: PHASES.length,
        packagesVerified: PHASES.reduce((sum, phase) => sum + phase.packages.length, 0),
        importedByRunId: previousRun.runId,
        confirmedMutations: previousRun.mutationLedger.filter(
          (entry) => entry.status === "confirmed",
        ).length,
      };
      return;
    }

    if (state.mode === "phases-only") {
      assert(
        options.mutationToken === "CREATE_TEMPLATE_V2_PHASES",
        "Нет защитного токена для создания проекта и фаз",
      );
      await preflightCreatePage();
      await assertProjectAbsentViaUi();
      await createProjectThroughForm();
      await replaceDefaultStructureWithPhases();
      await setProjectStatus("DRAFT");
      state.result = {
        message: "Проект и три фазы созданы через UI; пакеты работ не запускались",
        projectUrl: `${PROD_ORIGIN}/${PROJECT.code}/wbs`,
        status: "DRAFT",
        phases: PHASES.map(({ title, start, due }) => ({ title, start, due })),
        packagesCreated: 0,
      };
      return;
    }

    assert(
      options.mutationToken === "IMPORT_TEMPLATE_V2_PACKAGES",
      "Полный импорт заблокирован: нужен отдельный защитный токен",
    );
    assert(
      location.pathname === `/${PROJECT.code}/wbs`,
      `Полный импорт разрешен только со страницы /${PROJECT.code}/wbs`,
    );
    await preflightWbsTable();
    assertProjectIsDraftOnWbsPage();
    await addMissingPackages();
    validateFullStructure();
    assertProjectIsDraftOnWbsPage();
    state.result = {
      message: "Полная Структура создана через UI; проект оставлен в DRAFT",
      projectUrl: `${PROD_ORIGIN}/${PROJECT.code}/wbs`,
      status: "DRAFT",
      phases: PHASES.length,
      packagesCreatedOrVerified: PHASES.reduce((sum, phase) => sum + phase.packages.length, 0),
    };
  }

  void run()
    .then(() => {
      state.status = "complete";
      state.step = "complete";
      state.finishedAt = new Date().toISOString();
      persistState();
    })
    .catch((error) => {
      state.status = "error";
      state.step = "error";
      state.error = {
        message: error instanceof Error ? error.message : String(error),
        mutationLedger: state.mutationLedger.map((entry) => ({ ...entry })),
      };
      state.finishedAt = new Date().toISOString();
      persistState();
      console.error("TEMPLATE-V2 UI import failed", error);
    });

  return JSON.stringify({ status: state.status, mode: state.mode, step: state.step });
})();
