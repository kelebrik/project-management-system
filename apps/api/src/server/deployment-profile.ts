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

export function deploymentProfile(env: NodeJS.ProcessEnv = process.env): DeploymentProfile | null {
  const raw = env.DEPLOYMENT_PROFILE?.trim();
  return PROFILES.find((profile) => profile === raw) ?? null;
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

export function assertDeploymentProfileConfigured(env: NodeJS.ProcessEnv = process.env) {
  const profile = deploymentProfile(env);
  if (!profile) {
    const raw = env.DEPLOYMENT_PROFILE?.trim();
    throw new Error(
      `DEPLOYMENT_PROFILE must be set to ${PROFILES.map((value) => `"${value}"`).join(' or ')}` +
        `${raw ? `, received "${raw}"` : ' but is missing'}.`,
    );
  }
  if (profile === 'corporate' && env.PUBLIC_DEMO_MODE === 'true') {
    throw new Error('PUBLIC_DEMO_MODE cannot be enabled on the corporate deployment profile.');
  }
  return profile;
}
