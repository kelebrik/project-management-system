import { Building2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  BUSINESS_UNIT_STORAGE_KEY,
  selectedBusinessUnitId,
} from '../app/businessUnitContext';

type BusinessUnitOption = {
  id: string;
  code: string;
  name: string;
  isDefault: boolean;
  role: 'ADMIN' | 'PROJECT_MANAGER' | 'VIEWER' | 'GUEST';
  projectCount: number;
};

export function BusinessUnitSwitcher() {
  const [units, setUnits] = useState<BusinessUnitOption[]>([]);
  const [selectedId, setSelectedId] = useState(selectedBusinessUnitId() ?? '');

  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<BusinessUnitOption[]>('/api/business-units', 'Не удалось загрузить бизнес-юниты')
      .then((items) => {
        if (cancelled) return;
        setUnits(items);
        const stored = selectedBusinessUnitId();
        if (stored && items.some((unit) => unit.id === stored)) {
          setSelectedId(stored);
          return;
        }
        const fallback = items.find((unit) => unit.isDefault) ?? items[0];
        if (!fallback) return;
        window.localStorage.setItem(BUSINESS_UNIT_STORAGE_KEY, fallback.id);
        setSelectedId(fallback.id);
      })
      .catch(() => setUnits([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (units.length === 0) return null;

  return (
    <label className="business-unit-switcher" title="Текущий бизнес-юнит">
      <Building2 size={15} aria-hidden="true" />
      <select
        aria-label="Бизнес-юнит"
        value={selectedId}
        onChange={(event) => {
          const nextId = event.currentTarget.value;
          window.localStorage.setItem(BUSINESS_UNIT_STORAGE_KEY, nextId);
          setSelectedId(nextId);
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
  );
}
