const jiraDisplayHostAliases = new Map([
  ['tasks.dev.sberdevices.ru', 'tasks.sberdevices.ru'],
]);

function normalizedJiraHost(hostname: string) {
  const normalized = hostname.toLowerCase();
  return jiraDisplayHostAliases.get(normalized) ?? normalized;
}

export function jiraDisplayUrl(value: string) {
  const url = new URL(value);
  url.hostname = normalizedJiraHost(url.hostname);
  return url;
}

export function jiraUrlMatchesConfiguredBase(candidateValue: string, baseValue: string) {
  try {
    const candidate = jiraDisplayUrl(candidateValue);
    const base = jiraDisplayUrl(baseValue);
    if (candidate.protocol !== 'https:' || base.protocol !== 'https:') return false;
    if (candidate.hostname !== base.hostname || candidate.port !== base.port) return false;
    const basePath = base.pathname.replace(/\/+$/, '');
    return !basePath
      || candidate.pathname === basePath
      || candidate.pathname.startsWith(`${basePath}/`);
  } catch {
    return false;
  }
}
