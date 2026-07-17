import { usePageContext } from "./PageContext";

export function AdminDictionariesPageContent() {
  const ctx = usePageContext();
  const {
    adminDictionaryLabels,
    createDictionaryItem,
    creatingDictionaryItem,
    deactivateDictionaryItem,
    dictionaryDrafts,
    dictionaryItemToDraft,
    dictionaryLabel,
    filteredDictionaryItems,
    newDictionaryDraft,
    saveDictionaryItem,
    savingDictionaryItemId,
    selectedDictionary,
    setNewDictionaryDraft,
    setSelectedDictionary,
    updateDictionaryDraft,
  } = ctx;

  return (
                    <article className="panel project-card">
                      <div className="panel-title">
                        <div>
                          <p>Единые значения для типов, статусов и критичности</p>
                        </div>
                      </div>
                      <div className="dictionary-filter">
                        <label>
                          Справочник
                          <select
                            value={selectedDictionary}
                            onChange={(event) => {
                              setSelectedDictionary(event.target.value);
                              setNewDictionaryDraft((current) => ({
                                ...current,
                                dictionary: event.target.value,
                              }));
                            }}
                          >
                            {Object.keys(adminDictionaryLabels).map((dictionary) => (
                              <option key={dictionary} value={dictionary}>
                                {dictionaryLabel(dictionary)}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <form className="dictionary-create-form" onSubmit={createDictionaryItem}>
                        <label>
                          Справочник
                          <select
                            value={newDictionaryDraft.dictionary}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                dictionary: event.target.value,
                              })
                            }
                          >
                            {Object.keys(adminDictionaryLabels).map((dictionary) => (
                              <option key={dictionary} value={dictionary}>
                                {dictionaryLabel(dictionary)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Код
                          <input
                            value={newDictionaryDraft.code}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                code: event.target.value,
                              })
                            }
                            placeholder="CODE"
                          />
                        </label>
                        <label>
                          Название
                          <input
                            value={newDictionaryDraft.label}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                label: event.target.value,
                              })
                            }
                            placeholder="Название"
                          />
                        </label>
                        <label>
                          Порядок
                          <input
                            type="number"
                            value={newDictionaryDraft.sortOrder}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                sortOrder: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button type="submit" disabled={creatingDictionaryItem}>
                          {creatingDictionaryItem ? "Сохраняю..." : "Добавить"}
                        </button>
                      </form>
                      <div className="dictionary-table">
                        <div className="dictionary-head">
                          <span>Справочник</span>
                          <span>Код</span>
                          <span>Название</span>
                          <span>Описание</span>
                          <span>Порядок</span>
                          <span>Активен</span>
                          <span />
                        </div>
                        {filteredDictionaryItems.map((item) => {
                          const draft =
                            dictionaryDrafts[item.id] ?? dictionaryItemToDraft(item);
                          return (
                            <div className="dictionary-row" key={item.id}>
                              <label>
                                <span>Справочник</span>
                                <select
                                  value={draft.dictionary}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      dictionary: event.target.value,
                                    })
                                  }
                                >
                                  {Object.keys(adminDictionaryLabels).map((dictionary) => (
                                    <option key={dictionary} value={dictionary}>
                                      {dictionaryLabel(dictionary)}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label>
                                <span>Код</span>
                                <input
                                  value={draft.code}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      code: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>Название</span>
                                <input
                                  value={draft.label}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      label: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>Описание</span>
                                <input
                                  value={draft.description}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      description: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label>
                                <span>Порядок</span>
                                <input
                                  type="number"
                                  value={draft.sortOrder}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      sortOrder: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label className="checkbox-field">
                                <span>Активен</span>
                                <input
                                  type="checkbox"
                                  checked={draft.isActive}
                                  onChange={(event) =>
                                    updateDictionaryDraft(item.id, {
                                      isActive: event.target.checked,
                                    })
                                  }
                                />
                              </label>
                              <div className="dictionary-actions">
                                <button
                                  type="button"
                                  onClick={() => void saveDictionaryItem(item.id)}
                                  disabled={savingDictionaryItemId === item.id}
                                >
                                  {savingDictionaryItemId === item.id
                                    ? "Сохраняю..."
                                    : "Сохранить"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deactivateDictionaryItem(item.id)}
                                  disabled={
                                    savingDictionaryItemId === item.id || !item.isActive
                                  }
                                >
                                  Отключить
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {filteredDictionaryItems.length === 0 && (
                          <div className="empty-state">В выбранном справочнике пока нет записей.</div>
                        )}
                      </div>
	                    </article>
	              );
}
