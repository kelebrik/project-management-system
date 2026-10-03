import { useI18n } from "../../i18n/I18nProvider";

// The cloud build's own texts, kept here so that the shared dictionaries do not depend on this folder.
const TEXTS = {
  ru: {
    menu: "Помощь",
    whatsNew: "Что нового",
    report: "Сообщить о проблеме",
    reports: "Обращения",
    back: "Назад",
    reportHint: "Опишите, что вы делали, что ожидали и что произошло. Обращение увидят администраторы.",
    attach: "Приложить адрес страницы и сведения о браузере",
    send: "Отправить",
    sending: "Отправляю…",
    sent: "Спасибо! Обращение отправлено администраторам.",
    tooShort: "Опишите проблему хотя бы в 10 символах",
    failed: "Не удалось отправить обращение",
    noReports: "Открытых обращений нет",
    showAll: "Показать и решённые",
    showOpen: "Только открытые",
    done: "Решено",
    reopen: "Вернуть",
    resolvedBy: "решено",
  },
  en: {
    menu: "Help",
    whatsNew: "What's new",
    report: "Report a problem",
    reports: "Reports",
    back: "Back",
    reportHint: "Describe what you did, what you expected and what happened. The administrators will see it.",
    attach: "Attach the page address and browser details",
    send: "Send",
    sending: "Sending…",
    sent: "Thank you! The report has been sent to the administrators.",
    tooShort: "Describe the problem in at least 10 characters",
    failed: "Could not send the report",
    noReports: "No open reports",
    showAll: "Show resolved too",
    showOpen: "Open only",
    done: "Done",
    reopen: "Reopen",
    resolvedBy: "resolved",
  },
};

export type HelpTextKey = keyof (typeof TEXTS)["ru"];

export function useHelpText() {
  const { locale } = useI18n();
  const texts = locale === "en" ? TEXTS.en : TEXTS.ru;
  return { locale, text: (key: HelpTextKey) => texts[key] };
}
