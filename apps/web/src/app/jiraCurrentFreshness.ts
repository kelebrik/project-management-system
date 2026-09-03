export function shouldNotifyJiraProjectionRefresh(
  initialized: boolean,
  previous: string | null,
  current: string | null,
) {
  return initialized && current !== null && previous !== current;
}
