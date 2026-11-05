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

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

export const webDistilleryCommands = [
  "distillery_quick_fetch",
  "distillery_start_proxy",
  "distillery_stop_proxy",
  "distillery_get_proxy_port",
  "distillery_get_proxy_origin",
  "distillery_set_proxy_cookies",
  "distillery_get_proxy_cookies",
  "distillery_set_proxy_local_storage",
  "distillery_check_crypto",
  "distillery_encrypt_cookie_values",
  "distillery_decrypt_cookie_values",
] as const;
interface Network {
  mode: "system" | "none" | "custom";
  customUrl?: string;
}
interface Runtime {
  run(command: string, configuration: string, network: string): Promise<string>;
  cancel(): void;
  shutdown(): Promise<void>;
}
interface Addon {
  WebDistilleryRuntime: new () => Runtime;
}
interface Host {
  networkOptions(): Promise<Network>;
  loadAddon?(filename: string): Addon;
}
interface Owner {
  disposed: boolean;
  runtime?: Runtime;
  tail: Promise<unknown>;
}

/** Only the network projection is returned; settings/credentials are never logged. */
export async function distilleryNetworkOptions(
  userData: string
): Promise<Network> {
  const file = path.join(userData, "app-settings", "settings.json");
  let proxy: Network | undefined;
  try {
    if ((await fs.stat(file)).size > 4 * 1024 ** 2) throw Error("size");
    proxy = JSON.parse(await fs.readFile(file, "utf8"))?.proxy;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { mode: "system" };
    throw new Error("无法读取网络设置，请在设置中重新保存代理配置");
  }
  if (!proxy || proxy.mode === "system") return { mode: "system" };
  if (proxy.mode === "none") return { mode: "none" };
  if (
    proxy.mode === "custom" &&
    typeof proxy.customUrl === "string" &&
    !/[\r\n\0]/.test(proxy.customUrl)
  ) {
    try {
      const url = new URL(proxy.customUrl);
      if (
        [
          "http:",
          "https:",
          "socks5:",
          "socks5h:",
          "socks4:",
          "socks4a:",
        ].includes(url.protocol)
      )
        return { mode: "custom", customUrl: proxy.customUrl };
    } catch {}
  }
  throw new Error("代理设置无效，请检查网络配置");
}

export class WebDistillery {
  private addon?: Addon;
  private owners = new Map<number, Owner>();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  constructor(
    private readonly appPath: string,
    private readonly host: Host
  ) {}
  get hasPendingOperations() {
    return this.owners.size > 0 || this.pending.size > 0;
  }
  private getAddon() {
    return (this.addon ??= (
      this.host.loadAddon ??
      ((file) => createRequire(import.meta.url)(file) as Addon)
    )(path.join(this.appPath, "native-runtime/knowledge-addon.node")));
  }
  private track<T>(operation: Promise<T>): Promise<T> {
    this.pending.add(operation);
    void operation
      .finally(() => this.pending.delete(operation))
      .catch(() => {});
    return operation;
  }
  runCommand(
    owner: number,
    command: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    try {
      if (this.closing) throw Error("应用正在退出");
      if (!(webDistilleryCommands as readonly string[]).includes(command))
        throw Error("不支持的网页蒸馏操作");
      const configuration = JSON.stringify(args);
      if (Buffer.byteLength(configuration) > 8 * 1024 ** 2)
        throw Error("网页请求参数过大，请减少身份或存储数据");
      let state = this.owners.get(owner);
      if (!state) {
        state = { disposed: false, tail: Promise.resolve() };
        this.owners.set(owner, state);
      }
      const accepted = state;
      const execute = async () => {
        if (accepted.disposed) throw Error("网页任务已随窗口关闭");
        const network =
          command === "distillery_quick_fetch" ||
          command === "distillery_start_proxy"
            ? await this.host.networkOptions()
            : { mode: "none" };
        if (accepted.disposed) throw Error("网页任务已随窗口关闭");
        const runtime = (accepted.runtime ??=
          new (this.getAddon().WebDistilleryRuntime)());
        const response = await runtime.run(
          command,
          configuration,
          JSON.stringify(network)
        );
        if (accepted.disposed) throw Error("网页任务已随窗口关闭");
        return JSON.parse(response) as unknown;
      };
      const serial = command.includes("_proxy");
      const operation = serial
        ? accepted.tail.then(execute)
        : Promise.resolve().then(execute);
      if (serial) accepted.tail = operation.catch(() => {});
      return this.track(operation);
    } catch (error) {
      return Promise.reject(error);
    }
  }
  disposeOwner(owner: number) {
    const state = this.owners.get(owner);
    if (!state) return;
    this.owners.delete(owner);
    state.disposed = true;
    if (state.runtime) {
      state.runtime.cancel();
      this.track(state.runtime.shutdown()).catch(() => {});
    }
  }
  async shutdown() {
    this.closing = true;
    for (const owner of this.owners.keys()) this.disposeOwner(owner);
    await Promise.allSettled([...this.pending]);
  }
}
