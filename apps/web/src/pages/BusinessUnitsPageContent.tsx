import { Building2, Plus, Trash2 } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";

import { apiClient } from "../api/client";
import { BUSINESS_UNITS_CHANGED_EVENT } from "../app/businessUnitContext";
import { useConfirm } from "../hooks/useConfirm";
import { usePageContext } from "./PageContext";

type BusinessUnitRole = "ADMIN" | "VIEWER";

type BusinessUnitDirectoryUser = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
};

type BusinessUnit = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  canManage: boolean;
  memberships: Array<{
    id: string;
    userId: string;
    role: BusinessUnitRole;
    user: BusinessUnitDirectoryUser;
  }>;
  _count: { projects: number };
};

const roleLabels: Record<BusinessUnitRole, string> = {
  ADMIN: "Администратор БЮ",
  VIEWER: "Участник",
};

export function BusinessUnitsPageContent() {
  const { isAdminUser } = usePageContext();
  const confirm = useConfirm();
  const [units, setUnits] = useState<BusinessUnit[]>([]);
  const [users, setUsers] = useState<BusinessUnitDirectoryUser[]>([]);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [unitDraft, setUnitDraft] = useState({ code: "", name: "" });
  const [membershipDraft, setMembershipDraft] = useState({
    businessUnitId: "",
    userId: "",
    role: "VIEWER" as BusinessUnitRole,
  });

  async function loadUnits() {
    const data = await apiClient.get<BusinessUnit[]>(
      "/api/admin/business-units",
      "Не удалось загрузить бизнес-юниты",
    );
    setUnits(data);
    setMembershipDraft((current) => ({
      ...current,
      businessUnitId: current.businessUnitId || data.find((unit) => unit.canManage)?.id || "",
    }));
    setError("");
  }

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<BusinessUnit[]>(
        "/api/admin/business-units",
        "Не удалось загрузить бизнес-юниты",
      )
      .then(async (unitData) => {
        if (cancelled) return;
        setUnits(unitData);
        setMembershipDraft((current) => ({
          ...current,
          businessUnitId:
            current.businessUnitId || unitData.find((unit) => unit.canManage)?.id || "",
        }));
        if (!unitData.some((unit) => unit.canManage)) return;
        const userData = await apiClient.get<BusinessUnitDirectoryUser[]>(
          "/api/admin/business-unit-users",
          "Не удалось загрузить пользователей",
        );
        if (!cancelled) setUsers(userData);
      })
      .catch((loadError) => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить бизнес-юниты");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function createUnit(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setError("");
    try {
      await apiClient.post("/api/admin/business-units", unitDraft, "Не удалось создать бизнес-юнит");
      setUnitDraft({ code: "", name: "" });
      window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
      await loadUnits();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать бизнес-юнит");
    } finally {
      setCreating(false);
    }
  }

  async function saveMembership(event: FormEvent) {
    event.preventDefault();
    if (!membershipDraft.businessUnitId || !membershipDraft.userId) return;
    setError("");
    try {
      await apiClient.post(
        `/api/admin/business-units/${membershipDraft.businessUnitId}/memberships`,
        { userId: membershipDraft.userId, role: membershipDraft.role },
        "Не удалось назначить участника",
      );
      await loadUnits();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось назначить участника");
    }
  }

  const manageableUnits = units.filter((unit) => unit.canManage);

  return (
    <article className="panel project-card business-units-page">
      <section className="business-unit-admin" aria-labelledby="business-unit-heading">
        <div className="business-unit-admin-heading">
          <div>
            <h2 id="business-unit-heading"><Building2 size={20} /> Бизнес-юниты</h2>
            <p>Портфели проектов, участники и администраторы бизнес-юнитов.</p>
          </div>
          {isAdminUser && (
            <form className="business-unit-create" onSubmit={createUnit}>
              <input
                aria-label="Код бизнес-юнита"
                placeholder="Код, например retail"
                pattern="[a-z0-9-]+"
                value={unitDraft.code}
                onChange={(event) => setUnitDraft({
                  ...unitDraft,
                  code: event.currentTarget.value.toLowerCase(),
                })}
                required
              />
              <input
                aria-label="Название бизнес-юнита"
                placeholder="Название бизнес-юнита"
                value={unitDraft.name}
                onChange={(event) => setUnitDraft({ ...unitDraft, name: event.currentTarget.value })}
                required
              />
              <button type="submit" disabled={creating}>
                <Plus size={16} /> {creating ? "Создаю..." : "Создать"}
              </button>
            </form>
          )}
        </div>

        {error && <p className="business-unit-error">{error}</p>}

        {manageableUnits.length > 0 && (
          <form className="business-unit-membership-form" onSubmit={saveMembership}>
            <select
              aria-label="Бизнес-юнит для назначения"
              value={membershipDraft.businessUnitId}
              onChange={(event) => setMembershipDraft({ ...membershipDraft, businessUnitId: event.currentTarget.value })}
            >
              {manageableUnits.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
            <select
              aria-label="Пользователь бизнес-юнита"
              value={membershipDraft.userId}
              onChange={(event) => setMembershipDraft({ ...membershipDraft, userId: event.currentTarget.value })}
              required
            >
              <option value="">Выберите пользователя</option>
              {users.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
            </select>
            <select
              aria-label="Роль в бизнес-юните"
              value={membershipDraft.role}
              onChange={(event) => setMembershipDraft({ ...membershipDraft, role: event.currentTarget.value as BusinessUnitRole })}
            >
              <option value="VIEWER">{roleLabels.VIEWER}</option>
              <option value="ADMIN">{roleLabels.ADMIN}</option>
            </select>
            <button type="submit">Назначить</button>
          </form>
        )}

        <div className="business-unit-list">
          {units.map((unit) => (
            <div className="business-unit-row" key={unit.id}>
              <div className="business-unit-name">
                <b>{unit.name}</b>
                <small>{unit.code} · проектов: {unit._count.projects}{unit.isDefault ? " · основной" : ""}</small>
              </div>
              <div className="business-unit-members">
                {unit.memberships.map((membership) => (
                  <span className="business-unit-member" key={membership.id}>
                    <span>
                      <b>{membership.user.name}</b>
                      <small>{roleLabels[membership.role]}</small>
                    </span>
                    {unit.canManage && (
                      <button
                        type="button"
                        className="ghost-button icon-button"
                        aria-label={`Удалить ${membership.user.name} из бизнес-юнита`}
                        onClick={async () => {
                          if (!(await confirm({
                            title: "Отозвать участие?",
                            message: `${membership.user.name} больше не будет участником БЮ «${unit.name}». Общесистемный просмотр проектов сохранится.`,
                            confirmLabel: "Отозвать",
                          }))) return;
                          try {
                            await apiClient.delete(
                              `/api/admin/business-unit-memberships/${membership.id}`,
                              "Не удалось отозвать участие",
                            );
                            await loadUnits();
                          } catch (deleteError) {
                            setError(deleteError instanceof Error ? deleteError.message : "Не удалось отозвать участие");
                          }
                        }}
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </span>
                ))}
                {unit.canManage && unit.memberships.length === 0 && (
                  <small>Назначенных участников пока нет</small>
                )}
                {!unit.canManage && <small>Состав доступен администратору БЮ</small>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </article>
  );
}
