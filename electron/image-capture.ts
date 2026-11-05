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
export const imageCaptureCommands = [
  "capture_screen_rect",
  "check_native_ocr_availability",
  "native_ocr",
] as const;
interface Runtime {
  run(command: string, configuration: string): Promise<string>;
  cancel(): void;
}
interface Addon {
  ImageCaptureRuntime: new () => Runtime;
}
interface Owner {
  disposed: boolean;
  runtime?: Runtime;
  tail: Promise<unknown>;
  count: number;
}
interface Host {
  platform?: NodeJS.Platform;
  loadAddon?(file: string): Addon;
}
/** Bounded native image work. A document owns its cancellation token and serialized requests. */
export class ImageCapture {
  private addon?: Addon;
  private owners = new Map<number, Owner>();
  private pending = new Set<Promise<unknown>>();
  private closing = false;
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(
    private readonly appPath: string,
    private readonly host: Host = {}
  ) {}
  get hasPendingOperations() {
    return this.pending.size > 0;
  }
  private getAddon() {
    return (this.addon ??= (
      this.host.loadAddon ??
      ((file) => createRequire(import.meta.url)(file) as Addon)
    )(path.join(this.appPath, "native-runtime/knowledge-addon.node")));
  }
  private async acquire() {
    if (this.active < 2) {
      this.active++;
      return;
    }
    await new Promise<void>((resolve) => this.waiters.push(resolve));
  }
  private release() {
    const next = this.waiters.shift();
    if (next) next();
    else this.active--;
  }
  runCommand(
    owner: number,
    command: string,
    args: Record<string, unknown> = {}
  ): Promise<unknown> {
    try {
      if (this.closing) throw Error("应用正在退出");
      if (!(imageCaptureCommands as readonly string[]).includes(command))
        throw Error("不支持的图像操作");
      if ((this.host.platform ?? process.platform) !== "win32")
        throw Error("屏幕采集与系统原生 OCR 需要 Windows 桌面版");
      if (this.pending.size >= 8)
        throw Error("图像任务较多，请等待当前任务完成");
      let state = this.owners.get(owner);
      if (!state) {
        state = { disposed: false, tail: Promise.resolve(), count: 0 };
        this.owners.set(owner, state);
      }
      if (state.count >= 2)
        throw Error("当前窗口的图像任务正在处理，请稍后重试");
      const configuration = JSON.stringify(args);
      if (Buffer.byteLength(configuration) > 44 * 1024 * 1024)
        throw Error("图片请求数据过大，请缩小图片后重试");
      const accepted = state;
      accepted.count++;
      const execute = async () => {
        if (accepted.disposed) throw Error("图像任务已随窗口关闭");
        await this.acquire();
        try {
          if (accepted.disposed) throw Error("图像任务已随窗口关闭");
          const runtime = (accepted.runtime ??=
            new (this.getAddon().ImageCaptureRuntime)());
          const response = await runtime.run(command, configuration);
          if (accepted.disposed) throw Error("图像任务已随窗口关闭");
          return JSON.parse(response) as unknown;
        } finally {
          this.release();
        }
      };
      const operation = accepted.tail.then(execute).finally(() => {
        accepted.count--;
        this.pending.delete(operation);
      });
      accepted.tail = operation.catch(() => {});
      this.pending.add(operation);
      return operation;
    } catch (error) {
      return Promise.reject(error);
    }
  }
  disposeOwner(owner: number) {
    const state = this.owners.get(owner);
    if (!state) return;
    this.owners.delete(owner);
    state.disposed = true;
    state.runtime?.cancel();
  }
  async shutdown() {
    this.closing = true;
    for (const owner of this.owners.keys()) this.disposeOwner(owner);
    await Promise.allSettled([...this.pending]);
  }
}
