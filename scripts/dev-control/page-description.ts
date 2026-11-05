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
  if (!internals) return null;
  const identity = await internals.invoke("dev_control_identity");
  return identity
    ? {
        ...identity,
        route: location.pathname + location.search,
        ready: false,
        bridgeAvailable: false,
      }
    : null;
}
