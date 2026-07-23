export type BusinessUnitOption = {
  id: string;
  name: string;
  isDefault: boolean;
};

export function businessUnitForProjectCreation(
  units: BusinessUnitOption[],
  selectedId: string | null,
) {
  return units.find((unit) => unit.id === selectedId) ??
    units.find((unit) => unit.isDefault) ??
    units[0] ?? null;
}

export function projectCreationBusinessUnitMessage(name: string) {
  return `Проект будет создан в бизнес-юните «${name}». Проверьте выбранный БЮ перед созданием проекта.`;
}
