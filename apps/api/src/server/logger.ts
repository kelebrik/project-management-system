export function logEvent(
  level: 'info' | 'warn' | 'error',
  event: string,
  payload: Record<string, unknown> = {},
) {
  const line = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...payload,
  };
  const serialized = JSON.stringify(line);
  if (level === 'error') {
    console.error(serialized);
  } else if (level === 'warn') {
    console.warn(serialized);
  } else {
    console.log(serialized);
  }
}
