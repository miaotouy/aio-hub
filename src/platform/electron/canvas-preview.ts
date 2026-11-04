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

import { request } from "./client";
interface PreviewSession {
  id: string;
  baseUrl: string;
}
export class ElectronCanvasPreview {
  private session?: PreviewSession;
  private canvasId?: string;
  private tasks = Promise.resolve();
  private disposed = false;
  render(
    input: { canvasId: string; basePath: string },
    build: (baseUrl: string) => string
  ): Promise<{ src: string; srcdoc: string }> {
    const task = this.tasks
      .catch(() => {})
      .then(async () => {
        if (this.disposed) throw new Error("画布预览已关闭");
        if (this.canvasId !== input.canvasId || !this.session) {
          await this.release();
          this.session = await request<PreviewSession>(
            "canvas-preview.create",
            { canvasId: input.canvasId }
          );
          this.canvasId = input.canvasId;
        }
        if (this.disposed) {
          await this.release();
          throw new Error("画布预览已关闭");
        }
        const src = await request<string>("canvas-preview.update", {
          id: this.session.id,
          html: build(this.session.baseUrl),
        });
        return { src, srcdoc: "" };
      });
    this.tasks = task.then(
      () => {},
      () => {}
    );
    return task;
  }
  private async release() {
    if (!this.session) return;
    const session = this.session;
    this.session = undefined;
    this.canvasId = undefined;
    await request("canvas-preview.release", { id: session.id });
  }
  async dispose() {
    this.disposed = true;
    await this.tasks.catch(() => {});
    await this.release();
  }
}
