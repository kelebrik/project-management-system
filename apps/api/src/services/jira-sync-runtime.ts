let wakeRunner: (() => void) | null = null;

export function registerJiraSyncRunnerWake(wake: (() => void) | null) {
  wakeRunner = wake;
}

export function notifyJiraSyncRunner() {
  wakeRunner?.();
}
