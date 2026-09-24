import { useState } from "react";
import type { LeaveType } from "../../app/leaveScheduleModel";
import { useI18n } from "../../i18n/I18nProvider";
import { LeaveDialog } from "./LeaveDialog";

type TypeDraft = Pick<LeaveType, "name" | "nameEn" | "color" | "isActive">;

function TypeRow({ type, onSave }: { type: LeaveType; onSave: (patch: TypeDraft) => Promise<void> }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<TypeDraft>({
    name: type.name,
    nameEn: type.nameEn,
    color: type.color,
    isActive: type.isActive,
  });
  const changed =
    draft.name.trim() !== type.name ||
    draft.nameEn.trim() !== type.nameEn ||
    draft.color !== type.color ||
    draft.isActive !== type.isActive;
  return (
    <tr className={type.isActive ? "" : "archived"}>
      <td className="leave-check-cell">
        <input
          aria-label={t("ui.leave.color")}
          type="color"
          value={draft.color}
          onChange={(event) => setDraft({ ...draft, color: event.target.value })}
        />
      </td>
      <td>
        <input
          aria-label={t("ui.leave.name")}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
      </td>
      <td>
        <input
          aria-label={t("ui.leave.nameEn")}
          value={draft.nameEn}
          onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
        />
      </td>
      <td className="leave-check-cell">
        <input
          aria-label={t("ui.leave.active")}
          checked={draft.isActive}
          type="checkbox"
          onChange={(event) => setDraft({ ...draft, isActive: event.target.checked })}
        />
      </td>
      <td className="leave-row-actions">
        <button
          className="primary"
          disabled={!changed || !draft.name.trim()}
          onClick={() => void onSave({ ...draft, name: draft.name.trim(), nameEn: draft.nameEn.trim() })}
          type="button"
        >
          {t("ui.leave.save")}
        </button>
      </td>
    </tr>
  );
}

export function LeaveTypesDialog({
  types,
  onCreate,
  onUpdate,
  onClose,
}: {
  types: LeaveType[];
  onCreate: (draft: TypeDraft) => Promise<void>;
  onUpdate: (type: LeaveType, patch: TypeDraft) => Promise<void>;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState<TypeDraft>({ name: "", nameEn: "", color: "#26a69a", isActive: true });
  const [error, setError] = useState<string | null>(null);

  const guard = async (action: () => Promise<void>) => {
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    }
  };

  return (
    <LeaveDialog closeLabel={t("ui.leave.close")} onClose={onClose} title={t("ui.leave.leaveTypes")} wide>
      <form
        className="leave-inline-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (!draft.name.trim()) return;
          void guard(async () => {
            await onCreate({ ...draft, name: draft.name.trim(), nameEn: draft.nameEn.trim() });
            setDraft({ ...draft, name: "", nameEn: "" });
          });
        }}
      >
        <input
          aria-label={t("ui.leave.color")}
          type="color"
          value={draft.color}
          onChange={(event) => setDraft({ ...draft, color: event.target.value })}
        />
        <input
          aria-label={t("ui.leave.name")}
          placeholder={t("ui.leave.name")}
          value={draft.name}
          onChange={(event) => setDraft({ ...draft, name: event.target.value })}
        />
        <input
          aria-label={t("ui.leave.nameEn")}
          placeholder={t("ui.leave.nameEn")}
          value={draft.nameEn}
          onChange={(event) => setDraft({ ...draft, nameEn: event.target.value })}
        />
        <button className="primary" disabled={!draft.name.trim()} type="submit">
          {t("ui.leave.addType")}
        </button>
      </form>
      {error && (
        <p className="leave-form-error" role="alert">
          {error}
        </p>
      )}
      <table className="leave-table">
        <thead>
          <tr>
            <th>{t("ui.leave.color")}</th>
            <th>{t("ui.leave.name")}</th>
            <th>{t("ui.leave.nameEn")}</th>
            <th>{t("ui.leave.active")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {types.map((type) => (
            <TypeRow
              key={`${type.id}:${type.name}:${type.nameEn}:${type.color}:${type.isActive}`}
              onSave={(patch) => guard(() => onUpdate(type, patch))}
              type={type}
            />
          ))}
        </tbody>
      </table>
    </LeaveDialog>
  );
}
