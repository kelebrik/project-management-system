import { usePageContext } from "./PageContext";

export function AdminIntegrationsPageContent() {
  const ctx = usePageContext();
  const {
    adminIntegrations,
    apiTokenDraft,
    createApiToken,
    createdApiToken,
    createWebhook,
    dateTime,
    reloadAdminIntegrations,
    saveSystemSettings,
    savingIntegration,
    savingSystemSettings,
    setApiTokenDraft,
    setSystemSettingsDraft,
    setWebhookDraft,
    systemSettingHasValue,
    systemSettings,
    systemSettingsDraft,
    testWebhook,
    toggleApiToken,
    toggleWebhook,
    webhookDraft,
  } = ctx;

  return (
                <article className="panel project-card admin-integrations-panel">
                  <div className="panel-title">
                    <div>
                      <h2>Администрирование: интеграции и API</h2>
                      <p>
                        API-токены, webhook API и настройки внешних контуров:
                        GitLab, GitHub, Azure DevOps и BI.
                      </p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminIntegrations()}>
                      Обновить
                    </button>
                  </div>

                  <div className="admin-integrations-grid">
                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>API-токены</h3>
                        <span>{adminIntegrations?.apiTokens.length ?? 0}</span>
                      </div>
                      {createdApiToken && (
                        <div className="token-once">
                          <b>Токен показан один раз</b>
                          <code>{createdApiToken}</code>
                        </div>
                      )}
                      <form className="integration-form" onSubmit={createApiToken}>
                        <label>
                          Название
                          <input
                            value={apiTokenDraft.name}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Права через запятую
                          <input
                            value={apiTokenDraft.scopes}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                scopes: event.target.value,
                              })
                            }
                            placeholder="project.read,wbs.read"
                          />
                        </label>
                        <label>
                          Лимит/мин.
                          <input
                            type="number"
                            min="10"
                            max="10000"
                            value={apiTokenDraft.rateLimitPerMinute}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                rateLimitPerMinute: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label>
                          Истекает
                          <input
                            type="date"
                            value={apiTokenDraft.expiresAt}
                            onChange={(event) =>
                              setApiTokenDraft({
                                ...apiTokenDraft,
                                expiresAt: event.target.value,
                              })
                            }
                          />
                        </label>
                        <button type="submit" disabled={savingIntegration}>
                          Создать токен
                        </button>
                      </form>
                      <div className="integration-table">
                        {(adminIntegrations?.apiTokens ?? []).map((token) => (
                          <div className="integration-row" key={token.id}>
                            <div>
                              <b>{token.name}</b>
                              <small>
                                {token.tokenPrefix}... / лимит {token.rateLimitPerMinute}
                                /мин.
                              </small>
                              <small>{token.scopes.join(", ") || "без прав"}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                token.isActive ? "active" : "inactive"
                              }`}
                            >
                              {token.isActive ? "Активен" : "Отключен"}
                            </span>
                            <button
                              type="button"
                              onClick={() => void toggleApiToken(token)}
                              disabled={savingIntegration}
                            >
                              {token.isActive ? "Отключить" : "Включить"}
                            </button>
                          </div>
                        ))}
                        {(adminIntegrations?.apiTokens.length ?? 0) === 0 && (
                          <div className="empty-state">API-токены еще не созданы.</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>Webhook API</h3>
                        <span>{adminIntegrations?.webhookEndpoints.length ?? 0}</span>
                      </div>
                      <form className="integration-form" onSubmit={createWebhook}>
                        <label>
                          Название
                          <input
                            value={webhookDraft.name}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                name: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="span-2">
                          URL
                          <input
                            value={webhookDraft.url}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                url: event.target.value,
                              })
                            }
                            placeholder="https://..."
                          />
                        </label>
                        <label>
                          События
                          <input
                            value={webhookDraft.events}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                events: event.target.value,
                              })
                            }
                            placeholder="* или project.updated"
                          />
                        </label>
                        <label>
                          Secret
                          <input
                            type="password"
                            value={webhookDraft.secret}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                secret: event.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="checkbox-line">
                          <input
                            type="checkbox"
                            checked={webhookDraft.isActive}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                isActive: event.target.checked,
                              })
                            }
                          />
                          Активен
                        </label>
                        <button type="submit" disabled={savingIntegration}>
                          Добавить webhook
                        </button>
                      </form>
                      <div className="integration-table">
                        {(adminIntegrations?.webhookEndpoints ?? []).map((endpoint) => (
                          <div className="integration-row" key={endpoint.id}>
                            <div>
                              <b>{endpoint.name}</b>
                              <small>{endpoint.url}</small>
                              <small>{endpoint.events.join(", ") || "*"}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                endpoint.isActive ? "active" : "inactive"
                              }`}
                            >
                              {endpoint.isActive ? "Активен" : "Отключен"}
                            </span>
                            <button
                              type="button"
                              onClick={() => void testWebhook(endpoint.id)}
                              disabled={savingIntegration || !endpoint.isActive}
                            >
                              Тест
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleWebhook(endpoint)}
                              disabled={savingIntegration}
                            >
                              {endpoint.isActive ? "Отключить" : "Включить"}
                            </button>
                          </div>
                        ))}
                        {(adminIntegrations?.webhookEndpoints.length ?? 0) === 0 && (
                          <div className="empty-state">Webhook endpoints еще не созданы.</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>Последние доставки</h3>
                        <span>{adminIntegrations?.webhookDeliveries.length ?? 0}</span>
                      </div>
                      <div className="integration-table compact">
                        {(adminIntegrations?.webhookDeliveries ?? []).map((delivery) => (
                          <div className="integration-row" key={delivery.id}>
                            <div>
                              <b>{delivery.eventType}</b>
                              <small>{delivery.endpoint?.name ?? delivery.endpointId}</small>
                              <small>{dateTime(delivery.attemptedAt ?? delivery.createdAt)}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                delivery.status === "DELIVERED" ? "active" : "inactive"
                              }`}
                            >
                              {delivery.status}
                            </span>
                            <small>{delivery.statusCode ?? delivery.error ?? ""}</small>
                          </div>
                        ))}
                        {(adminIntegrations?.webhookDeliveries.length ?? 0) === 0 && (
                          <div className="empty-state">Доставок пока нет.</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>Enterprise-интеграции</h3>
                      </div>
                      <form className="integration-form" onSubmit={saveSystemSettings}>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.gitlabEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                gitlabEnabled: event.target.checked,
                              })
                            }
                          />
                          GitLab включен
                        </label>
                        <label className="span-2">
                          GitLab URL
                          <input
                            value={systemSettingsDraft.gitlabBaseUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                gitlabBaseUrl: event.target.value,
                              })
                            }
                            placeholder="https://gitlab.company.ru"
                          />
                        </label>
                        <label className="span-2">
                          GitLab token
                          <input
                            type="password"
                            value={systemSettingsDraft.gitlabToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                gitlabToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "gitlab.token")
                                ? "задан, введите новый для замены"
                                : "не задан"
                            }
                          />
                        </label>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.githubEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                githubEnabled: event.target.checked,
                              })
                            }
                          />
                          GitHub включен
                        </label>
                        <label className="span-2">
                          GitHub API URL
                          <input
                            value={systemSettingsDraft.githubBaseUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                githubBaseUrl: event.target.value,
                              })
                            }
                            placeholder="https://api.github.com"
                          />
                        </label>
                        <label className="span-2">
                          GitHub token
                          <input
                            type="password"
                            value={systemSettingsDraft.githubToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                githubToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "github.token")
                                ? "задан, введите новый для замены"
                                : "не задан"
                            }
                          />
                        </label>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.azureDevOpsEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                azureDevOpsEnabled: event.target.checked,
                              })
                            }
                          />
                          Azure DevOps включен
                        </label>
                        <label className="span-2">
                          Azure DevOps organization URL
                          <input
                            value={systemSettingsDraft.azureDevOpsOrganizationUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                azureDevOpsOrganizationUrl: event.target.value,
                              })
                            }
                            placeholder="https://dev.azure.com/company"
                          />
                        </label>
                        <label className="span-2">
                          Azure DevOps token
                          <input
                            type="password"
                            value={systemSettingsDraft.azureDevOpsToken}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                azureDevOpsToken: event.target.value,
                              })
                            }
                            placeholder={
                              systemSettingHasValue(systemSettings, "azureDevOps.token")
                                ? "задан, введите новый для замены"
                                : "не задан"
                            }
                          />
                        </label>
                        <label className="checkbox-line span-2">
                          <input
                            type="checkbox"
                            checked={systemSettingsDraft.biEnabled}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                biEnabled: event.target.checked,
                              })
                            }
                          />
                          BI включен
                        </label>
                        <label className="span-2">
                          BI export URL
                          <input
                            value={systemSettingsDraft.biExportUrl}
                            onChange={(event) =>
                              setSystemSettingsDraft({
                                ...systemSettingsDraft,
                                biExportUrl: event.target.value,
                              })
                            }
                            placeholder="https://bi.company.ru/api/pms"
                          />
                        </label>
                        <button type="submit" disabled={savingSystemSettings}>
                          {savingSystemSettings ? "Сохраняю..." : "Сохранить интеграции"}
                        </button>
                      </form>
                      <div className="integration-settings-list">
                        {(adminIntegrations?.integrationSettings ?? []).map((setting) => (
                          <div key={setting.key}>
                            <b>{setting.key}</b>
                            <small>
                              {setting.isSecret
                                ? setting.hasValue
                                  ? "задано"
                                  : "не задано"
                                : setting.value || "не задано"}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </article>
              );
}
