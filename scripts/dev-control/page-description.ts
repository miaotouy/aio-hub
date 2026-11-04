import type {
  DevControlDescription,
  DevControlIdentity,
} from "../../src/dev/control/protocol";

/** Serialized into the WebView; native identity also works during frontend failure. */
export async function readPageDescription(): Promise<DevControlDescription | null> {
  if (location.pathname === "/background-js.html") return null;
  const bridge = window.__AIO_DEV_CONTROL__;
  if (bridge) return { ...bridge.describe(), bridgeAvailable: true };
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke(command: string): Promise<DevControlIdentity | null>;
      };
    }
  ).__TAURI_INTERNALS__;
  const electron = (
    window as Window & {
      aiohub?: import("../../electron/shared").ElectronBridge;
    }
  ).aiohub;
  const reply =
    electron && !internals
      ? await electron.request("command", { command: "dev_control_identity" })
      : undefined;
  const identity = internals
    ? await internals.invoke("dev_control_identity")
    : reply?.ok
      ? (reply.value as DevControlIdentity | null)
      : null;
  return identity
    ? {
        ...identity,
        route: location.pathname + location.search,
        ready: false,
        bridgeAvailable: false,
      }
    : null;
}
