import { Building2, Plus, Settings } from 'lucide-react';
import { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  BUSINESS_UNIT_STORAGE_KEY,
  BUSINESS_UNITS_CHANGED_EVENT,
  selectedBusinessUnitId,
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

type BusinessUnitSwitcherProps = {
  canManage?: boolean;
  onManage?: () => void;
};

export function BusinessUnitSwitcher({ canManage = false, onManage }: BusinessUnitSwitcherProps) {
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
            setSelectedId(stored);
            return;
          }
          const fallback = items.find((unit) => unit.isDefault) ?? items[0];
          if (!fallback) return;
          window.localStorage.setItem(BUSINESS_UNIT_STORAGE_KEY, fallback.id);
          setSelectedId(fallback.id);
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
      {(canManage || units.find((unit) => unit.id === selectedId)?.canManage) && onManage && (
        <button
          type="button"
          className="business-unit-manage-button"
          aria-label={canManage ? 'Создать бизнес-юнит' : 'Управлять бизнес-юнитом'}
          title={canManage ? 'Создать бизнес-юнит' : 'Управлять бизнес-юнитом'}
          onClick={onManage}
        >
          {canManage ? <Plus size={16} aria-hidden="true" /> : <Settings size={16} aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
