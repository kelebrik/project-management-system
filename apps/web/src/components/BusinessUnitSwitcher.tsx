import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  BUSINESS_UNITS_CHANGED_EVENT,
  selectedBusinessUnitId,
  storeBusinessUnitSelection,
} from '../app/businessUnitContext';

type BusinessUnitOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  role: 'ADMIN' | 'VIEWER' | 'GUEST';
  canManage: boolean;
  projectCount: number;
};

export function BusinessUnitSwitcher() {
  const [units, setUnits] = useState<BusinessUnitOption[]>([]);
  const [selectedId, setSelectedId] = useState(selectedBusinessUnitId() ?? '');

  useEffect(() => {
    let cancelled = false;
    const loadUnits = () => {
      void apiClient
        .get<BusinessUnitOption[]>('/api/business-units', 'Не удалось загрузить бизнес-юниты')
        .then((items) => {
          if (cancelled) return;
          setUnits(items);
          const stored = selectedBusinessUnitId();
          if (stored && items.some((unit) => unit.id === stored)) {
            const selected = items.find((unit) => unit.id === stored)!;
            storeBusinessUnitSelection(window.localStorage, selected);
            setSelectedId(stored);
            return;
          }
          const fallback = items.find((unit) => unit.isDefault) ?? items[0];
          if (!fallback) return;
          storeBusinessUnitSelection(window.localStorage, fallback);
          setSelectedId(fallback.id);
          window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
        })
        .catch(() => {
          if (!cancelled) setUnits([]);
        });
    };
    loadUnits();
    window.addEventListener(BUSINESS_UNITS_CHANGED_EVENT, loadUnits);
    return () => {
      cancelled = true;
      window.removeEventListener(BUSINESS_UNITS_CHANGED_EVENT, loadUnits);
    };
  }, []);

  if (units.length === 0) return null;

  return (
    <div className="business-unit-switcher-group">
      <label className="business-unit-switcher" title="Текущий бизнес-юнит">
        <Building2 size={15} aria-hidden="true" />
        <select
          aria-label="Бизнес-юнит"
          value={selectedId}
          onChange={(event) => {
            const nextId = event.currentTarget.value;
            const selected = units.find((unit) => unit.id === nextId);
            if (!selected) return;
            storeBusinessUnitSelection(window.localStorage, selected);
            setSelectedId(nextId);
            window.dispatchEvent(new CustomEvent(BUSINESS_UNITS_CHANGED_EVENT));
            window.location.assign('/portfolio');
          }}
        >
          {units.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
