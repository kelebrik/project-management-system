import { ChevronDown, Search } from "lucide-react";
import { useMemo, useState } from "react";

import {
  filterProjectStructureCopyOptions,
  togglePhaseSelection,
  toggleWholeProjectSelection,
  type ProjectStructureCopyOption,
  type ProjectStructureCopySelection,
} from "../app/projectStructureCopy";

type ProjectStructureCopyFieldProps = {
  error: string | null;
  isLoading: boolean;
  onChange: (selection: ProjectStructureCopySelection[]) => void;
  options: ProjectStructureCopyOption[];
  value: ProjectStructureCopySelection[];
};

export function ProjectStructureCopyField({
  error,
  isLoading,
  onChange,
  options,
  value,
}: ProjectStructureCopyFieldProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const filteredOptions = useMemo(
    () => filterProjectStructureCopyOptions(options, query),
    [options, query],
  );
  const selectedCount = value.reduce(
    (total, selection) =>
      total + (selection.phaseIds === null ? 1 : selection.phaseIds.length),
    0,
  );

  return (
    <div className="structure-copy-field">
      <button
        type="button"
        className="structure-copy-trigger"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((current) => !current)}
      >
        <span>
          {selectedCount > 0
            ? `Выбрано: ${selectedCount}`
            : "Не копировать, создать тестовую структуру"}
        </span>
        <ChevronDown size={16} />
      </button>
      {isOpen && (
        <div className="structure-copy-popover">
          <label className="structure-copy-search">
            <Search size={16} />
            <input
              aria-label="Поиск проектов и фаз"
              value={query}
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder="Поиск по проекту или фазе"
            />
          </label>
          <div className="structure-copy-options">
            {filteredOptions.map((project) => {
              const selection = value.find((item) => item.projectId === project.id);
              const wholeProjectSelected = selection?.phaseIds === null;
              return (
                <section className="structure-copy-project" key={project.id}>
                  <label className="structure-copy-project-option">
                    <input
                      type="checkbox"
                      checked={wholeProjectSelected}
                      onChange={(event) =>
                        onChange(
                          toggleWholeProjectSelection(
                            value,
                            project.id,
                            event.currentTarget.checked,
                          ),
                        )
                      }
                    />
                    <span>
                      <b>{project.code} · {project.name}</b>
                      <small>{project.businessUnit.name} · весь проект</small>
                    </span>
                  </label>
                  {project.phases.map((phase) => (
                    <label className="structure-copy-phase-option" key={phase.id}>
                      <input
                        type="checkbox"
                        disabled={wholeProjectSelected}
                        checked={
                          wholeProjectSelected ||
                          Boolean(selection?.phaseIds?.includes(phase.id))
                        }
                        onChange={(event) =>
                          onChange(
                            togglePhaseSelection(
                              value,
                              project.id,
                              phase.id,
                              event.currentTarget.checked,
                            ),
                          )
                        }
                      />
                      <span>{phase.code} · {phase.title}</span>
                    </label>
                  ))}
                </section>
              );
            })}
            {!isLoading && filteredOptions.length === 0 && (
              <div className="structure-copy-empty">
                {error ?? "Проекты и фазы не найдены"}
              </div>
            )}
            {isLoading && <div className="structure-copy-empty">Загрузка структуры…</div>}
          </div>
        </div>
      )}
    </div>
  );
}
