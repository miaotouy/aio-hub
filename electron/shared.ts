// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

export const IPC_REQUEST = "aiohub:request";
export const IPC_EVENT = "aiohub:event";
export const IPC_ASSET = "aiohub:asset";
export interface HostEvent<T = unknown> {
  event: string;
  id: number;
  payload: T;
  windowLabel?: string;
}
export type EventTarget = string | { kind: string; label?: string };
export interface HostMetadata {
  platform: "electron";
  label: string;
  appName: string;
  appVersion: string;
  os: {
    platform: string;
    type: string;
    arch: string;
    version: string;
    hostname: string;
    locale: string;
  };
}
export interface ElectronBridge {
  readonly platform: "electron";
  readonly metadata: HostMetadata;
  request(
    operation: string,
    args?: Record<string, unknown>
  ): Promise<HostReply>;
  subscribe(event: string, callback: (event: HostEvent) => void): () => void;
  assetUrl(path: string): string;
}
export type HostReply =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: { code: string; message: string; capability?: string };
    };

export interface HttpRequestOptions {
  url: string;
  method: string;
  headers: [string, string][];
  body?: Uint8Array;
  redirect: RequestRedirect;
  maxRedirections?: number;
  connectTimeout?: number;
  credentials: RequestCredentials;
  cache?: RequestCache;
  referrerPolicy?: ReferrerPolicy;
}
export interface HttpResponseInfo {
  status: number;
  statusText: string;
  headers: [string, string][];
  url: string;
  redirected: boolean;
  hasBody: boolean;
}
export interface HttpReadResult {
  done: boolean;
  value?: Uint8Array;
}
