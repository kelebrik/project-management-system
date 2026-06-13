# Управление ресурсами

Документ фиксирует рекомендуемую модель раздела "Управление ресурсами" для PMS. Цель раздела - не просто показать список исполнителей из WBS, а дать PM, PMO и Resource Manager общий контур: кто доступен, кто назначен, где перегрузка, какие роли дефицитны, как замена ресурса влияет на сроки, бюджет и executive overview.

## 1. Как это устроено в популярных продуктах

### Microsoft Planner Premium / Project

Microsoft разделяет планирование работ и ресурсную картину. В premium-возможностях Planner есть People view для оценки распределения работы по участникам, Timeline/Gantt для зависимостей, custom calendars для рабочих дней и Assignments view для более точного распределения effort по дням, неделям или месяцам. Важный паттерн: назначение ресурса влияет не только на задачу, но и на требования к ресурсу и финансовые оценки.

Что стоит взять:

- People/Assignments view как отдельные представления поверх WBS.
- Распределение effort по периодам, а не только поле owner.
- Календарь проекта/ресурса как часть расчета сроков.
- Связь ресурсной загрузки с финансовыми оценками.

Источник: https://support.microsoft.com/en-us/office/advanced-capabilities-with-premium-plans-in-planner-6cdba2aa-da06-4e08-be4c-baaa4fda17ba

### Float

Float строит продукт вокруг визуального schedule: назначения видны на timeline, capacity и utilization пересчитываются live, time off и holidays уменьшают доступность, а over-capacity warnings появляются прямо в расписании. Поддерживаются часы и проценты, custom availability, роли, навыки и ставки.

Что стоит взять:

- Основной экран как ресурсное расписание, а не статическая таблица.
- Жесткое отличие capacity, allocation, availability и utilization.
- Drag-and-drop или быстрые действия для перераспределения.
- Роли, навыки и ставки в профиле ресурса.

Источники:

- https://www.float.com/product/scheduling
- https://www.float.com/product/capacity-planning

### Resource Guru

Resource Guru фокусируется на scheduling, capacity planning, leave management, equipment booking, reports и timesheets. Отдельно полезен паттерн conflict/clash management: система не просто красит перегрузку, а показывает конфликт, альтернативы и очередь ожидания.

Что стоит взять:

- Проверка конфликтов при создании назначения.
- Учет отсутствий и оборудования в той же логике доступности.
- Reports/timesheets как источник факта.
- Возможность оставить запрос в waiting list, если ресурс пока недоступен.

Источник: https://resourceguruapp.com/features/resource-scheduling-software

### Smartsheet Resource Management

Smartsheet Resource Management полезен как ориентир для PPM: ресурсный контур должен показывать capacity, workload, availability, project/portfolio demand и heatmaps. Это не отдельная вкладка "люди", а слой планирования портфеля.

Что стоит взять:

- Heatmap по людям, ролям, проектам и портфелям.
- Сравнение demand и capacity на горизонте недель/месяцев.
- Связь с time tracking и отчетностью.
- Раздельные представления для PM и Resource Manager.

Источники:

- https://www.smartsheet.com/product/resource-management
- https://help.smartsheet.com/learning-track/getting-started-resource-management

### Asana

Asana закрывает ресурсное планирование через work management: задачи, владельцы, портфели, workload/resource planning, прогресс и статусы. Сильная сторона - простая связь работы и людей в операционном интерфейсе, но для enterprise PPM обычно нужно больше governance: ставки, approvals, baseline, фактические часы и влияние на бюджет.

Что стоит взять:

- Ресурсная картина должна быть связана с задачами и портфелем.
- PM должен видеть загрузку в контексте delivery, а не в отдельном HR-справочнике.
- В управленческий обзор нужно выводить только критические ресурсные ограничения.

Источник: https://asana.com/uses/resource-planning

### Wrike, monday.com, ClickUp

Эти системы показывают общий тренд: workload/resource views становятся частью dashboards и автоматизированной отчетности. Их сильная сторона - гибкость представлений, фильтров, сохраненных views и визуальных панелей для разных ролей. Ограничение для нашего случая - без строгой модели capacity, approval и связки с WBS/бюджетом такие views легко превращаются в красивую, но недостоверную картинку.

Источники:

- https://www.wrike.com/features/resource-management/
- https://support.monday.com/hc/en-us/articles/23921675672466-Portfolio-management-All-Projects-Dashboard
- https://clickup.com/features/dashboards

## 2. Рекомендуемая концепция для PMS

Раздел нужно строить как "Resource Command Center" внутри проекта с возможностью портфельного расширения. Базовая идея:

> WBS говорит, какая работа должна быть сделана. Resource Management отвечает, кем, когда, с какой доступностью, с какой стоимостью и каким риском для сроков.

Главный принцип: не хранить загрузку как ручной процент. Загрузка должна считаться из календарей, назначений, effort, отсутствий и фактических часов.

## 3. Основные сущности

| Сущность | Назначение |
|---|---|
| Resource | Человек, внешний подрядчик, виртуальная роль или оборудование |
| ResourceRole | Роль: BA, backend, QA, DevOps, integrator, vendor |
| Skill | Навык с уровнем: API, Jira, 1C, SAP, React, QA automation |
| ResourceCalendar | Рабочие дни, праздники, часовой пояс, FTE |
| AvailabilityException | Отпуск, больничный, обучение, командировка, резерв |
| Assignment | Назначение ресурса на WBS/task/project с effort и периодом |
| AllocationSegment | Распределение назначения по дням/неделям: часы или проценты |
| ResourceRequest | Запрос PM на роль/навык/период/объем |
| TimesheetEntry | Фактические часы по задаче, проекту, категории |
| RateCard | Плановая/фактическая ставка ресурса или роли |
| ResourceScenario | Черновой сценарий перераспределения до применения в план |

## 4. Формулы и правила расчета

### Capacity

```text
capacityHours = workingHours(calendar, period) * FTE - approvedTimeOff - reservedBuffer
```

Пример: у ресурса 40 ч/нед, FTE 1.0, отпуск 8 ч, резерв руководителя 4 ч. Capacity недели = 28 ч.

### Demand

```text
demandHours = sum(allocationSegments.hours) + unstaffedRoleDemand
```

Demand должен включать не только назначенных людей, но и незакрытые потребности по ролям. Иначе дефицит роли не будет виден.

### Utilization

```text
utilization = demandHours / capacityHours
```

Рекомендуемые пороги:

- 0-50%: недозагрузка, можно предложить ресурс.
- 51-85%: нормальная загрузка.
- 86-100%: риск, нужна проверка.
- 101-120%: перегрузка, требуется решение.
- >120%: критический конфликт, влияет на RAG проекта.

### Forecast и факт

```text
forecastCost = plannedRemainingHours * rate + actualHours * actualRate
```

Фактические часы не должны затирать план. Они дают отклонение и корректируют прогноз.

## 5. Роли и права

| Роль | Что делает |
|---|---|
| PM | Создает запросы, предлагает назначения, видит загрузку своего проекта |
| Resource Manager | Утверждает назначения, заменяет ресурсы, управляет capacity |
| Team Lead | Подтверждает доступность команды и skill fit |
| Finance Controller | Видит ставки, cost forecast, actuals |
| Portfolio Manager | Видит дефицит ролей и конфликты между проектами |
| Executive / Sponsor | Видит только critical constraints и решения |

Ключевое правило: PM может предложить назначение, но при включенной политике governance финальное закрепление ресурса делает Resource Manager или Team Lead.

## 6. Основные экраны

### 6.1 Обзор загрузки

Первый экран раздела. Показывает:

- KPI: перегруженные ресурсы, дефицит ролей, незакрытые запросы, прогноз влияния на сроки.
- Heatmap capacity vs demand по неделям.
- Список конфликтов с причиной: перегрузка, отпуск, недостающий навык, двойное назначение.
- Быстрые рекомендации: заменить ресурс, перенести работу, запросить роль.

JPG: [01-overview-heatmap.jpg](01-overview-heatmap.jpg)

### 6.2 Расписание назначений

Рабочий экран Resource Manager. Показывает:

- Timeline по людям или ролям.
- Назначения из WBS как блоки с проектом, задачей и effort.
- Отпуска и недоступность.
- Свободные окна и перегрузки.
- Черновой режим "Сценарий" до применения в план.

JPG: [02-schedule-allocations.jpg](02-schedule-allocations.jpg)

### 6.3 Карточка ресурса

Экран детализации человека/виртуального ресурса:

- Capacity, utilization, overtime, availability.
- Навыки, роль, ставка, календарь, менеджер.
- Назначения по проектам.
- Факт по timesheets.
- История изменений и ограничения.

JPG: [03-resource-profile.jpg](03-resource-profile.jpg)

### 6.4 Запрос и согласование ресурса

Workflow для PM и Resource Manager:

- PM указывает роль, навык, период, загрузку, критичность, связанный WBS.
- Система показывает доступных кандидатов и impact.
- Resource Manager утверждает, заменяет, отклоняет или отправляет в waiting list.
- После утверждения создается assignment и пересчитываются Гантт, бюджет и overview.

JPG: [04-resource-request.jpg](04-resource-request.jpg)

## 7. Интеграции с текущими модулями PMS

### WBS / Структура

- WBS item должен хранить `plannedEffortHours`, `remainingEffortHours`, `requiredRole`, `requiredSkills`.
- Назначение ресурса не должно быть просто строкой `owner`; нужна отдельная сущность `Assignment`.
- Один WBS item может иметь несколько ресурсов и разные allocation segments.

### Гантт

- Изменение назначения может менять длительность, если включен resource-driven scheduling.
- В MVP можно не пересчитывать длительность автоматически, но нужно показывать предупреждение.
- Критический путь должен получать resource constraint как отдельный фактор риска.

### Бюджет

- Forecast cost строится из allocation и rate card.
- Actual cost строится из timesheets.
- Изменение ресурса должно показывать delta по стоимости.

### Риски / Issues / Change Requests

- Перегрузка >120%, дефицит ключевой роли или отпуск на критической задаче автоматически создают resource risk или issue.
- Если решение требует изменения сроков/бюджета/scope, создается change request.

### Executive Overview

В overview выводить не всю загрузку, а только управленчески значимые ограничения:

- дефицит роли на критическом пути;
- перегрузка ключевого эксперта;
- незакрытый resource request старше SLA;
- влияние на дату вехи, бюджет и решение, которое требуется от руководства.

## 8. Рекомендуемый MVP

### Этап 1. Надежная витрина загрузки

- Использовать текущие WBS items и `owner` как первичный источник.
- Добавить плановые effort hours на WBS item.
- Добавить справочник ресурсов с calendar/FTE/role.
- Построить heatmap по неделям.
- Показывать перегрузку, просрочки и незакрытые назначения.

### Этап 2. Настоящие назначения

- Ввести `Assignment` и `AllocationSegment`.
- Поддержать несколько ресурсов на одну работу.
- Добавить hard/soft booking.
- Добавить запрос ресурса и approval.

### Этап 3. Факт, ставки, прогноз

- Timesheets по неделям.
- Rate cards и cost forecast.
- Variance: plan vs actual vs forecast.
- Экспорт в finance и executive overview.

### Этап 4. Сценарии и рекомендации

- Что будет, если заменить ресурс.
- Где есть окно у подходящего специалиста.
- Какие задачи можно сдвинуть без влияния на critical path.
- Рекомендации по найму/подрядчику для портфеля.

## 9. API и данные

Минимальные endpoints:

```text
GET    /api/projects/:code/resources/summary
GET    /api/projects/:code/resources/heatmap?from=&to=&groupBy=person|role|team
GET    /api/projects/:code/resources/assignments
POST   /api/projects/:code/resources/assignments
PATCH  /api/projects/:code/resources/assignments/:id
POST   /api/projects/:code/resource-requests
PATCH  /api/projects/:code/resource-requests/:id/decision
GET    /api/resources
PATCH  /api/resources/:id
GET    /api/resources/:id/profile
POST   /api/resources/:id/availability
POST   /api/timesheets
```

## 10. Приемочные критерии

- Система показывает перегрузку выше 100% по неделям и объясняет источник перегрузки.
- PM может создать resource request из WBS item.
- Resource Manager может утвердить ресурс, заменить кандидата или отправить запрос в waiting list.
- Изменение назначения пересчитывает resource heatmap и forecast cost.
- Отпуск/недоступность уменьшают capacity и подсвечивают конфликт на критических задачах.
- Executive overview получает только критические ресурсные ограничения с impact по срокам и бюджету.
- Все изменения назначений, ставок, календарей и approval фиксируются в audit trail.

## 11. Что не стоит делать

- Не хранить загрузку ручным процентом без связи с задачами и календарями.
- Не смешивать справочник сотрудников и назначения в одной таблице.
- Не показывать руководству всю heatmap вместо кратких constraints и решений.
- Не давать PM напрямую закреплять дефицитный ресурс без governance, если включена ресурсная политика.
- Не привязывать модуль только к текущему проекту: модель должна поддерживать будущий портфельный слой.

