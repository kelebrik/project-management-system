import type { Locale } from "./types";
import type { ProjectModuleKey } from "../app/projectModules";
const permissions = {
  "project.read": {
    "ru": "Просмотр проектов",
    "en": "View projects"
  },
  "project.create": {
    "ru": "Создание проектов",
    "en": "Create projects"
  },
  "project.update": {
    "ru": "Редактирование паспорта проекта",
    "en": "Edit project charter"
  },
  "project.close": {
    "ru": "Закрытие проектов",
    "en": "Close projects"
  },
  "project.delete": {
    "ru": "Удаление проектов",
    "en": "Delete projects"
  },
  "wbs.read": {
    "ru": "Просмотр Структуры",
    "en": "View WBS"
  },
  "wbs.create": {
    "ru": "Создание строк Структуры",
    "en": "Create WBS rows"
  },
  "wbs.update": {
    "ru": "Редактирование Структуры",
    "en": "Edit WBS"
  },
  "wbs.delete": {
    "ru": "Удаление строк Структуры",
    "en": "Delete WBS rows"
  },
  "wbs.move": {
    "ru": "Перемещение строк Структуры",
    "en": "Move WBS rows"
  },
  "wbs.baseline": {
    "ru": "Фиксация базового плана",
    "en": "Set baseline"
  },
  "wbs.dependency": {
    "ru": "Связи Структуры и Гантта",
    "en": "WBS and Gantt dependencies"
  },
  "issue.read": {
    "ru": "Просмотр открытых вопросов",
    "en": "View open issues"
  },
  "issue.create": {
    "ru": "Создание открытых вопросов",
    "en": "Create open issues"
  },
  "issue.update": {
    "ru": "Редактирование открытых вопросов",
    "en": "Edit open issues"
  },
  "issue.close": {
    "ru": "Закрытие открытых вопросов",
    "en": "Close open issues"
  },
  "issue.delete": {
    "ru": "Удаление открытых вопросов",
    "en": "Delete open issues"
  },
  "raid.read": {
    "ru": "Просмотр рисков и проблем",
    "en": "View risks and problems"
  },
  "raid.create": {
    "ru": "Создание рисков и проблем",
    "en": "Create risks and problems"
  },
  "raid.update": {
    "ru": "Редактирование рисков и проблем",
    "en": "Edit risks and problems"
  },
  "raid.close": {
    "ru": "Закрытие рисков и проблем",
    "en": "Close risks and problems"
  },
  "raid.delete": {
    "ru": "Удаление рисков и проблем",
    "en": "Delete risks and problems"
  },
  "overview.generate": {
    "ru": "Генерация обзора",
    "en": "Generate review"
  },
  "overview.publish": {
    "ru": "Публикация обзора",
    "en": "Publish review"
  },
  "overview.export": {
    "ru": "Экспорт обзора",
    "en": "Export review"
  },
  "admin.users": {
    "ru": "Пользователи",
    "en": "Users"
  },
  "admin.roles": {
    "ru": "Роли и права",
    "en": "Roles and permissions"
  },
  "admin.dictionaries": {
    "ru": "Справочники",
    "en": "Dictionaries"
  },
  "admin.templates": {
    "ru": "Шаблоны Структуры",
    "en": "WBS templates"
  },
  "admin.rag": {
    "ru": "Формулы RAG",
    "en": "RAG formulas"
  },
  "admin.workflow": {
    "ru": "Workflow согласований",
    "en": "Approval workflows"
  },
  "admin.health": {
    "ru": "System health",
    "en": "System health"
  },
  "admin.backup": {
    "ru": "Backup/restore status",
    "en": "Backup/restore status"
  },
  "admin.config": {
    "ru": "Import/export конфигурации",
    "en": "Configuration import/export"
  },
  "admin.project_access": {
    "ru": "Доступ к проектам",
    "en": "Project access"
  },
  "admin.audit": {
    "ru": "Журнал аудита",
    "en": "Audit log"
  },
  "admin.integrations": {
    "ru": "Интеграции и API",
    "en": "Integrations and API"
  }
} as const;
const dictionaries = {
  "project_status": {
    "ru": "Статусы проектов",
    "en": "Project statuses"
  },
  "project_type": {
    "ru": "Типы проектов",
    "en": "Project types"
  },
  "risk_type": {
    "ru": "Типы рисков",
    "en": "Risk types"
  },
  "wbs_type": {
    "ru": "Типы Структуры",
    "en": "WBS types"
  },
  "wbs_status": {
    "ru": "Статусы Структуры",
    "en": "WBS statuses"
  },
  "issue_severity": {
    "ru": "Критичность открытых вопросов",
    "en": "Open issue severity"
  },
  "raid_type": {
    "ru": "Типы рисков и проблем",
    "en": "Risk and problem types"
  },
  "raid_status": {
    "ru": "Статусы рисков и проблем",
    "en": "Risk and problem statuses"
  }
} as const;
const modules = {
  "overview": {
    "label": {
      "ru": "Состояние проекта",
      "en": "Project overview"
    },
    "description": {
      "ru": "Состояние проекта, ключевые риски, решения и график вех",
      "en": "Project health, key risks, decisions and milestone schedule"
    }
  },
  "passport": {
    "label": {
      "ru": "Паспорт проекта",
      "en": "Project charter"
    },
    "description": {
      "ru": "Редактируемые атрибуты паспорта проекта",
      "en": "Editable project charter attributes"
    }
  },
  "businessRequirements": {
    "label": {
      "ru": "Бизнес требования",
      "en": "Business requirements"
    },
    "description": {
      "ru": "Редактируемая таблица бизнес-требований проекта",
      "en": "Editable table of project business requirements"
    }
  },
  "structure": {
    "label": {
      "ru": "Структура",
      "en": "WBS"
    },
    "description": {
      "ru": "Иерархия работ проекта, сроки, исполнители и предшественники",
      "en": "Project work hierarchy, dates, owners and predecessors"
    }
  },
  "gantt": {
    "label": {
      "ru": "Гантт",
      "en": "Gantt"
    },
    "description": {
      "ru": "Временная шкала, связи, базовый план и критический путь",
      "en": "Timeline, dependencies, baseline and critical path"
    }
  },
  "jiraWork": {
    "label": {
      "ru": "Работы в Jira",
      "en": "Jira work"
    },
    "description": {
      "ru": "Jira-фильтры проекта и синхронизированные тикеты Jira",
      "en": "Project Jira filters and synchronised Jira tickets"
    }
  },
  "issues": {
    "label": {
      "ru": "Открытые вопросы",
      "en": "Open issues"
    },
    "description": {
      "ru": "Открытые и закрытые вопросы проекта с Jira-связями",
      "en": "Open and closed project issues with Jira links"
    }
  },
  "raid": {
    "label": {
      "ru": "Риски и проблемы",
      "en": "Risks and problems"
    },
    "description": {
      "ru": "Риски, проблемы и допущения проекта",
      "en": "Project risks, problems and assumptions"
    }
  },
  "changes": {
    "label": {
      "ru": "Управление изменениями",
      "en": "Change management"
    },
    "description": {
      "ru": "Запросы на изменение scope, сроков и управленческих решений",
      "en": "Requests to change scope, dates and management decisions"
    }
  },
  "budget": {
    "label": {
      "ru": "Управление бюджетом",
      "en": "Budget management"
    },
    "description": {
      "ru": "Контур план-факт-прогноз бюджета проекта",
      "en": "Planned, actual and forecast project budget"
    }
  },
  "calendars": {
    "label": {
      "ru": "Календари",
      "en": "Calendars"
    },
    "description": {
      "ru": "RU и CN производственные календари проекта",
      "en": "Project working calendars for Russia and China"
    }
  },
  "artifacts": {
    "label": {
      "ru": "Артефакты проекта",
      "en": "Project artifacts"
    },
    "description": {
      "ru": "Управленческие артефакты и ссылки на документы",
      "en": "Management artifacts and document links"
    }
  }
} as const;
export function createAdminLabels(locale: Locale) {
  const pick = (messages: Record<string, { en: string; ru: string }>, key: string) => Object.hasOwn(messages, key) ? messages[key][locale] : key;
  return {
    adminPermissionLabel: (key: string) => pick(permissions, key),
    dictionaryLabel: (key: string) => pick(dictionaries, key),
    adminDictionaryLabels: Object.fromEntries(Object.entries(dictionaries).map(([key, value]) => [key, value[locale]])),
    moduleLabel: (key: ProjectModuleKey) => modules[key].label[locale],
    moduleDescription: (key: ProjectModuleKey) => modules[key].description[locale],
  };
}
