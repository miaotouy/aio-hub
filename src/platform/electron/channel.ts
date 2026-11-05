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

/** Callbacks stay in this realm; only opaque channel references cross IPC. */
const channels = new WeakMap<
  object,
  { token: string; channel: ElectronChannel }
>();
let nextId = 0;
export class ElectronChannel<T = unknown> {
  readonly id = ++nextId;
  #handler: (payload: T) => void;
  #token = crypto.randomUUID();
  constructor(onmessage: (payload: T) => void = () => {}) {
    this.#handler = onmessage;
    channels.set(this, {
      token: this.#token,
      channel: this as ElectronChannel,
    });
  }
  set onmessage(handler: (payload: T) => void) {
    this.#handler = handler;
  }
  get onmessage(): (payload: T) => void {
    return this.#handler;
  }
  toJSON(): string {
    return "__AIOHUB_CHANNEL__:" + this.#token;
  }
  __TAURI_TO_IPC_KEY__(): string {
    return this.toJSON();
  }
}
export function channelReference(value: object) {
  return channels.get(value);
}

interface Subscription {
  users: number;
  stop: () => void;
  pending: Map<string, () => void>;
}
const subscriptions = new WeakMap<object, Map<string, Subscription>>();
export function subscribeChannel(
  host: import("../../../electron/shared").ElectronBridge,
  token: string,
  channel: ElectronChannel,
  requestId: string
): { stop: () => void; finished: Promise<void> } {
  let active = subscriptions.get(host);
  if (!active) subscriptions.set(host, (active = new Map()));
  let subscription = active.get(token);
  if (!subscription) {
    const pending = new Map<string, () => void>();
    subscription = {
      users: 0,
      pending,
      stop: host.subscribeChannel(
        token,
        (payload) => channel.onmessage(payload),
        (id) => pending.get(id)?.()
      ),
    };
    active.set(token, subscription);
  }
  subscription.users++;
  const finished = new Promise<void>((resolve) =>
    subscription.pending.set(requestId, resolve)
  );
  let released = false;
  return {
    finished,
    stop: () => {
      if (released) return;
      released = true;
      subscription.pending.delete(requestId);
      if (--subscription.users === 0) {
        active.delete(token);
        subscription.stop();
      }
    },
  };
}
