const colors = {
  bg: "#F4F7FB",
  white: "#FFFFFF",
  border: "#D9E2EF",
  text: "#111827",
  muted: "#64748B",
  blue: "#1D4ED8",
  blueSoft: "#EEF6FF",
  red: "#EF4444",
  redSoft: "#FEF2F2",
  green: "#22C55E",
  greenSoft: "#ECFDF5",
  amberSoft: "#FFF7ED",
  amber: "#F59E0B",
  slateSoft: "#F8FAFC",
  purple: "#8B5CF6",
};

function rgb(hex) {
  const value = hex.replace("#", "");
  return {
    r: parseInt(value.slice(0, 2), 16) / 255,
    g: parseInt(value.slice(2, 4), 16) / 255,
    b: parseInt(value.slice(4, 6), 16) / 255,
  };
}

function solid(hex) {
  return { type: "SOLID", color: rgb(hex) };
}

function rect(parent, name, x, y, w, h, fill, options = {}) {
  const node = figma.createRectangle();
  node.name = name;
  node.x = x;
  node.y = y;
  node.resize(w, h);
  node.fills = [solid(fill)];
  node.cornerRadius = options.radius ?? 8;
  if (options.stroke) {
    node.strokes = [solid(options.stroke)];
    node.strokeWeight = options.strokeWeight ?? 1;
  }
  parent.appendChild(node);
  return node;
}

function line(parent, name, x1, y1, x2, y2, color, width = 1) {
  const node = figma.createLine();
  node.name = name;
  node.x = x1;
  node.y = y1;
  node.resize(Math.max(1, x2 - x1), 0);
  node.rotation = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
  node.strokes = [solid(color)];
  node.strokeWeight = width;
  parent.appendChild(node);
  return node;
}

function text(parent, name, value, x, y, size = 12, fill = colors.text, bold = false, width = 220) {
  const node = figma.createText();
  node.name = name;
  node.fontName = { family: "Inter", style: bold ? "Bold" : "Regular" };
  node.characters = value;
  node.fontSize = size;
  node.fills = [solid(fill)];
  node.x = x;
  node.y = y;
  node.resize(width, Math.max(size + 8, 20));
  parent.appendChild(node);
  return node;
}

function chip(parent, label, x, y, w, fill, color = colors.text) {
  rect(parent, `Chip / ${label}`, x, y, w, 32, fill, { radius: 16 });
  text(parent, `Chip label / ${label}`, label, x + 18, y + 8, 12, color, true, w - 24);
}

function card(parent, name, x, y, w, h, title, subtitle) {
  rect(parent, name, x, y, w, h, colors.white, { radius: 10, stroke: colors.border });
  if (title) text(parent, `${name} title`, title, x + 24, y + 20, 18, colors.text, true, w - 48);
  if (subtitle) text(parent, `${name} subtitle`, subtitle, x + 24, y + 46, 12, colors.muted, false, w - 48);
}

function makeFrame(name, x) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.x = x;
  frame.y = 0;
  frame.resize(1440, 1024);
  frame.fills = [solid(colors.bg)];
  figma.currentPage.appendChild(frame);
  return frame;
}

function sidebar(frame, mode, active) {
  rect(frame, "Sidebar", 0, 0, 248, 1024, colors.white, { radius: 0 });
  rect(frame, "Logo mark", 24, 24, 40, 40, colors.blue, { radius: 10 });
  text(frame, "Logo text", "УП", 34, 35, 16, colors.white, true, 28);
  text(frame, "Brand", "Система УП", 76, 28, 16, colors.text, true, 140);
  text(frame, "Mode", mode, 76, 50, 12, colors.muted, false, 140);

  const items = ["Cockpit", "Проекты", "Решения", "RAID", "Отчеты"];
  items.forEach((item, index) => {
    const y = 96 + index * 52;
    const selected = item === active;
    rect(frame, `Nav / ${item}`, 20, y, 208, 42, selected ? colors.blueSoft : colors.white, {
      stroke: selected ? "#BFDBFE" : colors.white,
      radius: 8,
    });
    if (selected) rect(frame, `Nav active mark / ${item}`, 20, y + 14, 4, 16, colors.blue, { radius: 2 });
    text(frame, `Nav text / ${item}`, item, 40, y + 12, 12, selected ? colors.blue : colors.muted, true, 160);
  });
}

function drawExecutiveCockpit() {
  const frame = makeFrame("Variant A - Executive Cockpit", 0);
  sidebar(frame, "Executive cockpit", "Cockpit");

  card(frame, "Topbar", 280, 20, 1132, 76, "Портфель проектов", "6 активных проектов · обновлено сегодня, 06.07.2026");
  rect(frame, "Search", 726, 34, 372, 42, colors.slateSoft, { stroke: "#CBD5E1", radius: 9 });
  text(frame, "Search label", "Поиск, команда или переход к проекту", 750, 47, 13, colors.muted, false, 300);
  rect(frame, "Create report", 1216, 34, 176, 42, colors.blue, { radius: 9 });
  text(frame, "Create report label", "Создать статус-отчет", 1240, 47, 13, colors.white, true, 130);

  card(frame, "Attention summary", 280, 116, 1132, 96, "Сводка внимания", "");
  chip(frame, "2 красных сигнала", 304, 158, 170, "#FEE2E2", "#991B1B");
  chip(frame, "3 решения ожидают", 488, 158, 190, "#FEF3C7", "#92400E");
  chip(frame, "5 целей в окне", 692, 158, 190, "#DBEAFE", colors.blue);
  chip(frame, "-1 день прогноз", 896, 158, 170, "#DCFCE7", "#166534");

  card(frame, "Risk ranked projects", 280, 232, 348, 356, "Проекты по риску", "Сортировка по влиянию на срок и решения");
  const projects = [
    ["Демо-проект Орбита", "2 красных RAID · 3 решения", colors.redSoft, "#FDA4AF", "16"],
    ["Демо-проект Север", "1 цель · без блокеров", colors.slateSoft, "#E2E8F0", ""],
    ["Демо-проект Горизонт", "1 цель · прогноз 03.11", colors.slateSoft, "#E2E8F0", ""],
  ];
  projects.forEach((project, index) => {
    const y = 306 + index * 86;
    rect(frame, `Project card ${index + 1}`, 304, y, 300, index === 0 ? 74 : 62, project[2], { stroke: project[3], radius: 10 });
    rect(frame, `Project score ${index + 1}`, 314, y + 18, 24, 24, index === 0 ? colors.red : colors.green, { radius: 12 });
    if (project[4]) text(frame, `Project score label ${index + 1}`, project[4], 321, y + 23, 10, colors.white, true, 24);
    text(frame, `Project title ${index + 1}`, project[0], 348, y + 16, 14, colors.text, true, 190);
    text(frame, `Project meta ${index + 1}`, project[1], 348, y + 38, 12, colors.muted, false, 190);
  });

  card(frame, "Decision queue", 648, 232, 396, 356, "Decision queue", "Решения, которые двигают сроки и бюджет");
  const decisions = [
    ["Просрочено 10 дней", "Подтвердить поставщика SLA", colors.redSoft, "#FECACA", "#991B1B"],
    ["До 10.07.2026", "Закрыть демо-вопрос 13", colors.amberSoft, "#FED7AA", "#9A3412"],
    ["До 10.07.2026", "Закрыть демо-вопрос 14", colors.slateSoft, "#E2E8F0", colors.muted],
  ];
  decisions.forEach((item, index) => {
    const y = 306 + index * 84;
    rect(frame, `Decision ${index + 1}`, 672, y, 348, index === 0 ? 76 : 68, item[2], { stroke: item[3], radius: 10 });
    text(frame, `Decision due ${index + 1}`, item[0], 692, y + 14, 13, item[4], true, 200);
    text(frame, `Decision title ${index + 1}`, item[1], 692, y + 40, 15, colors.text, true, 260);
  });

  card(frame, "Impact", 1064, 232, 348, 356, "Impact on target", "Что влияет на ближайшую цель");
  rect(frame, "Target date", 1088, 310, 300, 96, colors.slateSoft, { stroke: "#E2E8F0", radius: 10 });
  text(frame, "Date", "03.09", 1110, 318, 36, colors.text, true, 120);
  text(frame, "Target meta", "Опережение 1 дн.", 1220, 328, 12, "#166534", true, 130);
  chip(frame, "+94 дн. · Демо-задача 107", 1088, 426, 300, colors.redSoft, "#991B1B");
  chip(frame, "-41 дн. · Демо-задача 134", 1088, 480, 300, colors.greenSoft, "#047857");

  card(frame, "Timeline", 280, 608, 760, 372, "Timeline goals", "Сравнение целей по проектам, не длинный список отдельных карточек");
  ["Орбита", "Север", "Горизонт"].forEach((name, index) => {
    const y = 720 + index * 70;
    text(frame, `Timeline label ${name}`, name, 304, y - 8, 14, colors.text, true, 100);
    line(frame, `Timeline line ${name}`, 440, y, 998, y, "#CBD5E1", 3);
  });
  line(frame, "Today", 706, 690, 706, 920, colors.red, 2);
  [[630, 720, colors.green, "1"], [790, 720, colors.green, "2"], [890, 720, colors.purple, "3"], [650, 790, colors.purple, "1"], [950, 860, colors.purple, "1"]].forEach((dot, index) => {
    rect(frame, `Goal dot ${index}`, dot[0] - 13, dot[1] - 13, 26, 26, dot[2], { radius: 13 });
    text(frame, `Goal dot label ${index}`, dot[3], dot[0] - 4, dot[1] - 8, 11, colors.white, true, 18);
  });

  card(frame, "Portfolio table", 1064, 608, 348, 372, "Portfolio table", "Минимум паспортных полей, максимум сравнения");
  rect(frame, "Table header", 1088, 684, 300, 42, "#EFF6FF", { radius: 8 });
  text(frame, "Table h project", "Проект", 1104, 698, 12, colors.blue, true, 80);
  text(frame, "Table h risk", "Риск", 1210, 698, 12, colors.blue, true, 80);
  text(frame, "Table h target", "Цель", 1300, 698, 12, colors.blue, true, 80);
}

function drawOperationalWorkspace() {
  const frame = makeFrame("Variant B - Operational Workspace", 1480);
  sidebar(frame, "Project workspace", "Проекты");

  card(frame, "Topbar", 280, 20, 1132, 76, "Демо-проект Орбита", "PM workspace · WBS, Гантт, RAID и вопросы в одном режиме");
  rect(frame, "Search", 726, 34, 320, 42, colors.slateSoft, { stroke: "#CBD5E1", radius: 9 });
  text(frame, "Search label", "Найти задачу, риск или владельца", 750, 47, 13, colors.muted, false, 250);
  chip(frame, "Сохранено", 1060, 39, 96, colors.greenSoft, "#166534");
  rect(frame, "Edit", 1282, 34, 110, 42, colors.blue, { radius: 9 });
  text(frame, "Edit label", "Изменить", 1310, 47, 13, colors.white, true, 80);

  card(frame, "Health strip", 280, 116, 1132, 64, "", "");
  chip(frame, "Статус Активен", 304, 132, 146, colors.blueSoft, colors.blue);
  chip(frame, "Опережение 1 дн.", 462, 132, 160, colors.greenSoft, "#047857");
  chip(frame, "Цель 03.09.2026", 634, 132, 174, colors.slateSoft, colors.text);
  chip(frame, "3 решения ожидают", 820, 132, 218, colors.amberSoft, "#9A3412");
  chip(frame, "2 RAID красной зоны", 1050, 132, 188, colors.redSoft, "#991B1B");

  card(frame, "Work queue", 280, 200, 252, 780, "Work queue", "Сегодня и ближайшая неделя");
  const queue = [
    ["Просрочено", "Демо-задача 107", "Ольга · +94 дн.", colors.redSoft, "#FECACA", "#991B1B"],
    ["Решение", "Вопрос 13", "Мария · до 10.07", colors.amberSoft, "#FED7AA", "#9A3412"],
    ["Старт на неделе", "Демо-задача 67", "15.07 · не начата", "#EFF6FF", "#BFDBFE", colors.blue],
  ];
  queue.forEach((item, index) => {
    const y = 276 + index * 84;
    rect(frame, `Queue ${index + 1}`, 304, y, 204, 72, item[3], { stroke: item[4], radius: 10 });
    text(frame, `Queue type ${index + 1}`, item[0], 324, y + 14, 12, item[5], true, 160);
    text(frame, `Queue title ${index + 1}`, item[1], 324, y + 38, 15, colors.text, true, 160);
    text(frame, `Queue meta ${index + 1}`, item[2], 324, y + 56, 11, colors.muted, false, 160);
  });

  card(frame, "WBS", 552, 200, 580, 412, "WBS spreadsheet", "Sticky код/название, активные фазы раскрыты по умолчанию");
  chip(frame, "Сейчас", 576, 276, 74, colors.blue, colors.white);
  chip(frame, "Неделя", 658, 276, 78, colors.white, colors.text);
  rect(frame, "WBS header", 576, 326, 532, 40, "#EAF0F7", { radius: 0 });
  text(frame, "WBS h1", "КОД", 592, 340, 11, colors.muted, true, 50);
  text(frame, "WBS h2", "НАИМЕНОВАНИЕ", 652, 340, 11, colors.muted, true, 150);
  text(frame, "WBS h3", "СТАТУС", 850, 340, 11, colors.muted, true, 80);
  [
    ["2.6", "Демо-задача 24", "В работе", "01.07", "Мария", colors.white],
    ["4.3.2", "Демо-задача 107", "Риск", "12.10", "Ольга", colors.redSoft],
    ["4.8.1", "Демо-задача 134", "Опереж.", "03.08", "Михаил", colors.white],
    ["7.2.3", "Демо-задача 164", "Не начата", "29.07", "Павел", colors.white],
  ].forEach((row, index) => {
    const y = 366 + index * 42;
    rect(frame, `WBS row ${index + 1}`, 576, y, 532, 42, row[5], { radius: 0 });
    text(frame, `WBS code ${index + 1}`, row[0], 592, y + 13, 12, colors.blue, true, 50);
    text(frame, `WBS title ${index + 1}`, row[1], 652, y + 13, 12, colors.text, true, 180);
    text(frame, `WBS status ${index + 1}`, row[2], 850, y + 13, 12, row[2] === "Риск" ? "#991B1B" : colors.text, false, 80);
    text(frame, `WBS due ${index + 1}`, row[3], 948, y + 13, 12, row[2] === "Риск" ? "#991B1B" : colors.text, false, 60);
    text(frame, `WBS owner ${index + 1}`, row[4], 1034, y + 13, 12, colors.text, false, 70);
  });

  card(frame, "Drawer", 1152, 200, 260, 412, "Selected item", "Drawer вместо постоянной формы");
  rect(frame, "Drawer selected", 1176, 278, 212, 72, colors.redSoft, { stroke: "#FECACA", radius: 10 });
  text(frame, "Drawer type", "RAID · риск 16", 1196, 292, 12, "#991B1B", true, 150);
  text(frame, "Drawer title", "Демо-элемент RAID 3", 1196, 316, 15, colors.text, true, 170);
  rect(frame, "Action plan", 1176, 402, 212, 82, colors.slateSoft, { stroke: "#E2E8F0", radius: 8 });
  text(frame, "Action plan text", "Подтвердить SLA и\nобновить прогноз UAT.", 1196, 420, 12, colors.text, false, 160);

  card(frame, "Gantt", 552, 632, 860, 348, "Gantt focused range", "90 дней, активные фазы раскрыты, критический путь поверх графика");
  rect(frame, "Gantt canvas", 576, 706, 812, 230, colors.slateSoft, { stroke: colors.border, radius: 8 });
  rect(frame, "Gantt labels", 576, 706, 190, 230, colors.white, { radius: 8 });
  line(frame, "Gantt today", 840, 748, 840, 920, colors.red, 2);
  [["4.3.2 Задача 107", 760, colors.red, 930, 320], ["4.8.1 Задача 134", 802, colors.green, 810, 160], ["3.4.1 Задача 67", 844, "#3B82F6", 880, 120], ["7.2.3 Задача 164", 886, "#94A3B8", 1010, 160]].forEach((row, index) => {
    text(frame, `Gantt row label ${index + 1}`, row[0], 592, row[1] + 4, 12, colors.text, true, 150);
    rect(frame, `Gantt bar ${index + 1}`, row[3], row[1], row[4], 18, row[2], { radius: 9 });
  });
}

async function main() {
  await figma.loadFontAsync({ family: "Inter", style: "Regular" });
  await figma.loadFontAsync({ family: "Inter", style: "Bold" });
  drawExecutiveCockpit();
  drawOperationalWorkspace();
  figma.viewport.scrollAndZoomIntoView(figma.currentPage.selection.length ? figma.currentPage.selection : figma.currentPage.children.slice(-2));
  figma.closePlugin("Created PMS UI/UX concept frames.");
}

main();
