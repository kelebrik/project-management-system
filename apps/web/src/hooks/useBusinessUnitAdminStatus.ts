import { useEffect, useState } from "react";
import type { CurrentUser } from "../app/adminTypes";
import {
  BUSINESS_UNIT_STORAGE_KEY,
  BUSINESS_UNITS_CHANGED_EVENT,
  selectedBusinessUnitId,
} from "../app/businessUnitContext";

export function isBusinessUnitAdminForSelectedUnit(
  businessUnitAdminIds: string[],
  businessUnitId: string | null,
) {
  return Boolean(businessUnitId && businessUnitAdminIds.includes(businessUnitId));
}

export function useBusinessUnitAdminStatus(
  currentUser: CurrentUser | null,
  authReady: boolean,
) {
  const [businessUnitId, setBusinessUnitId] = useState(selectedBusinessUnitId);

  useEffect(() => {
    const syncSelection = () => setBusinessUnitId(selectedBusinessUnitId());
    const syncStorageSelection = (event: StorageEvent) => {
      if (event.key === null || event.key === BUSINESS_UNIT_STORAGE_KEY) syncSelection();
    };
    syncSelection();
    window.addEventListener(BUSINESS_UNITS_CHANGED_EVENT, syncSelection);
    window.addEventListener("storage", syncStorageSelection);
    return () => {
      window.removeEventListener(BUSINESS_UNITS_CHANGED_EVENT, syncSelection);
      window.removeEventListener("storage", syncStorageSelection);
    };
  }, []);

  useEffect(() => {
    if (
      !authReady ||
      !currentUser ||
      currentUser.role === "ADMIN" ||
      businessUnitId ||
      !currentUser.businessUnitAdminIds?.length
    ) return;
    const initialBusinessUnitId = currentUser.businessUnitAdminIds[0];
    window.localStorage.setItem(BUSINESS_UNIT_STORAGE_KEY, initialBusinessUnitId);
    window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
  }, [authReady, businessUnitId, currentUser]);

  if (!authReady || !currentUser || currentUser.role === "ADMIN") {
    return { isBusinessUnitAdmin: false, isBusinessUnitAdminResolved: true };
  }
  return {
    isBusinessUnitAdmin: isBusinessUnitAdminForSelectedUnit(
      currentUser.businessUnitAdminIds ?? [],
      businessUnitId,
    ),
    isBusinessUnitAdminResolved:
      businessUnitId !== null || (currentUser.businessUnitAdminIds?.length ?? 0) === 0,
  };
}
