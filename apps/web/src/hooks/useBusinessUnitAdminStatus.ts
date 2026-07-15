import { useEffect, useState } from "react";

import { apiClient } from "../api/client";
import type { CurrentUser } from "../app/adminTypes";
import {
  BUSINESS_UNITS_CHANGED_EVENT,
  selectedBusinessUnitId,
} from "../app/businessUnitContext";

type BusinessUnitAccess = {
  id: string;
  isDefault: boolean;
  canManage: boolean;
};

export function useBusinessUnitAdminStatus(
  currentUser: CurrentUser | null,
  authReady: boolean,
) {
  const [status, setStatus] = useState<boolean | null>(null);

  useEffect(() => {
    if (!authReady || !currentUser || currentUser.role === "ADMIN") return;
    let cancelled = false;
    const resetId = window.setTimeout(() => {
      if (!cancelled) setStatus(null);
    }, 0);
    const load = () => {
      void apiClient
        .get<BusinessUnitAccess[]>("/api/business-units", "Не удалось проверить роль в БЮ")
        .then((units) => {
          if (cancelled) return;
          const selectedId = selectedBusinessUnitId();
          const selected =
            units.find((unit) => unit.id === selectedId) ??
            units.find((unit) => unit.isDefault) ??
            units[0];
          setStatus(selected?.canManage ?? false);
        })
        .catch(() => {
          if (!cancelled) setStatus(false);
        });
    };
    load();
    window.addEventListener(BUSINESS_UNITS_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      window.clearTimeout(resetId);
      window.removeEventListener(BUSINESS_UNITS_CHANGED_EVENT, load);
    };
  }, [authReady, currentUser]);

  if (!authReady || !currentUser || currentUser.role === "ADMIN") {
    return { isBusinessUnitAdmin: false, isBusinessUnitAdminResolved: true };
  }
  return {
    isBusinessUnitAdmin: status === true,
    isBusinessUnitAdminResolved: status !== null,
  };
}
