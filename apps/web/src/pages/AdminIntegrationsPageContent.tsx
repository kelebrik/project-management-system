import { useI18n as useInterfaceTranslation } from "../i18n/I18nProvider";
import { usePageContext } from "./PageContext";

export function AdminIntegrationsPageContent() {
  const { t: uiText } = useInterfaceTranslation();
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
                      <p>
                        {uiText("ui.admin.integrationsDescription")}
                      </p>
                    </div>
                    <button type="button" onClick={() => void reloadAdminIntegrations()}>
                      {uiText("ui.admin.refresh")}
                    </button>
                  </div>

                  <div className="admin-integrations-grid">
                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>{uiText("ui.admin.apiTokens")}</h3>
                        <span>{adminIntegrations?.apiTokens.length ?? 0}</span>
                      </div>
                      {createdApiToken && (
                        <div className="token-once">
                          <b>{uiText("ui.admin.tokenShownOnce")}</b>
                          <code>{createdApiToken}</code>
                        </div>
                      )}
                      <form className="integration-form" onSubmit={createApiToken}>
                        <label>
                          {uiText("ui.admin.name")}
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
                          {uiText("ui.admin.commaSeparatedScopes")}
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
                          {uiText("ui.admin.limitPerMinute")}
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
                          {uiText("ui.admin.expires")}
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
                          {uiText("ui.admin.createToken")}
                        </button>
                      </form>
                      <div className="integration-table">
                        {(adminIntegrations?.apiTokens ?? []).map((token) => (
                          <div className="integration-row" key={token.id}>
                            <div>
                              <b>{token.name}</b>
                              <small>
                                {token.tokenPrefix}{uiText("ui.admin.usageOfLimit")} {token.rateLimitPerMinute}
                                {uiText("ui.admin.perMinuteSuffix")}
                              </small>
                              <small>{token.scopes.join(", ") || uiText("ui.admin.noScopes")}</small>
                            </div>
                            <span
                              className={`integration-status ${
                                token.isActive ? "active" : "inactive"
                              }`}
                            >
                              {token.isActive ? uiText("ui.admin.active") : uiText("ui.admin.disabled")}
                            </span>
                            <button
                              type="button"
                              onClick={() => void toggleApiToken(token)}
                              disabled={savingIntegration}
                            >
                              {token.isActive ? uiText("ui.admin.disable") : uiText("ui.admin.enable")}
                            </button>
                          </div>
                        ))}
                        {(adminIntegrations?.apiTokens.length ?? 0) === 0 && (
                          <div className="empty-state">{uiText("ui.admin.noApiTokensYet")}</div>
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
                          {uiText("ui.admin.name")}
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
                          {uiText("ui.admin.events")}
                          <input
                            value={webhookDraft.events}
                            onChange={(event) =>
                              setWebhookDraft({
                                ...webhookDraft,
                                events: event.target.value,
                              })
                            }
                            placeholder={uiText("ui.admin.eventsPlaceholderExample")}
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
                          {uiText("ui.admin.active")}
                        </label>
                        <button type="submit" disabled={savingIntegration}>
                          {uiText("ui.admin.addWebhook")}
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
                              {endpoint.isActive ? uiText("ui.admin.active") : uiText("ui.admin.disabled")}
                            </span>
                            <button
                              type="button"
                              onClick={() => void testWebhook(endpoint.id)}
                              disabled={savingIntegration || !endpoint.isActive}
                            >
                              {uiText("ui.admin.test")}
                            </button>
                            <button
                              type="button"
                              onClick={() => void toggleWebhook(endpoint)}
                              disabled={savingIntegration}
                            >
                              {endpoint.isActive ? uiText("ui.admin.disable") : uiText("ui.admin.enable")}
                            </button>
                          </div>
                        ))}
                        {(adminIntegrations?.webhookEndpoints.length ?? 0) === 0 && (
                          <div className="empty-state">{uiText("ui.admin.noWebhookEndpointsYet")}</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>{uiText("ui.admin.recentDeliveries")}</h3>
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
                          <div className="empty-state">{uiText("ui.admin.noDeliveriesYet")}</div>
                        )}
                      </div>
                    </section>

                    <section className="admin-integration-card">
                      <div className="admin-integration-card-title">
                        <h3>{uiText("ui.admin.enterpriseIntegrations")}</h3>
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
                          {uiText("ui.admin.gitlabEnabled")}
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
                                ? uiText("ui.admin.setEnterNewToReplace")
                                : uiText("ui.admin.notSetMasculine")
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
                          {uiText("ui.admin.githubEnabled")}
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
                                ? uiText("ui.admin.setEnterNewToReplace")
                                : uiText("ui.admin.notSetMasculine")
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
                          {uiText("ui.admin.azureDevOpsEnabled")}
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
                                ? uiText("ui.admin.setEnterNewToReplace")
                                : uiText("ui.admin.notSetMasculine")
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
                          {uiText("ui.admin.biEnabled")}
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
                          {savingSystemSettings ? uiText("ui.admin.savingEllipsisDots") : uiText("ui.admin.saveIntegrations")}
                        </button>
                      </form>
                      <div className="integration-settings-list">
                        {(adminIntegrations?.integrationSettings ?? []).map((setting) => (
                          <div key={setting.key}>
                            <b>{setting.key}</b>
                            <small>
                              {setting.isSecret
                                ? setting.hasValue
                                  ? uiText("ui.admin.setNeuter")
                                  : uiText("ui.admin.notSetNeuter")
                                : setting.value || uiText("ui.admin.notSetNeuter")}
                            </small>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>
                </article>
              );
}
