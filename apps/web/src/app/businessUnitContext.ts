export const BUSINESS_UNIT_STORAGE_KEY = 'pms-business-unit-id';
export const BUSINESS_UNIT_SELECTION_STORAGE_KEY = 'pms-business-unit-selection';
export const BUSINESS_UNIT_HEADER = 'X-Business-Unit-ID';
export const BUSINESS_UNITS_CHANGED_EVENT = 'pms-business-units-changed';

export function selectedBusinessUnitId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(BUSINESS_UNIT_STORAGE_KEY);
}

export type BusinessUnitSelection = { id: string; name: string };

type SelectionStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function readBusinessUnitSelection(
  storage: SelectionStorage,
): BusinessUnitSelection | null {
  try {
    const value = storage.getItem(BUSINESS_UNIT_SELECTION_STORAGE_KEY);
    if (!value) return null;
    const parsed = JSON.parse(value) as Partial<BusinessUnitSelection>;
    if (
      typeof parsed.id !== 'string' ||
      !parsed.id.trim() ||
      typeof parsed.name !== 'string' ||
      !parsed.name.trim() ||
      storage.getItem(BUSINESS_UNIT_STORAGE_KEY) !== parsed.id
    ) return null;
    return { id: parsed.id, name: parsed.name };
  } catch {
    return null;
  }
}

export function selectedBusinessUnitSelection() {
  if (typeof window === 'undefined') return null;
  return readBusinessUnitSelection(window.localStorage);
}

export function storeBusinessUnitSelection(
  storage: SelectionStorage,
  selection: BusinessUnitSelection,
) {
  storage.setItem(BUSINESS_UNIT_SELECTION_STORAGE_KEY, JSON.stringify(selection));
  storage.setItem(BUSINESS_UNIT_STORAGE_KEY, selection.id);
}

export function businessUnitHeaders() {
  const businessUnitId = selectedBusinessUnitId();
  return businessUnitId ? { [BUSINESS_UNIT_HEADER]: businessUnitId } : {};
}
