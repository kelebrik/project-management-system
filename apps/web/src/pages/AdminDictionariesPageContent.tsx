import { useI18n } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

export function AdminDictionariesPageContent() {
  const { t } = useI18n();
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
                          <p>{t("admin.dictionaries.description")}</p>
                        </div>
                      </div>
                      <div className="dictionary-filter">
                        <label>
                          {t("admin.dictionary")}
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
                          {t("admin.dictionary")}
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
                          {t("fields.code")}
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
                          {t("fields.title")}
                          <input
                            value={newDictionaryDraft.label}
                            onChange={(event) =>
                              setNewDictionaryDraft({
                                ...newDictionaryDraft,
                                label: event.target.value,
                              })
                            }
                            placeholder={t("fields.title")}
                          />
                        </label>
                        <label>
                          {t("fields.order")}
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
                          {creatingDictionaryItem ? t("fields.saving") : t("admin.add")}
                        </button>
                      </form>
                      <div className="dictionary-table">
                        <div className="dictionary-head">
                          <span>{t("admin.dictionary")}</span>
                          <span>{t("fields.code")}</span>
                          <span>{t("fields.title")}</span>
                          <span>{t("fields.description")}</span>
                          <span>{t("fields.order")}</span>
                          <span>{t("admin.active")}</span>
                          <span />
                        </div>
                        {filteredDictionaryItems.map((item) => {
                          const draft =
                            dictionaryDrafts[item.id] ?? dictionaryItemToDraft(item);
                          return (
                            <div className="dictionary-row" key={item.id}>
                              <label>
                                <span>{t("admin.dictionary")}</span>
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
                                <span>{t("fields.code")}</span>
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
                                <span>{t("fields.title")}</span>
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
                                <span>{t("fields.description")}</span>
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
                                <span>{t("fields.order")}</span>
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
                                <span>{t("admin.active")}</span>
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
                                    ? t("fields.saving")
                                    : t("fields.save")}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => void deactivateDictionaryItem(item.id)}
                                  disabled={
                                    savingDictionaryItemId === item.id || !item.isActive
                                  }
                                >
                                  {t("admin.disable")}
                                </button>
                              </div>
                            </div>
                          );
                        })}
                        {filteredDictionaryItems.length === 0 && (
                          <div className="empty-state">{t("admin.dictionaries.empty")}</div>
                        )}
                      </div>
	                    </article>
	              );
}
