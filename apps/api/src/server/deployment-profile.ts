/**
 * Single source of truth for which environment this instance is deployed into.
 *
 * `cloud` is the public Render deployment; `corporate` is the Sber installation.
 * Cloud-only capabilities (local password sign-in, the public demo identity) are
 * gated on this profile so the same tree can be shipped to both environments.
 *
 * Reads are fail-closed: a missing or unrecognised value never counts as cloud.
 * `assertDeploymentProfileConfigured` turns that misconfiguration into a startup
 * failure so an operator learns about it immediately instead of silently losing
 * a capability.
 */
export type DeploymentProfile = 'cloud' | 'corporate';

const PROFILES: readonly DeploymentProfile[] = ['cloud', 'corporate'];

/**
 * An absent profile resolves to `corporate`, which is the strict one: local
 * password sign-in is not registered and the public demo identity is off. Not
 * every deployment renders its environment from this repository, and refusing to
 * start there would turn a missing discriminator into an outage — whereas
 * falling back to the strict profile only ever removes capability.
 *
 * A value that is present but unrecognised still resolves to null, because that
 * is an operator mistake and the startup check turns it into a hard failure.
 */
export const FALLBACK_DEPLOYMENT_PROFILE: DeploymentProfile = 'corporate';

export function deploymentProfile(env: NodeJS.ProcessEnv = process.env): DeploymentProfile | null {
  const raw = env.DEPLOYMENT_PROFILE?.trim();
  if (!raw) return FALLBACK_DEPLOYMENT_PROFILE;
  return PROFILES.find((profile) => profile === raw) ?? null;
}

/** Whether the profile was chosen by configuration rather than by the fallback. */
export function isDeploymentProfileConfigured(env: NodeJS.ProcessEnv = process.env) {
  return Boolean(env.DEPLOYMENT_PROFILE?.trim());
}

export function isCloudProfile(env: NodeJS.ProcessEnv = process.env) {
  return deploymentProfile(env) === 'cloud';
}

/** The public demo identity is only ever handed out on an explicitly cloud deployment. */
export function isPublicDemoMode(env: NodeJS.ProcessEnv = process.env) {
  return isCloudProfile(env) && env.PUBLIC_DEMO_MODE === 'true';
}

/**
 * Jira must stay unreachable from the synthetic public demo, on any profile.
 * This is deliberately keyed on the demo request rather than on the deployment
 * profile: the corporate installation depends on Jira, and an offline script
 * that forgets the profile must not silently lose its Jira configuration.
 */
export function isJiraAccessAllowed(env: NodeJS.ProcessEnv = process.env) {
  return env.PUBLIC_DEMO_MODE !== 'true';
}

/**
 * How many proxies sit in front of the application, which is what Express needs
 * to work out the real caller address. Getting this wrong is silent and costly:
 * too low and `req.ip` resolves to a rotating proxy address, so per-address rate
 * limiting counts every request under a different key and never triggers; too
 * high and a caller can forge the chain and pick their own key.
 *
 * On Render the chain is client → Cloudflare → Render proxy, so the value is 2.
 * A Kubernetes ingress usually adds one hop. Because it depends on where the
 * application is deployed, there is no safe default outside local development.
 */
export function trustProxyHops(env: NodeJS.ProcessEnv = process.env): number | null {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (!raw || !/^\d+$/.test(raw)) return null;
  return Number(raw);
}

/** What the application assumed before the depth became configurable. */
export const LEGACY_TRUST_PROXY_HOPS = 1;

/**
 * A value that is present but unusable is an operator mistake and stops the
 * process. A value that is absent falls back to the historical one instead,
 * because not every deployment renders its environment from this repository —
 * refusing to start there would turn a degraded rate limit into an outage.
 */
export function resolveTrustProxyHops(env: NodeJS.ProcessEnv = process.env) {
  const raw = env.TRUST_PROXY_HOPS?.trim();
  if (!raw) return { hops: LEGACY_TRUST_PROXY_HOPS, configured: false };

  const hops = trustProxyHops(env);
  if (hops === null) {
    throw new Error(
      `TRUST_PROXY_HOPS must be a non-negative whole number of proxies in front of the application, received "${raw}". ` +
        'Use 0 when nothing proxies the application.',
    );
  }
  return { hops, configured: true };
}

export function assertDeploymentProfileConfigured(env: NodeJS.ProcessEnv = process.env) {
  const profile = deploymentProfile(env);
  if (!profile) {
    throw new Error(
      `DEPLOYMENT_PROFILE must be set to ${PROFILES.map((value) => `"${value}"`).join(' or ')}, ` +
        `received "${env.DEPLOYMENT_PROFILE?.trim()}".`,
    );
  }
  if (profile === 'corporate' && env.PUBLIC_DEMO_MODE === 'true') {
    throw new Error('PUBLIC_DEMO_MODE cannot be enabled on the corporate deployment profile.');
  }
  return profile;
}
