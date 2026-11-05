import { ensureResponseOk, fetchWithTimeout } from "../common";
import { asyncJsonStringify } from "../../utils/serialization";
import { createLlmTransport } from "./transport";
export { createLlmTransport as createDesktopLlmTransport } from "./transport";
export type {
  LlmFetchOptions as DesktopFetchOptions,
  LlmTransportDependencies as DesktopLlmTransportDependencies,
} from "./transport";

export const desktopLlmTransport = createLlmTransport({
  fetch: fetchWithTimeout,
  ensureResponseOk,
  serializeJson: (value) =>
    typeof Worker === "undefined"
      ? Promise.resolve(JSON.stringify(value))
      : asyncJsonStringify(value),
});
