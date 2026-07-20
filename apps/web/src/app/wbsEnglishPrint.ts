import type { WbsItemStatus, WbsItemType } from "./domainTypes";
import type { WbsTableColumnKey } from "./wbsTable";

export const WBS_COLUMN_EN_LABELS: Record<WbsTableColumnKey, string> = {
  level: "Level",
  structure: "Structure",
  type: "Type",
  status: "Status",
  owner: "Assignee",
  comment: "Comment",
  start: "Start",
  due: "Due date",
  workDays: "Work days",
  calendarDays: "Calendar days",
  calendar: "Calendar",
  effortPercent: "Effort, %",
  progress: "%",
  jiraTicketUrl: "Jira URL",
  predecessor1: "Predecessor 1",
  predecessor2: "Predecessor 2",
  predecessor3: "Predecessor 3",
  predecessor4: "Predecessor 4",
  predecessor5: "Predecessor 5",
  predecessor6: "Predecessor 6",
  leadLag: "Offset",
};

export const WBS_TYPE_EN_LABELS: Record<WbsItemType, string> = {
  PHASE: "Phase",
  WORK_PACKAGE: "Work package",
  DELIVERABLE: "Result",
  MILESTONE: "Milestone",
  GOAL: "Goal",
  TASK: "Task",
};

export const WBS_STATUS_EN_LABELS: Record<WbsItemStatus, string> = {
  NOT_STARTED: "Not started",
  IN_PROGRESS: "In progress",
  IN_REVIEW: "In review",
  AT_RISK: "At risk",
  BLOCKED: "Failed",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

export type WbsEnglishTranslationSource =
  | "manual"
  | "glossary"
  | "cache"
  | "legacy-code"
  | "original";

export type WbsEnglishTranslation = {
  text: string;
  source: WbsEnglishTranslationSource;
};

export type WbsEnglishTranslationMap = Record<string, string>;

export type WbsEnglishTranslationExportRow = {
  code: string;
  sourceTitle: string;
  translatedTitle: string;
  translationSource: WbsEnglishTranslationSource;
};

const WBS_ENGLISH_MANUAL_TRANSLATIONS_KEY =
  "pms.wbsEnglishTranslations.manual.v1";
const WBS_ENGLISH_TRANSLATION_CACHE_KEY = "pms.wbsEnglishTranslations.cache.v1";

const COMMON_WBS_TITLE_GLOSSARY_ENTRIES: Array<[string, string]> = [
  ["Выпуск заводского ПО", "Factory software release"],
  ["Запуск проекта", "Project launch"],
  ["Прототип основной платы", "Mainboard prototype"],
  ["Первичная сборка прошивки", "Initial firmware build"],
  ["Первичные тесты печатной платы в сборе", "Initial PCBA tests"],
  ["Первичное устранение неисправностей", "Initial troubleshooting"],
  ["Синхронизация патчей", "Patch synchronization"],
  ["Эпики, метки, фильтры, паспорт и прочее", "Epics, labels, filters, passport, etc."],
  ["Первичная настройка Jenkins", "Initial Jenkins setup"],
  ["Планирование образцов", "Sample planning"],
  ["Старт команды ТВ", "TV team kick-off"],
  ["Функциональные требования", "Functional requirements"],
  ["Старт работ SD - CVTE - CH", "SD - CVTE - CH kick-off"],
  ["Согласование заказа образцов", "Sample order alignment"],
  [
    "Согласование функциональных требований ТВ с тремя сторонами",
    "Three-party TV functional requirements alignment",
  ],
  ["Подготовка базового плана проекта", "Baseline project plan preparation"],
  [
    "Согласование плана проекта с тремя сторонами",
    "Three-party project plan alignment",
  ],
  ["Проект с тремя сторонами запущен", "Three-party project launched"],
  ["Аппаратная часть", "Hardware"],
  ["Пакет документации по аппаратной части", "Hardware documentation package"],
  ["Проверка документации", "Documentation review"],
  ["Плата дальней голосовой зоны", "Far-field board"],
  ["Проектирование платы дальней голосовой зоны", "Far-field board design"],
  ["Тесты платы дальней голосовой зоны", "Far-field board testing"],
  ["Оценка платы дальней голосовой зоны", "Far-field board evaluation"],
  ["Инженерная основная плата", "Engineering mainboard"],
  ["Проектирование инженерного образца", "EVT design"],
  ["Тесты инженерного образца", "EVT testing"],
  ["Тесты аппаратной части", "Hardware tests"],
  ["Оценка инженерного образца", "EVT evaluation"],
  ["Дизайн основной платы", "Design mainboard"],
  ["Старт проектной версии", "DVT go"],
  ["Поверхностный монтаж", "SMT"],
  ["Тест проектной версии", "DVT test"],
  ["Оценка проектной версии", "DVT evaluation"],
  [
    "Готовность материалов основной платы для массового производства",
    "Mass-production mainboard materials ready",
  ],
  ["Основная плата готова к массовому производству", "Mainboard ready for mass production"],
  ["Дизайн ТВ", "TV design"],
  ["Получение печатных плат в сборе", "Receive PCBAs"],
  ["Проектирование", "Design"],
  ["Тестирование", "Testing"],
  ["Релиз", "Release"],
  ["ТВ готов к массовому производству", "TV ready for mass production"],
  ["ТВ-образцы", "TV samples"],
  ["Производство основных плат", "Mainboard production"],
  ["Доставка основных плат в Китай", "Mainboard delivery to China"],
  ["Производство ТВ-образцов", "TV sample production"],
  ["Доставка ТВ-образцов в московский офис SD", "TV sample delivery to the SD Moscow office"],
  ["ТВ-образцы готовы", "TV samples ready"],
  ["Образцы инженерной основной платы", "Engineering mainboard samples"],
  [
    "Доставка образцов основной платы в московский офис SD",
    "Mainboard sample delivery to the SD Moscow office",
  ],
  ["Образцы инженерной основной платы готовы", "Engineering mainboard samples ready"],
  ["Образцы дизайн-версии основной платы", "DVT mainboard samples"],
  ["Печатная плата в сборе готова", "PCBA ready"],
  ["Образцы дизайн-версии основной платы готовы", "DVT mainboard samples ready"],
  ["Аппаратная часть готова к массовому производству", "Hardware ready for mass production"],
  ["Программная часть", "Software"],
  ["Подготовка требований к заводской сборке", "Factory build requirements preparation"],
  [
    "Согласование критичных требований к заводской сборке",
    "Critical factory build requirements alignment",
  ],
  ["Таблица разделов", "Partition table"],
  ["Ключ для прошивки в массовом производстве", "Mass-production firmware key"],
  ["Функция OTA", "OTA function"],
  ["Функция AT", "AT function"],
  ["Таблица каналов", "Channel table"],
  ["Подготовка функциональных требований к ТВ-железу", "TV hardware functional requirements preparation"],
  ["LED-индикатор", "LED indicator"],
  ["Zigbee", "ZigBee"],
  ["Все функции подготовлены", "All features prepared"],
  ["Старт HomeOS", "HomeOS kick-off"],
  ["Подготовка кандидата релиза ПО", "Software release candidate preparation"],
  ["Первая сборка StarOS", "First StarOS build"],
  ["Первичные регрессионные тесты", "Initial regression tests"],
  [
    "Определение состава тикетов перед кандидатом релиза",
    "Define the ticket scope before the release candidate",
  ],
  ["Принятие решения по версии StarOS", "Decide the StarOS version"],
  ["Принятие решения по версиям приложений", "Decide application versions"],
  ["Ветвление репозитория", "Repository branching"],
  ["Создание серверных групп", "Create backend groups"],
  ["Создание конфигураций умных приложений", "Create SmartApps configs"],
  ["Заполнение конфигураций умных приложений", "Populate SmartApps configs"],
  ["Перенос конфигураций умных приложений в релизный цикл", "Move SmartApps configs to the release cycle"],
  ["[CVTE] Исправления по результатам первых тестов", "[CVTE] Fixes based on the first test results"],
  ["[AOSP] Исправления по результатам первых тестов", "[AOSP] Fixes based on the first test results"],
  ["[SPS] Исправления по результатам первых тестов", "[SPS] Fixes based on the first test results"],
  [
    "[Пуш-уведомления] Исправления по результатам первых тестов",
    "[LS/SS/Push] Fixes based on the first test results",
  ],
  [
    "[ТВ и видео] Исправления по результатам первых тестов",
    "[Live TV/Video] Fixes based on the first test results",
  ],
  [
    "[Первичная настройка] Исправления по результатам первых тестов",
    "[SUW/Settings] Fixes based on the first test results",
  ],
  ["Исправления по результатам первых тестов", "Fixes based on the first test results"],
  ["Все первичные критичные ошибки и блокеры исправлены", "All initial critical issues and blockers fixed"],
  ["ТВ-устройства готовы к тестам", "TV devices ready for testing"],
  ["Релиз ПО", "Software release"],
  ["Планирование регрессионных тестов (эпики)", "Regression test planning (epics)"],
  ["Регрессионные тесты приложений", "Application regression tests"],
  ["Регрессионные тесты платы", "Board regression tests"],
  ["Настройки телевизионного эквалайзера и кривой громкости", "TV PEQ and volume curve settings"],
  ["Тесты обработки голоса и активации", "Voice processing and activation tests"],
  ["Финальный состав тикетов", "Final ticket list"],
  ["[CVTE] Исправления по регрессу и бете", "[CVTE] Regression and beta fixes"],
  ["[AOSP] Исправления по регрессу и бете", "[AOSP] Regression and beta fixes"],
  ["[SPS] Исправления по регрессу и бете", "[SPS] Regression and beta fixes"],
  ["[Пуш-уведомления] Исправления по регрессу и бете", "[LS/SS/Push] Regression and beta fixes"],
  ["[ТВ и видео] Исправления по регрессу и бете", "[Live TV/Video] Regression and beta fixes"],
  ["[Первичная настройка] Исправления по регрессу и бете", "[SUW/Settings] Regression and beta fixes"],
  ["Исправления по регрессу и бете", "Regression and beta fixes"],
  ["Решение о готовности", "Go/No-Go decision"],
  ["Финальные регрессионные тесты", "Final regression tests"],
  ["Релиз приложений", "Application release"],
  ["Релиз массового производства", "Mass-production release"],
  ["Подготовка первой OTA", "Prepare first OTA"],
  ["Первый OTA готов", "First OTA ready"],
  ["Старт MP", "MP start"],
  ["Финальный smoke", "Final smoke test"],
  ["Финальный smoke-тест", "Final smoke test"],
  ["Новый пульт", "New remote control"],
  ["Маркетинг", "Marketing"],
  ["Подготовка", "Preparation"],
  ["Дизайн", "Design"],
  ["Видео", "Videos"],
  ["Медиаплан", "Media plan"],
  ["PR", "PR"],
  ["Подготовка первой ОТА", "Prepare first OTA"],
];

const COMMON_WBS_TITLE_GLOSSARY: WbsEnglishTranslationMap = Object.fromEntries(
  COMMON_WBS_TITLE_GLOSSARY_ENTRIES.map(([source, translation]) => [
    normalizeWbsEnglishSourceTitle(source),
    translation,
  ]),
);

const SERIES_9000_WBS_TITLE_BY_CODE: Record<string, string> = {
  "1": "Project launch",
  "1.1.1": "First board samples received",
  "1.1.2": "Initial firmware build",
  "1.1.3": "Initial board tests",
  "1.1.4": "Fix initial issues",
  "1.1.5": "Patch synchronization",
  "1.1.6": "Epics, labels, filters, project passport, etc.",
  "1.1.7": "Initial Jenkins setup",
  "1.1.8": "Sample planning",
  "1.1.9": "TV team kick-off",
  "1.1.10": "Functional requirements",
  "1.1.11": "SD - CVTE - CH kick-off",
  "1.1.12": "Agree with the Chinese team on samples",
  "1.1.13": "Get HW and SW milestones from the Chinese team",
  "1.1.14": "Align resources and project priority",
  "1.1.15": "Prepare the baseline project plan and risks",
  "1.1.16": "Project launched",
  "2": "Hardware",
  "2.1.1": "Hardware documentation package",
  "2.1.2": "Documentation review",
  "2.1.3": "Approval of new microphones",
  "2.1.4": "Approval of antennas",
  "2.2": "FF board",
  "2.2.1": "FF board design",
  "2.2.2": "FF board testing",
  "2.2.3": "FF board rework",
  "2.3": "Engineering board version (EVT)",
  "2.3.1": "EVT board design",
  "2.3.2": "Board production for SD",
  "2.3.3": "EVT board testing at CVTE",
  "2.3.4": "EVT board architecture rework",
  "2.4": "Design-validation board version (DVT)",
  "2.4.1": "Design",
  "2.4.2": "Production",
  "2.4.3": "Testing",
  "2.4.4": "Rework",
  "2.4.5": "Material calculation",
  "2.5": "Board ready for mass production",
  "2.6": "TV development",
  "2.6.1": "Delivery of boards for TV development",
  "2.6.2": "TV design",
  "2.6.3": "Testing",
  "2.6.4": "Rework",
  "2.7": "TV ready for mass production",
  "2.8": "TV samples",
  "2.8.1": "Board production for CH",
  "2.8.2": "Delivery of boards for manufacturing TV samples",
  "2.8.3": "Production of TV samples",
  "2.8.4": "Delivery to the Moscow office",
  "2.9": "TV samples ready",
  "2.10": "Engineering board samples (EVT)",
  "2.10.1": "Delivery of samples to the Moscow office",
  "2.11": "EVT board samples ready",
  "2.12": "Design-validation board samples (DVT)",
  "2.12.1": "Delivery of samples to the Moscow office",
  "2.13": "DVT board samples ready",
  "2.14": "Hardware ready for mass production",
  "3": "Software",
  "3.1": "HomeOS kick-off",
  "3.2": "Preparation of factory FW requirements",
  "3.2.1": "Alignment of critical factory FW requirements",
  "3.2.2": "SD factory",
  "3.2.3": "Keys, DRM, HDCP",
  "3.2.4": "Self-registration",
  "3.2.5": "OTA",
  "3.2.6": "AT",
  "3.3": "Preparation of TV features",
  "3.3.1": "Ambient",
  "3.3.1.1": "Ambient requirements",
  "3.3.1.2": "Ambient mockups",
  "3.3.1.3": "Implementation choice and minimum technical specification",
  "3.3.1.4": "Full technical specification",
  "3.3.1.5": "Development of the initial Ambient API",
  "3.3.1.6": "Development of the Ambient MP API",
  "3.3.1.7": "Development of the Ambient OTA API",
  "3.3.1.8": "Design of Ambient animations",
  "3.3.1.9": "Ambient controller support",
  "3.3.1.10": "Support in StarOS min",
  "3.3.1.11": "Support in StarOS mid",
  "3.3.1.12": "Support in StarOS max",
  "3.3.2": "ZigBee",
  "3.3.2.1": "ZigBee CVTE",
  "3.3.2.2": "ZigBee min SD",
  "3.3.2.3": "ZigBee MVP SD",
  "3.3.2.4": "ZigBee: agree with CH on testing",
  "3.3.3": "AI PQ",
  "3.3.4": "AI EQ",
  "3.3.5": "DLG 288",
  "3.3.6": "VRR, ALLM, HDMI 2.1",
  "3.4": "All TV features prepared",
  "3.5": "Prepare software release candidate",
  "3.5.1": "Provide the new codebase",
  "3.5.2": "First StarOS build",
  "3.5.3": "Fix initial issues",
  "3.5.4": "Initial regression tests",
  "3.5.5": "Set up the new product in StarOS",
  "3.5.6": "Define the ticket scope for MP",
  "3.5.7": "StarOS version and branch",
  "3.5.8": "Decide application versions",
  "3.5.9": "Create backend groups",
  "3.5.10": "Create SmartApps configs",
  "3.5.11": "Populate configs",
  "3.5.12": "[CVTE] Fix initial bugs",
  "3.5.13": "Decide MP release timing",
  "3.5.14": "[AOSP] Fixes based on the first results",
  "3.5.15": "[SPS/Settings] Fixes based on the first results",
  "3.5.16": "[LS/SS/Push] Fixes based on the first results",
  "3.5.17": "[SUW] Fixes based on the first results",
  "3.5.18": "[Other teams] Fixes based on the first results",
  "3.6": "All initial critical issues and blockers fixed",
  "3.7": "Prepare TV samples",
  "3.8": "Software release",
  "3.8.1": "Regression test planning",
  "3.8.2": "Application regression tests",
  "3.8.3": "Board regression tests",
  "3.8.4": "PEQ and volume curve settings",
  "3.8.5": "Voice processing and activation tests",
  "3.8.6": "Final ticket list",
  "3.8.7": "[CVTE] Regression fixes",
  "3.8.8": "[AOSP] Regression fixes",
  "3.8.9": "[SPS] Regression fixes",
  "3.8.10": "[LS/SS/Push] Regression fixes",
  "3.8.11": "[SUW] Regression fixes",
  "3.8.12": "[Other teams] Regression fixes",
  "3.9": "Go/No-Go",
  "3.10": "Final smoke test",
  "3.11": "Application release",
  "3.12": "MP start",
  "4": "Prepare first OTA",
  "4.1": "Prepare first OTA",
  "4.2": "First OTA ready",
  "5": "New remote control",
  "6": "Marketing",
  "6.1": "Preparation",
  "6.1.1": "Design/Marketing team kick-off",
  "6.1.2": "Receive 3D models from the factory",
  "6.1.3": "Receive renders from the factory",
  "6.1.4": "Positioning of the new TV",
  "6.1.5": "Prepare briefs for landing page, KV, and copywriting",
  "6.2": "Design",
  "6.2.1": "Render editing",
  "6.2.2": "3D model editing",
  "6.2.3": "Develop product cards and rich content",
  "6.2.4": "Landing page",
  "6.2.4.1": "Develop the landing page layout",
  "6.2.4.2": "Align the layout with the TV BU",
  "6.2.4.3": "Landing page development",
  "6.2.4.4": "C-level approval of the landing page",
  "6.2.5": "KV development",
  "6.2.6": "Office indoor",
  "6.2.6.1": "Develop the office indoor animation",
  "6.2.6.2": "Approve the indoor animation",
  "6.2.7": "Design interior renders",
  "6.2.8": "Design the product block for the homepage plus carousel",
  "6.2.9": "Prepare resizes",
  "6.2.10": "Design project ready",
  "6.3": "Videos",
  "6.3.1": "Select the shooting contractor",
  "6.3.2": "Video production",
  "6.3.3": "Video approval",
  "6.4": "Media campaign",
  "6.4.1": "Brief the agency for the media campaign",
  "6.4.2": "Create the media plan",
  "6.4.3": "Prepare SS and banners for MP / Salyut TV",
  "6.4.4": "Prepare a post for TG / Mail",
  "6.5": "PR",
  "6.5.1": "Brief for the PR campaign",
  "6.5.2": "Prepare the pool of media outlets",
  "6.5.3": "Prepare press releases",
  "6.5.4": "Handover of materials for PR launch",
  "6.6": "Handover of marketing materials for launch",
  "6.7": "Start of the marketing campaign",
};

export function wbsEnglishProjectName(projectName: string | null | undefined) {
  if (projectName?.includes("9000")) return "Series 9000";
  return projectName?.trim() || "Project";
}

export function normalizeWbsEnglishSourceTitle(
  title: string | null | undefined,
) {
  return (title ?? "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/\s+/g, " ");
}

function readTranslationMap(key: string): WbsEnglishTranslationMap {
  if (typeof window === "undefined") return {};
  try {
    const rawValue = window.localStorage.getItem(key);
    if (!rawValue) return {};
    const parsedValue = JSON.parse(rawValue);
    if (!parsedValue || typeof parsedValue !== "object") return {};
    return Object.fromEntries(
      Object.entries(parsedValue).filter(
        (entry): entry is [string, string] =>
          typeof entry[0] === "string" && typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function saveTranslationMap(key: string, translations: WbsEnglishTranslationMap) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(translations));
  } catch {
    // Translation export must keep working even when localStorage is unavailable.
  }
}

export function loadWbsEnglishManualTranslations() {
  return readTranslationMap(WBS_ENGLISH_MANUAL_TRANSLATIONS_KEY);
}

export function saveWbsEnglishManualTranslations(
  translations: WbsEnglishTranslationMap,
) {
  saveTranslationMap(WBS_ENGLISH_MANUAL_TRANSLATIONS_KEY, translations);
}

export function loadWbsEnglishTranslationCache() {
  return readTranslationMap(WBS_ENGLISH_TRANSLATION_CACHE_KEY);
}

export function saveWbsEnglishTranslationCache(
  translations: WbsEnglishTranslationMap,
) {
  saveTranslationMap(WBS_ENGLISH_TRANSLATION_CACHE_KEY, translations);
}

function escapeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function decodeHtml(value: string | null | undefined) {
  return (value ?? "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

function stripHtml(value: string) {
  let text = "";
  let insideTag = false;

  for (const character of value) {
    if (character === "<") {
      insideTag = true;
      continue;
    }

    if (insideTag && character === ">") {
      insideTag = false;
      continue;
    }

    if (!insideTag) {
      text += character;
    }
  }

  return decodeHtml(text).trim();
}

export function createWbsEnglishTranslationHtml({
  projectName,
  exportedAt,
  rows,
}: {
  projectName: string;
  exportedAt: Date;
  rows: WbsEnglishTranslationExportRow[];
}) {
  const exportedAtIso = exportedAt.toISOString();
  const rowMarkup = rows
    .map((row) => {
      const normalizedTitle = normalizeWbsEnglishSourceTitle(row.sourceTitle);
      return `<tr data-normalized-title="${escapeHtml(normalizedTitle)}" data-source-title="${escapeHtml(row.sourceTitle)}">
        <td class="code">${escapeHtml(row.code)}</td>
        <td class="source-title">${escapeHtml(row.sourceTitle)}</td>
        <td class="translation-target" contenteditable="true">${escapeHtml(row.translatedTitle)}</td>
        <td class="translation-source">${escapeHtml(row.translationSource)}</td>
      </tr>`;
    })
    .join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(projectName)} - WBS English translations</title>
  <style>
    body { color: #1f2937; font-family: Arial, sans-serif; margin: 24px; }
    h1 { font-size: 22px; margin: 0 0 8px; }
    p { color: #64748b; font-size: 13px; margin: 0 0 16px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #cbd5e1; font-size: 13px; padding: 8px; text-align: left; vertical-align: top; }
    th { background: #f1f5f9; color: #334155; }
    .code { color: #475569; font-weight: 700; white-space: nowrap; width: 90px; }
    .source-title { width: 38%; }
    .translation-target { background: #fff7ed; min-width: 280px; }
    .translation-source { color: #64748b; font-size: 12px; width: 110px; }
  </style>
</head>
<body data-pms-wbs-translation-export="1" data-project-name="${escapeHtml(projectName)}" data-exported-at="${escapeHtml(exportedAtIso)}">
  <h1>${escapeHtml(projectName)} - WBS English translations</h1>
  <p>Translate only the English translation column. Keep the table rows and data attributes unchanged for import.</p>
  <table>
    <thead>
      <tr>
        <th>Code</th>
        <th>Original title</th>
        <th>English translation</th>
        <th>Source</th>
      </tr>
    </thead>
    <tbody>
${rowMarkup}
    </tbody>
  </table>
</body>
</html>`;
}

export function parseWbsEnglishTranslationHtml(html: string) {
  const rows = html.match(/<tr\b[^>]*data-normalized-title=["'][\s\S]*?<\/tr>/gi) ?? [];
  const translations: WbsEnglishTranslationMap = {};
  for (const row of rows) {
    const normalizedTitle = decodeHtml(
      row.match(/\bdata-normalized-title=["']([^"']*)["']/i)?.[1],
    ).trim();
    const sourceTitle = decodeHtml(
      row.match(/\bdata-source-title=["']([^"']*)["']/i)?.[1],
    ).trim();
    const translationCell = row.match(
      /<td\b[^>]*class=["'][^"']*\btranslation-target\b[^"']*["'][^>]*>([\s\S]*?)<\/td>/i,
    )?.[1];
    const translation = stripHtml(translationCell ?? "");
    const translationKey =
      normalizedTitle || normalizeWbsEnglishSourceTitle(sourceTitle);
    if (translationKey && translation) {
      translations[translationKey] = translation;
    }
  }
  return translations;
}

export function wbsEnglishTitle(
  code: string | null | undefined,
  title: string | null | undefined,
  projectName: string | null | undefined,
) {
  return resolveWbsEnglishTitle({
    code,
    title,
    projectName,
    manualTranslations: {},
    cachedTranslations: {},
  }).text;
}

export function resolveWbsEnglishTitle({
  code,
  title,
  projectName,
  manualTranslations,
  cachedTranslations,
}: {
  code: string | null | undefined;
  title: string | null | undefined;
  projectName: string | null | undefined;
  manualTranslations: WbsEnglishTranslationMap;
  cachedTranslations: WbsEnglishTranslationMap;
}): WbsEnglishTranslation {
  const normalizedTitle = normalizeWbsEnglishSourceTitle(title);
  const originalTitle = title?.trim() || "";
  const manualTranslation = manualTranslations[normalizedTitle]?.trim();
  if (manualTranslation) {
    return { text: manualTranslation, source: "manual" };
  }

  const glossaryTranslation = COMMON_WBS_TITLE_GLOSSARY[normalizedTitle]?.trim();
  if (glossaryTranslation) {
    return { text: glossaryTranslation, source: "glossary" };
  }

  const cachedTranslation = cachedTranslations[normalizedTitle]?.trim();
  if (cachedTranslation) {
    return { text: cachedTranslation, source: "cache" };
  }

  const normalizedCode = code?.trim() ?? "";
  if (
    projectName?.includes("9000") &&
    SERIES_9000_WBS_TITLE_BY_CODE[normalizedCode]
  ) {
    return {
      text: SERIES_9000_WBS_TITLE_BY_CODE[normalizedCode],
      source: "legacy-code",
    };
  }

  return { text: originalTitle, source: "original" };
}

export function hasOfflineWbsEnglishTranslator() {
  if (typeof window === "undefined") return false;
  const candidate = window as Window &
    typeof globalThis & {
      Translator?: { create?: unknown };
      translation?: { createTranslator?: unknown };
      ai?: { translator?: { create?: unknown } };
    };
  return Boolean(
    candidate.Translator?.create ||
      candidate.translation?.createTranslator ||
      candidate.ai?.translator?.create,
  );
}

export async function translateWbsTitleWithOfflineFallback(
  title: string | null | undefined,
) {
  const sourceTitle = title?.trim();
  if (!sourceTitle || typeof window === "undefined") return null;
  const candidate = window as Window &
    typeof globalThis & {
      Translator?: {
        create?: (options: {
          sourceLanguage: string;
          targetLanguage: string;
        }) => Promise<{ translate?: (value: string) => Promise<string> }>;
      };
      translation?: {
        createTranslator?: (options: {
          sourceLanguage: string;
          targetLanguage: string;
        }) => Promise<{ translate?: (value: string) => Promise<string> }>;
      };
      ai?: {
        translator?: {
          create?: (options: {
            sourceLanguage: string;
            targetLanguage: string;
          }) => Promise<{ translate?: (value: string) => Promise<string> }>;
        };
      };
    };
  const translator =
    (await candidate.Translator?.create?.({
      sourceLanguage: "ru",
      targetLanguage: "en",
    })) ??
    (await candidate.translation?.createTranslator?.({
      sourceLanguage: "ru",
      targetLanguage: "en",
    })) ??
    (await candidate.ai?.translator?.create?.({
      sourceLanguage: "ru",
      targetLanguage: "en",
    }));
  const translatedTitle = await translator?.translate?.(sourceTitle);
  const trimmedTranslation = translatedTitle?.trim();
  if (!trimmedTranslation || trimmedTranslation === sourceTitle) return null;
  return trimmedTranslation;
}
