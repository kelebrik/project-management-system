/**
 * «Что нового» of the cloud build, newest first. Written by hand for people,
 * not generated from commits; one entry per noticeable change.
 */
export type ReleaseNote = { date: string; ru: { title: string; points: string[] }; en: { title: string; points: string[] } };

export const RELEASE_NOTES: ReleaseNote[] = [
  {
    date: "2026-10-03",
    ru: {
      title: "Новое окно создания проекта, личный вид Структуры, отчёты по портфелю",
      points: [
        "Структура на тысячи строк раскрывается и правится без задержек: на странице держатся только видимые строки. Печать и поиск Ctrl+F по-прежнему видят всю таблицу.",
        "Список проектов загружается в десятки раз быстрее: сервер сжимает ответы и не отправляет лишние поля.",
        "Новый проект создаётся в окне поверх страницы, в три шага: проект, команда (бизнес-заказчик, владелец продукта, HW и SW TPM), Структура — типовая, из других проектов или из Excel / Google Таблиц.",
        "Вид Структуры теперь у каждого свой: колонки, их ширина, сортировка и уровень не меняются у коллег.",
        "«Отчёты» вернулись в верхнее меню: сводка портфеля, сдвиги вех, ближайшие вехи, красные риски и решения — с выгрузкой в Excel.",
        "Правка названия или комментария в большой Структуре сохраняется почти вдвое быстрее.",
        "Исправлено: перестановка колонок Структуры больше не сбрасывает статус, RAG и прогресс проекта; правка одного поля риска не возвращает его в «Открыт».",
        "Убраны пустые настройки «Формулы RAG» и «Workflow согласований», которые ни на что не влияли.",
        "Здесь же можно сообщить о проблеме — обращение увидят администраторы.",
      ],
    },
    en: {
      title: "A new project dialog, a personal Structure view, portfolio reports",
      points: [
        "A Structure of thousands of rows expands and edits without delay: only the rows in view are kept in the page. Printing and Ctrl+F still see the whole table.",
        "The project list loads many times faster: the server compresses its answers and sends no needless fields.",
        "A new project is created in a dialog over the page, in three steps: the project, the team (business customer, product owner, HW and SW TPM) and the Structure: standard, copied from other projects, or from Excel / Google Sheets.",
        "Everyone now has their own view of the Structure: columns, widths, sorting and level do not change for colleagues.",
        "Reports are back in the top bar: portfolio summary, milestone shifts, upcoming milestones, red risks and decisions, with Excel export.",
        "Editing a title or a comment in a large Structure saves almost twice as fast.",
        "Fixed: moving Structure columns no longer resets the project's status, RAG and progress; editing one field of a risk no longer sends it back to Open.",
        "The empty «RAG formulas» and «Approval workflows» settings, which had no effect, are gone.",
        "You can report a problem from here; the administrators will see it.",
      ],
    },
  },
  {
    date: "2026-10-02",
    ru: {
      title: "Загрузка: новая работа протягиванием и планировщики",
      points: [
        "На странице «Загрузка» протяните по свободным дням человека — откроется окно новой работы с этими датами; работа попадёт в Структуру выбранного проекта.",
        "Наборы фильтров сохраняются как планировщики — личные или общие.",
        "Перенос полос учитывает календарь проекта: праздники и переносы рабочих дней.",
      ],
    },
    en: {
      title: "Workload: new work by dragging, and planners",
      points: [
        "On the Workload page, drag across a person's free days to open a new piece of work with those dates; it goes into the chosen project's Structure.",
        "Filter sets are saved as planners, private or shared.",
        "Moving bars follows the project calendar: holidays and moved working days.",
      ],
    },
  },
  {
    date: "2026-10-01",
    ru: {
      title: "Правила, «Мои задачи», Excel и Google Таблицы",
      points: [
        "Правила-автоматизации (раздел «В разработке»): уведомления о сдвиге вех, блокерах, пропущенных отметках, исчерпанном запасе и закрытых в Jira задачах.",
        "«Мои задачи» с еженедельной отметкой: что сделано, что мешает, уверенность в сроке.",
        "Структуру можно выгрузить в Excel и загрузить обратно, в том числе вставкой из Google Таблиц.",
      ],
    },
    en: {
      title: "Rules, My work, Excel and Google Sheets",
      points: [
        "Automation rules (Development section): notices about moved milestones, blockers, missed check-ins, exhausted float and work closed in Jira.",
        "My work with a weekly check-in: what is done, what blocks, how sure the date is.",
        "The Structure can be exported to Excel and imported back, including by pasting from Google Sheets.",
      ],
    },
  },
];
