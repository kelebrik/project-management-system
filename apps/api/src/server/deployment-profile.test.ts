import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertDeploymentProfileConfigured,
  deploymentProfile,
  isCloudProfile,
  isJiraAccessAllowed,
  isPublicDemoMode,
} from './deployment-profile.js';

const cloud = { DEPLOYMENT_PROFILE: 'cloud' } as NodeJS.ProcessEnv;
const corporate = { DEPLOYMENT_PROFILE: 'corporate' } as NodeJS.ProcessEnv;

test('only the exact profile names are recognised', () => {
  assert.equal(deploymentProfile(cloud), 'cloud');
  assert.equal(deploymentProfile(corporate), 'corporate');
  assert.equal(deploymentProfile({ DEPLOYMENT_PROFILE: ' cloud ' }), 'cloud');
  assert.equal(deploymentProfile({}), null);
  assert.equal(deploymentProfile({ DEPLOYMENT_PROFILE: 'Cloud' }), null);
  assert.equal(deploymentProfile({ DEPLOYMENT_PROFILE: 'production' }), null);
});

test('an unusable profile never counts as cloud', () => {
  assert.equal(isCloudProfile(cloud), true);
  assert.equal(isCloudProfile(corporate), false);
  assert.equal(isCloudProfile({}), false);
  assert.equal(isCloudProfile({ DEPLOYMENT_PROFILE: 'nonsense' }), false);
});

test('the public demo identity requires both the cloud profile and an explicit opt-in', () => {
  assert.equal(isPublicDemoMode({ ...cloud, PUBLIC_DEMO_MODE: 'true' }), true);
  assert.equal(isPublicDemoMode({ ...cloud, PUBLIC_DEMO_MODE: 'false' }), false);
  assert.equal(isPublicDemoMode(cloud), false);
  assert.equal(isPublicDemoMode({ ...corporate, PUBLIC_DEMO_MODE: 'true' }), false);
  assert.equal(isPublicDemoMode({ PUBLIC_DEMO_MODE: 'true' }), false);
});

test('the Render hostname no longer switches the demo on by itself', () => {
  const renderHosted = {
    WEB_ORIGIN: 'https://project-management-system-lorj.onrender.com',
    RENDER_EXTERNAL_URL: 'https://project-management-system-lorj.onrender.com',
  } as NodeJS.ProcessEnv;
  assert.equal(isPublicDemoMode(renderHosted), false);
  assert.equal(isPublicDemoMode({ ...renderHosted, ...corporate }), false);
});

test('Jira stays unreachable whenever the public demo is requested', () => {
  assert.equal(isJiraAccessAllowed({ ...cloud, PUBLIC_DEMO_MODE: 'true' }), false);
  // Even on a profile that cannot serve the demo, asking for it disables Jira.
  assert.equal(isJiraAccessAllowed({ ...corporate, PUBLIC_DEMO_MODE: 'true' }), false);
  assert.equal(isJiraAccessAllowed({ PUBLIC_DEMO_MODE: 'true' }), false);
});

test('Jira access does not depend on the deployment profile', () => {
  // The corporate installation depends on Jira, and an offline script that never
  // sets a profile must keep its Jira configuration.
  for (const env of [cloud, corporate, {}, { DEPLOYMENT_PROFILE: 'staging' }]) {
    assert.equal(isJiraAccessAllowed(env), true);
  }
});

test('the demo opt-in is matched exactly and is not case-insensitive', () => {
  for (const value of ['TRUE', 'True', '1', 'yes', ' true']) {
    assert.equal(isPublicDemoMode({ ...cloud, PUBLIC_DEMO_MODE: value }), false, value);
    assert.equal(isJiraAccessAllowed({ ...cloud, PUBLIC_DEMO_MODE: value }), true, value);
    assert.equal(assertDeploymentProfileConfigured({ ...corporate, PUBLIC_DEMO_MODE: value }), 'corporate');
  }
});

test('startup rejects a missing or unknown profile', () => {
  assert.throws(() => assertDeploymentProfileConfigured({}), /must be set to .*but is missing/);
  assert.throws(
    () => assertDeploymentProfileConfigured({ DEPLOYMENT_PROFILE: 'staging' }),
    /received "staging"/,
  );
  assert.equal(assertDeploymentProfileConfigured(cloud), 'cloud');
  assert.equal(assertDeploymentProfileConfigured(corporate), 'corporate');
});

test('startup rejects the public demo on the corporate profile', () => {
  assert.throws(
    () => assertDeploymentProfileConfigured({ ...corporate, PUBLIC_DEMO_MODE: 'true' }),
    /cannot be enabled on the corporate deployment profile/,
  );
  assert.equal(assertDeploymentProfileConfigured({ ...cloud, PUBLIC_DEMO_MODE: 'true' }), 'cloud');
});
