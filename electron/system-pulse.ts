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

import path from "node:path";
import { createRequire } from "node:module";
import { randomUUID } from "node:crypto";
import type { SystemSnapshot } from "../src/tools/system-pulse/types/snapshot";
interface Runtime {
  run(): Promise<void>;
  cancel(): void;
  drainSnapshot(): string;
}
interface Addon {
  SystemPulseRuntime: new () => Runtime;
}
interface Host {
  emit(owner: number, event: string, payload: unknown): unknown;
  loadAddon?(filename: string): Addon;
}
interface Subscription {
  id: string;
}
interface Session {
  runtime: Runtime;
  stopping: boolean;
  done: Promise<void>;
  timer?: ReturnType<typeof setInterval>;
}
/** One hardware collector, with an independent subscription for each window. */
export class SystemPulse {
  private addon?: Addon;
  private session?: Session;
  private owners = new Map<number, Subscription>();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  constructor(
    private readonly appPath: string,
    private readonly host: Host
  ) {}
  get hasPendingOperations() {
    return this.session != null || this.pending.size > 0;
  }
  private getAddon() {
    return (this.addon ??= (
      this.host.loadAddon ??
      ((file) => createRequire(import.meta.url)(file) as Addon)
    )(path.join(this.appPath, "native-runtime/knowledge-addon.node")));
  }
  runCommand(
    owner: number,
    command: string,
    args: Record<string, unknown> = {}
  ): Promise<null> {
    let operation: Promise<null>;
    try {
      if (command === "start_pulse") {
        if (this.closing) throw new Error("应用正在退出");
        const id = args.subscriptionId ?? randomUUID();
        if (
          typeof id !== "string" ||
          !id ||
          id.length > 256 ||
          id.includes("\0")
        )
          throw new Error("监控订阅身份无效");
        const subscription = { id };
        this.owners.set(owner, subscription);
        operation = this.ensureRunning(owner, subscription).catch((error) => {
          if (this.owners.get(owner) === subscription)
            this.owners.delete(owner);
          throw error;
        });
      } else if (command === "stop_pulse") {
        const subscription = this.owners.get(owner);
        if (
          subscription &&
          (args.subscriptionId == null ||
            args.subscriptionId === subscription.id)
        )
          this.owners.delete(owner);
        operation = this.stopIfIdle().then(() => null);
      } else throw new Error("不支持的系统监控操作");
    } catch (error) {
      return Promise.reject(error);
    }
    this.pending.add(operation);
    void operation
      .finally(() => this.pending.delete(operation))
      .catch(() => {});
    return operation;
  }
  private async ensureRunning(
    owner: number,
    subscription: Subscription
  ): Promise<null> {
    if (this.owners.get(owner) !== subscription || this.closing) return null;
    if (this.session?.stopping) {
      await this.session.done;
      return this.ensureRunning(owner, subscription);
    }
    if (this.session) return null;
    const runtime = new (this.getAddon().SystemPulseRuntime)();
    const session: Session = {
      runtime,
      stopping: false,
      done: Promise.resolve(),
    };
    this.session = session;
    session.done = Promise.resolve()
      .then(() => runtime.run())
      .then(() => {
        if (!session.stopping)
          throw new Error("系统采集任务已结束，请重新开启监控");
      })
      .catch((error) => {
        if (session.stopping) return;
        const message = error instanceof Error ? error.message : String(error);
        for (const [owner, subscription] of this.owners) {
          try {
            this.host.emit(owner, "system-pulse:error", {
              subscriptionId: subscription.id,
              message,
            });
          } catch {
            /* A destroyed window must not prevent other subscribers receiving errors. */
          }
        }
        this.owners.clear();
      })
      .finally(() => {
        clearInterval(session.timer);
        if (this.session === session) this.session = undefined;
      });
    session.timer = setInterval(() => {
      if (session.stopping) return;
      try {
        const snapshot = JSON.parse(
          runtime.drainSnapshot()
        ) as SystemSnapshot | null;
        if (snapshot)
          for (const [owner, subscription] of this.owners)
            this.host.emit(owner, "system-pulse:snapshot", {
              ...snapshot,
              subscriptionId: subscription.id,
            });
      } catch (error) {
        // Surface collector/transport failures and release the native worker.
        for (const [owner, subscription] of this.owners) {
          try {
            this.host.emit(owner, "system-pulse:error", {
              subscriptionId: subscription.id,
              message: error instanceof Error ? error.message : String(error),
            });
          } catch {}
        }
        this.owners.clear();
        void this.stopIfIdle();
      }
    }, 100);
    return null;
  }
  private async stopIfIdle() {
    const session = this.session;
    if (this.owners.size || !session) return;
    if (!session.stopping) {
      session.stopping = true;
      clearInterval(session.timer);
      session.runtime.cancel();
    }
    await session.done;
  }
  disposeOwner(owner: number) {
    this.owners.delete(owner);
    void this.stopIfIdle();
  }
  async shutdown() {
    this.closing = true;
    this.owners.clear();
    await this.stopIfIdle();
    await Promise.allSettled([...this.pending]);
  }
}
