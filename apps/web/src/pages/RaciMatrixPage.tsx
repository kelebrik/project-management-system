import { Download } from "lucide-react";
import { normalizePersonName } from "@pms/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "../api/client";
import { buildRaciGrid, raciCsv, type RaciData, type RaciRole } from "../app/raci";
import { useI18n } from "../i18n/I18nProvider";
import "../styles/raci.css";
import { usePageContext } from "./PageContext";

const ROLES: RaciRole[] = ["R", "A", "C", "I"];

/**
 * Who is Responsible, Accountable, Consulted and Informed for each phase,
 * work package and deliverable of the chosen project. A row with no A or R is
 * marked; the matrix exports to CSV for Excel.
 */
export function RaciMatrixPage() {
  const { t } = useI18n();
  const ctx = usePageContext();
  const project = ctx.project;
  const canWrite = Boolean(ctx.canWriteSelectedProject) && project?.status !== "CLOSED";
  const [data, setData] = useState<RaciData | null>(null);
  // People added by hand, kept with the project they were added in.
  const [added, setAdded] = useState<{ projectId: string | null; people: string[] }>({ projectId: null, people: [] });
  const [newPerson, setNewPerson] = useState("");
  const [employees, setEmployees] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!project) return;
    apiClient
      .get<RaciData>(`/api/projects/${project.id}/raci`, t("ui.raci.failed"))
      .then((answer) => {
        setData(answer);
        setError("");
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : t("ui.raci.failed")));
  }, [project, t]);
  useEffect(load, [load]);
  const projectId: string | null = project?.id ?? null;
  const extraPeople = useMemo(() => (added.projectId === projectId ? added.people : []), [added, projectId]);
  useEffect(() => {
    apiClient
      .get<Array<{ name: string }>>("/api/employees")
      .then((rows) => setEmployees(rows.map((row) => row.name)))
      .catch(() => setEmployees([]));
  }, []);

  const view = useMemo(() => {
    if (!data) return null;
    // One column per person however the name is written.
    const known = new Set(data.people.map(normalizePersonName));
    const people = [...data.people];
    for (const person of extraPeople) {
      const key = normalizePersonName(person);
      if (key && !known.has(key)) {
        known.add(key);
        people.push(person);
      }
    }
    return { ...data, people };
  }, [data, extraPeople]);
  const grid = useMemo(() => (view ? buildRaciGrid(view) : []), [view]);

  const setRole = async (wbsItemId: string, personName: string, role: RaciRole | null) => {
    if (!project) return;
    setSaving(`${wbsItemId}:${personName}`);
    setError("");
    try {
      await apiClient.put(`/api/projects/${project.id}/raci/cell`, { wbsItemId, personName, role }, t("ui.raci.failed"));
      load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : t("ui.raci.failed"));
    } finally {
      setSaving(null);
    }
  };

  const exportCsv = () => {
    if (!view || !project) return;
    const url = URL.createObjectURL(new Blob([raciCsv(view, { code: t("ui.raci.code"), title: t("ui.raci.row") })], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `raci-${project.code}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (!project) return <section className="v2-page raci-page"><p>{t("ui.raci.chooseProject")}</p></section>;
  return (
    <section className="v2-page raci-page">
      <div className="v2-compact-header">
        <div>
          <h2>{t("ui.raci.title")}</h2>
          <span>{t("ui.raci.description")}</span>
        </div>
        <button className="raci-export" disabled={!view} onClick={exportCsv} type="button">
          <Download aria-hidden="true" size={15} />
          {t("ui.raci.export")}
        </button>
      </div>
      <p className="raci-legend">{t("ui.raci.legend")}</p>
      {canWrite && (
        <div className="raci-add">
          <label>
            {t("ui.raci.addPerson")}
            <input list="raci-employees" maxLength={120} onChange={(event) => setNewPerson(event.target.value)} value={newPerson} />
          </label>
          <datalist id="raci-employees">
            {employees.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
          <button
            disabled={newPerson.trim().length < 2}
            onClick={() => {
              setAdded({ projectId, people: [...extraPeople, newPerson.trim()] });
              setNewPerson("");
            }}
            type="button"
          >
            {t("ui.raci.add")}
          </button>
        </div>
      )}
      {error && (
        <p className="automation-error" role="alert">
          {error}
        </p>
      )}
      {view && view.rows.length === 0 && <p>{t("ui.raci.noRows")}</p>}
      {view && view.rows.length > 0 && (
        <div className="raci-scroll">
          <table className="raci-table">
            <thead>
              <tr>
                <th>{t("ui.raci.row")}</th>
                {view.people.map((person) => (
                  <th key={person} scope="col">
                    {person}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((line) => (
                <tr key={line.row.id}>
                  <th scope="row" style={{ paddingLeft: 8 + line.depth * 16 }}>
                    <span className="raci-code">{line.row.code}</span> {line.row.title}
                    {(line.missingA || line.missingR) && (
                      <small className="raci-missing">{[line.missingA && t("ui.raci.noA"), line.missingR && t("ui.raci.noR")].filter(Boolean).join(", ")}</small>
                    )}
                  </th>
                  {view.people.map((person, index) => {
                    const role = line.roles[index];
                    return (
                      <td className={role ? `raci-${role}` : ""} key={person}>
                        {canWrite ? (
                          <select
                            aria-label={t("ui.raci.cell", { row: line.row.code, person })}
                            disabled={saving === `${line.row.id}:${person}`}
                            onChange={(event) => void setRole(line.row.id, person, (event.target.value || null) as RaciRole | null)}
                            value={role ?? ""}
                          >
                            <option value="">—</option>
                            {ROLES.map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        ) : (
                          role ?? ""
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
