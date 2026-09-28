export const scheduleLinksMessages = {
  "ui.scheduleLinks.typeFS": {
    "en": "finish-to-start",
    "ru": "окончание–начало"
  },
  "ui.scheduleLinks.typeSS": {
    "en": "start-to-start",
    "ru": "начало–начало"
  },
  "ui.scheduleLinks.typeFF": {
    "en": "finish-to-finish",
    "ru": "окончание–окончание"
  },
  "ui.scheduleLinks.typeSF": {
    "en": "start-to-finish",
    "ru": "начало–окончание"
  },
  "ui.scheduleLinks.lag": {
    "en": " ({days} working days)",
    "ru": " ({days} раб. дн.)"
  },
  "ui.scheduleLinks.link": {
    "en": "the {type} link with {code} “{title}”{lag}",
    "ru": "связь «{type}» с {code} «{title}»{lag}"
  },
  "ui.scheduleLinks.startSetBy": {
    "en": "The start is set by {links}.",
    "ru": "Начало задаёт {links}."
  },
  "ui.scheduleLinks.finishSetBy": {
    "en": "The finish is set by {links}.",
    "ru": "Окончание задаёт {links}."
  },
  "ui.scheduleLinks.howToChange": {
    "en": "To change it, edit the link or its lag on the Gantt chart, or move the predecessor.",
    "ru": "Чтобы изменить дату, поменяйте связь или её задержку на Ганте либо сдвиньте предшественника."
  },
  "ui.scheduleLinks.startKept": {
    "en": "{code}: the start stays {date}. {reason} {how}",
    "ru": "{code}: начало осталось {date}. {reason} {how}"
  },
  "ui.scheduleLinks.finishKept": {
    "en": "{code}: the finish stays {date}. {reason} {how}",
    "ru": "{code}: окончание осталось {date}. {reason} {how}"
  },
  "ui.scheduleLinks.startSetByMany": {
    "en": "The start is held by several links, the latest of them wins: {links}.",
    "ru": "Начало ограничивают несколько связей, дату даёт самая поздняя из них: {links}."
  },
  "ui.scheduleLinks.finishSetByMany": {
    "en": "The finish is held by several links, the latest of them wins: {links}.",
    "ru": "Окончание ограничивают несколько связей, дату даёт самая поздняя из них: {links}."
  },
  "feedback.warning": {
    "en": "Note",
    "ru": "Обратите внимание"
  }
} as const;
