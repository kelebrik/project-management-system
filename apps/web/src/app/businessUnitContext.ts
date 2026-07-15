export const BUSINESS_UNIT_STORAGE_KEY = 'pms-business-unit-id';
export const BUSINESS_UNIT_HEADER = 'X-Business-Unit-ID';
export const BUSINESS_UNITS_CHANGED_EVENT = 'pms-business-units-changed';

export function selectedBusinessUnitId() {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(BUSINESS_UNIT_STORAGE_KEY);
}

export function businessUnitHeaders() {
  const businessUnitId = selectedBusinessUnitId();
  return businessUnitId ? { [BUSINESS_UNIT_HEADER]: businessUnitId } : {};
}
