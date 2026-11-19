/** Local production controller. One NDJSON request/reply per connection. */
export const CONTROL_VERSION = 1;
export const CONTROL_EVENT = "agent-control:request";
export const MAX_REQUEST_BYTES = 256 * 1024;
export const MAX_REPLY_BYTES = 4 * 1024 * 1024;
export interface ControlManifest {
  protocolVersion: number;
  pid: number;
  host: "electron" | "tauri";
  endpoint: string;
  token: string;
  dataDir: string;
}
export interface ControlRequest {
  id: string;
  token: string;
  window?: string;
  command: ControlCommand;
}
export interface ControlCommand {
  op: string;
  snapshotId?: string;
  ref?: string;
  css?: string;
  text?: string;
  value?: string;
  key?: string;
  path?: string;
  deltaY?: number;
  deltaX?: number;
  limit?: number;
  tool?: string;
  method?: string;
  args?: Record<string, unknown>;
}
export interface ControlDelivery {
  id: string;
  command: ControlCommand;
  expiresAt: number;
}
export type ControlReply =
  | { ok: true; result: unknown }
  | { ok: false; error: { code: string; message: string } };
export interface ControlStatus {
  enabled: boolean;
  connected: boolean;
  pid: number;
  host: "electron" | "tauri";
}
export function controlFailure(code: string, message: string): ControlReply {
  return { ok: false, error: { code, message } };
}
