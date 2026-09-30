/**
 * A request to show one RAID row whatever the register's search and filters
 * are. It is kept until the register takes it, so it works both when the
 * register is already open and when it mounts after the navigation.
 */
let pending: string | null = null;
const EVENT = "pms:reveal-raid";

export function requestRaidReveal(itemId: string) {
  pending = itemId;
  window.dispatchEvent(new Event(EVENT));
}

export function takeRaidReveal() {
  const itemId = pending;
  pending = null;
  return itemId;
}

export function onRaidReveal(listener: () => void) {
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
