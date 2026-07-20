import { browser } from "@wdio/globals";

interface TauriBridgeWindow extends Window {
  __TAURI_INTERNALS__?: {
    invoke<T>(command: string, args: Record<string, unknown>): Promise<T>;
  };
  __AIO_E2E_TAURI_RESULTS__?: Record<
    string,
    | { status: "pending" }
    | { status: "resolved"; value: unknown }
    | { status: "failed"; error: string }
  >;
}

let requestSequence = 0;

export async function invokeTauriCommand<T>(
  command: string,
  args: Record<string, unknown> = {}
): Promise<T> {
  await browser.waitUntil(
    async () =>
      await browser.execute(
        () => !!(window as TauriBridgeWindow).__TAURI_INTERNALS__
      ),
    {
      timeout: 30_000,
      timeoutMsg: "Tauri IPC bridge did not become available.",
    }
  );

  const requestId = `tauri-command-${Date.now()}-${++requestSequence}`;
  await browser.execute(
    (id, commandName, commandArgs) => {
      const e2eWindow = window as TauriBridgeWindow;
      const results = (e2eWindow.__AIO_E2E_TAURI_RESULTS__ ??= {});
      const bridge = e2eWindow.__TAURI_INTERNALS__;
      if (!bridge) {
        results[id] = {
          status: "failed",
          error: "Tauri IPC internals are unavailable in the E2E window.",
        };
        return;
      }
      results[id] = { status: "pending" };
      void bridge
        .invoke<unknown>(commandName, commandArgs)
        .then((value) => {
          results[id] = { status: "resolved", value };
        })
        .catch((error: unknown) => {
          results[id] = { status: "failed", error: String(error) };
        });
    },
    requestId,
    command,
    args
  );

  await browser.waitUntil(
    async () => {
      const result = await browser.execute(
        (id) => (window as TauriBridgeWindow).__AIO_E2E_TAURI_RESULTS__?.[id],
        requestId
      );
      return result?.status === "resolved" || result?.status === "failed";
    },
    {
      timeout: 30_000,
      timeoutMsg: `Tauri command timed out: ${command}`,
    }
  );

  const result = await browser.execute((id) => {
    const results = (window as TauriBridgeWindow).__AIO_E2E_TAURI_RESULTS__;
    const value = results?.[id];
    if (results) delete results[id];
    return value;
  }, requestId);
  if (!result || result.status === "pending") {
    throw new Error(`Tauri command did not produce a result: ${command}`);
  }
  if (result.status === "failed") {
    throw new Error(`Tauri command failed (${command}): ${result.error}`);
  }
  return result.value as T;
}
