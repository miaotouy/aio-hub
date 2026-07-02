/**
 * @tauri-apps/api/core ESM Shim for Plugins
 */

if (!window.TauriAppsApiCore) {
  console.error("[AIO Hub] window.TauriAppsApiCore is not defined.");
}

const Core = window.TauriAppsApiCore || {};

export const { invoke, convertFileSrc, Channel, Resource, isTauri } = Core;

export default Core;
