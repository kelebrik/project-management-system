/**
 * AI provider settings. Everything is off unless configured: a corporate
 * installation renders its environment elsewhere, so a missing or broken value
 * only turns the feature off (with a warning) and never stops the start.
 */
export type AiLimits = {
  userHourly: number;
  daily: number;
  dailyTokens: number;
  concurrent: number;
  demoIpHourly: number;
  demoDaily: number;
};

export type AiConfig =
  | { enabled: false; reason: string }
  | {
      enabled: true;
      provider: 'openai';
      model: string;
      apiKey: string;
      baseUrl: URL;
      timeoutMs: number;
      allowPublicDemo: boolean;
      limits: AiLimits;
    };

const OPENAI_HOST = 'api.openai.com';
const DEFAULT_LIMITS: AiLimits = {
  userHourly: 10,
  daily: 200,
  dailyTokens: 2_000_000,
  concurrent: 3,
  demoIpHourly: 3,
  demoDaily: 30,
};

function positive(env: NodeJS.ProcessEnv, name: string, fallback: number, warnings: string[]) {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    warnings.push(`${name} must be a positive integer; using ${fallback}`);
    return fallback;
  }
  return value;
}

/**
 * The provider address. Only https, and only OpenAI's host or a host listed in
 * AI_ALLOWED_HOSTS, so a wrong setting cannot send the API key somewhere else
 * or send it without TLS.
 */
export function aiBaseUrl(env: NodeJS.ProcessEnv = process.env): URL | string {
  const raw = env.AI_BASE_URL?.trim() || `https://${OPENAI_HOST}/v1`;
  let url: URL;
  try {
    url = new URL(raw.endsWith('/') ? raw : `${raw}/`);
  } catch {
    return 'AI_BASE_URL is not a valid URL';
  }
  if (url.protocol !== 'https:') return 'AI_BASE_URL must use https';
  if (url.username || url.password) return 'AI_BASE_URL must not carry credentials';
  const allowed = new Set([OPENAI_HOST, ...(env.AI_ALLOWED_HOSTS ?? '').split(',').map((host) => host.trim()).filter(Boolean)]);
  if (!allowed.has(url.hostname)) return `AI_BASE_URL host ${url.hostname} is not in AI_ALLOWED_HOSTS`;
  return url;
}

export function readAiConfig(env: NodeJS.ProcessEnv = process.env): { config: AiConfig; warnings: string[] } {
  const warnings: string[] = [];
  const provider = env.AI_PROVIDER?.trim().toLowerCase() || 'off';
  if (provider === 'off') return { config: { enabled: false, reason: 'AI_PROVIDER is off' }, warnings };
  if (provider !== 'openai') {
    warnings.push(`AI_PROVIDER ${provider} is not supported; AI is off`);
    return { config: { enabled: false, reason: 'unsupported provider' }, warnings };
  }
  const apiKey = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (!apiKey || !model) {
    warnings.push('AI_PROVIDER=openai needs AI_API_KEY and AI_MODEL; AI is off');
    return { config: { enabled: false, reason: 'missing key or model' }, warnings };
  }
  const baseUrl = aiBaseUrl(env);
  if (typeof baseUrl === 'string') {
    warnings.push(`${baseUrl}; AI is off`);
    return { config: { enabled: false, reason: baseUrl }, warnings };
  }
  const limits: AiLimits = {
    userHourly: positive(env, 'AI_USER_HOURLY_LIMIT', DEFAULT_LIMITS.userHourly, warnings),
    daily: positive(env, 'AI_DAILY_LIMIT', DEFAULT_LIMITS.daily, warnings),
    dailyTokens: positive(env, 'AI_DAILY_TOKEN_LIMIT', DEFAULT_LIMITS.dailyTokens, warnings),
    concurrent: positive(env, 'AI_MAX_CONCURRENT', DEFAULT_LIMITS.concurrent, warnings),
    demoIpHourly: positive(env, 'AI_DEMO_IP_HOURLY_LIMIT', DEFAULT_LIMITS.demoIpHourly, warnings),
    demoDaily: positive(env, 'AI_DEMO_DAILY_LIMIT', DEFAULT_LIMITS.demoDaily, warnings),
  };
  return {
    config: {
      enabled: true,
      provider: 'openai',
      model,
      apiKey,
      baseUrl,
      timeoutMs: positive(env, 'AI_TIMEOUT_MS', 60_000, warnings),
      allowPublicDemo: env.AI_ALLOW_PUBLIC_DEMO === 'true',
      limits,
    },
    warnings,
  };
}
