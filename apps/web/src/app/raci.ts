import { normalizePersonName } from "@pms/shared";

export type RaciRole = "R" | "A" | "C" | "I";
export type RaciRow = { id: string; code: string; title: string; type: string; parentId: string | null };
export type RaciAssignment = { wbsItemId: string; personName: string; personKey: string; role: RaciRole };
export type RaciData = { rows: RaciRow[]; people: string[]; assignments: RaciAssignment[] };

const cellKey = (rowId: string, person: string) => `${rowId}:${normalizePersonName(person)}`;

/** Each row's roles by person, its depth for indenting, and what is missing: an Accountable and a Responsible. */
export function buildRaciGrid(data: RaciData) {
  const roles = new Map(data.assignments.map((assignment) => [`${assignment.wbsItemId}:${assignment.personKey}`, assignment.role]));
  const byId = new Map(data.rows.map((row) => [row.id, row]));
  const depth = (row: RaciRow) => {
    let level = 0;
    for (let parent = row.parentId ? byId.get(row.parentId) : undefined; parent && level < 10; parent = parent.parentId ? byId.get(parent.parentId) : undefined) level += 1;
    return level;
  };
  return data.rows.map((row) => {
    const rowRoles = data.people.map((person) => roles.get(cellKey(row.id, person)) ?? null);
    return { row, depth: depth(row), roles: rowRoles, missingA: !rowRoles.includes("A"), missingR: !rowRoles.includes("R") };
  });
}

/** A spreadsheet cell that cannot be read as a formula, quoted for semicolon-separated CSV. */
export function safeCsvCell(value: string) {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[;"\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/** The matrix as CSV for Excel: a byte order mark, semicolons, one line per row. */
export function raciCsv(data: RaciData, heading: { code: string; title: string }) {
  const grid = buildRaciGrid(data);
  const lines = [[heading.code, heading.title, ...data.people].map(safeCsvCell).join(";")];
  for (const line of grid) lines.push([line.row.code, line.row.title, ...line.roles.map((role) => role ?? "")].map(safeCsvCell).join(";"));
  return `\uFEFF${lines.join("\r\n")}`;
}
