export type PollEnvironment = {
  available: () => boolean;
  schedule: (run: () => void, delay: number) => unknown;
  cancel: (timer: unknown) => void;
  subscribe: (wake: () => void) => () => void;
};

// One request at a time; invalidate in-flight responses on hide, offline or disposal.
export function startPolling<T>({
  load,
  success,
  failure,
  paused,
  environment,
  interval = 5000,
}: {
  load: (signal: AbortSignal) => Promise<T>;
  success: (value: T) => void;
  failure: (error: unknown) => boolean | void;
  paused: (value: boolean) => void;
  environment: PollEnvironment;
  interval?: number;
}) {
  let disposed = false,
    terminal = false,
    failures = 0;
  let timer: unknown;
  let running: AbortController | undefined;
  function clear() {
    if (timer !== undefined) environment.cancel(timer);
    timer = undefined;
  }
  function tick() {
    clear();
    if (disposed || terminal || running) return;
    if (!environment.available()) {
      paused(true);
      return;
    }
    paused(false);
    const controller = new AbortController();
    running = controller;
    Promise.resolve()
      .then(() => load(controller.signal))
      .then((value) => {
        if (disposed || controller.signal.aborted) return;
        failures = 0;
        success(value);
      })
      .catch((error: unknown) => {
        if (disposed || controller.signal.aborted) return;
        failures++;
        terminal = failure(error) === true;
      })
      .finally(() => {
        if (disposed || running !== controller) return;
        running = undefined;
        if (!terminal && environment.available()) {
          timer = environment.schedule(
            tick,
            Math.min(interval * 2 ** Math.min(failures, 3), 30000),
          );
        }
      });
  }
  function wake() {
    if (disposed || terminal) return;
    if (!environment.available()) {
      clear();
      running?.abort();
      running = undefined;
      paused(true);
    } else tick();
  }
  const unsubscribe = environment.subscribe(wake);
  tick();
  return () => {
    disposed = true;
    clear();
    running?.abort();
    unsubscribe();
  };
}
