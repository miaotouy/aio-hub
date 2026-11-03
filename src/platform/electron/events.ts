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

import type { EventCallback, Options, UnlistenFn } from "../native/events";
import { getElectronBridge, request } from "./client";
let nextId = 0;
export async function listen<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options
): Promise<UnlistenFn> {
  const id = ++nextId;
  const host = getElectronBridge();
  if (!host) throw new Error("Electron 事件桥未就绪");
  const stop = host.subscribe(event, (message) => {
    if (message.id === id)
      handler({ ...message, payload: message.payload as T });
  });
  try {
    await request("events.listen", { event, id, target: options?.target });
  } catch (error) {
    stop();
    throw error;
  }
  let active = true;
  return () => {
    if (!active) return;
    active = false;
    stop();
    void request("events.unlisten", { id }).catch(() => {});
  };
}
export async function once<T>(
  event: string,
  handler: EventCallback<T>,
  options?: Options
): Promise<UnlistenFn> {
  let stop: UnlistenFn | undefined;
  let fired = false;
  stop = await listen<T>(
    event,
    (value) => {
      if (fired) return;
      fired = true;
      stop?.();
      handler(value);
    },
    options
  );
  if (fired) stop();
  return stop;
}
export function emit(event: string, payload?: unknown): Promise<void> {
  return request("events.emit", { event, payload });
}
export function emitTo(
  target: string | { kind: string; label?: string },
  event: string,
  payload?: unknown
): Promise<void> {
  return request("events.emit", { event, payload, target });
}
