# UI/UX audit and Figma-ready concepts

Артефакты подготовлены по текущему интерфейсу Render:
`https://project-management-system-lorj.onrender.com/`.

## Что внутри

- `ui-ux-improvement-hypotheses.md` - 20 гипотез улучшения UI/UX с ожидаемым эффектом и метриками.
- `variant-a-executive-cockpit.svg` - вариант A: управленческий cockpit для портфеля и состояния проекта.
- `variant-b-operational-workspace.svg` - вариант B: рабочий интерфейс PM для WBS, Гантта, RAID и вопросов.
- `figma-plugin/` - минимальный Figma plugin, который строит оба варианта как Figma-фреймы.

## Как перенести в Figma

Есть два пути:

1. Импортировать SVG-файлы в Figma: `File -> Place image` или drag-and-drop на canvas.
2. Запустить локальный Figma plugin из папки `figma-plugin/`; он создаст два фрейма `Variant A - Executive Cockpit` и `Variant B - Operational Workspace`.

Прямой публикации в Figma из этой среды не было: нет Figma MCP/API-токена и локального Figma Desktop.
