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

import { toRaw } from "vue";
import {
  channelReference,
  subscribeChannel,
  type ElectronChannel,
} from "./channel";
import type { ElectronBridge } from "../../../electron/shared";
export function getElectronBridge(): ElectronBridge | undefined {
  if (typeof window === "undefined") return undefined;
  const host = (window as Window & { aiohub?: ElectronBridge }).aiohub;
  return host?.platform === "electron" ? host : undefined;
}
/** Vue proxies cannot cross contextBridge. Keep the JSON-like SDK contract and exact binary values. */
export function cloneHostValue(
  value: unknown,
  seen = new WeakSet<object>(),
  channels?: Map<string, ElectronChannel>
): unknown {
  if (value === null || typeof value !== "object") {
    if (typeof value === "function" || typeof value === "symbol")
      throw new TypeError("宿主参数包含无法传输的值");
    return value;
  }
  const raw = toRaw(value);
  const channel = channelReference(raw);
  if (channel && channels) {
    channels.set(channel.token, channel.channel);
    return { __aiohubChannel: channel.token };
  }
  if (raw instanceof Uint8Array) return new Uint8Array(raw);
  if (raw instanceof ArrayBuffer) return raw.slice(0);
  if (raw instanceof Date) return raw.toJSON();
  if (raw instanceof URL) return raw.href;
  if (seen.has(raw)) throw new TypeError("宿主参数包含循环引用");
  seen.add(raw);
  try {
    if (Array.isArray(raw))
      return raw.map((entry) => cloneHostValue(entry, seen, channels));
    return Object.fromEntries(
      Object.entries(raw).map(([key, entry]) => [
        key,
        cloneHostValue(entry, seen, channels),
      ])
    );
  } finally {
    seen.delete(raw);
  }
}
export async function request<T = unknown>(
  operation: string,
  args?: Record<string, unknown>
): Promise<T> {
  const host = getElectronBridge();
  if (!host) throw new Error("Electron preload 未就绪，请重新启动应用");
  const channels = new Map<string, ElectronChannel>();
  const payload = cloneHostValue(args, new WeakSet(), channels) as
    Record<string, unknown> | undefined;
  if (channels.size && operation !== "command")
    throw new TypeError("Channel 需通过业务命令传输");
  const requestId = channels.size ? crypto.randomUUID() : undefined;
  if (requestId && payload) payload.__aiohubChannelRequest = requestId;
  const subscriptions: { stop: () => void; finished: Promise<void> }[] = [];
  try {
    // Register before invoke: a fast command may publish before its reply arrives.
    for (const [token, channel] of channels)
      subscriptions.push(subscribeChannel(host, token, channel, requestId!));
    const reply = await host.request(operation, payload);
    if (!reply.ok)
      throw Object.assign(new Error(reply.error.message), {
        code: reply.error.code,
        capability: reply.error.capability,
      });
    // IPC invoke replies and streamed messages use independent queues. Drain the
    // command's end markers before returning or removing its listeners.
    await Promise.all(
      subscriptions.map((subscription) => subscription.finished)
    );
    return reply.value as T;
  } finally {
    for (const subscription of subscriptions) subscription.stop();
  }
}
export function unsupported(capability: string): never {
  throw Object.assign(
    new Error(
      "Electron 迁移中：" + capability + "尚未接入，请使用 Tauri 入口完成该操作"
    ),
    { code: "CAPABILITY_UNAVAILABLE" }
  );
}
