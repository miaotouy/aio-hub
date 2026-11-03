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

import type { WindowOptions } from "../native/window";
import type { EventCallback, UnlistenFn } from "../native/events";
import { getElectronBridge, request } from "./client";
import { listen, once, emit, emitTo } from "./events";
export class ElectronWindow {
  readonly label: string;
  private readonly created: Promise<unknown>;
  constructor(
    label: string,
    options?: WindowOptions & { url?: string },
    existing = false
  ) {
    this.label = label;
    this.created = existing
      ? Promise.resolve()
      : request("window.create", { label, options });
    // The caller observes errors through once('tauri://error'); avoid an unhandled rejection before it subscribes.
    void this.created.catch(() => {});
  }
  static async getByLabel(label: string): Promise<ElectronWindow | null> {
    const labels = await request<string[]>("window.labels");
    return labels.includes(label)
      ? new ElectronWindow(label, undefined, true)
      : null;
  }
  private async call<T = void>(method: string, value?: unknown): Promise<T> {
    await this.created;
    return request<T>("window.call", { label: this.label, method, value });
  }
  show() {
    return this.call("show");
  }
  hide() {
    return this.call("hide");
  }
  close() {
    return this.call("close");
  }
  destroy() {
    return this.call("destroy");
  }
  minimize() {
    return this.call("minimize");
  }
  maximize() {
    return this.call("maximize");
  }
  unmaximize() {
    return this.call("unmaximize");
  }
  toggleMaximize() {
    return this.call("toggleMaximize");
  }
  unminimize() {
    return this.call("unminimize");
  }
  setFocus() {
    return this.call("setFocus");
  }
  isMaximized() {
    return this.call<boolean>("isMaximized");
  }
  isMinimized() {
    return this.call<boolean>("isMinimized");
  }
  isVisible() {
    return this.call<boolean>("isVisible");
  }
  isFocused() {
    return this.call<boolean>("isFocused");
  }
  isDecorated() {
    return this.call<boolean>("isDecorated");
  }
  scaleFactor() {
    return this.call<number>("scaleFactor");
  }
  innerSize() {
    return this.call<{ width: number; height: number }>("innerSize");
  }
  outerSize() {
    return this.call<{ width: number; height: number }>("outerSize");
  }
  outerPosition() {
    return this.call<{ x: number; y: number }>("outerPosition");
  }
  innerPosition() {
    return this.call<{ x: number; y: number }>("innerPosition");
  }
  setTitle(value: string) {
    return this.call("setTitle", value);
  }
  setResizable(value: boolean) {
    return this.call("setResizable", value);
  }
  setAlwaysOnTop(value: boolean) {
    return this.call("setAlwaysOnTop", value);
  }
  setDecorations(value: boolean) {
    return this.call("setDecorations", value);
  }
  setShadow(value: boolean) {
    return this.call("setShadow", value);
  }
  setSkipTaskbar(value: boolean) {
    return this.call("setSkipTaskbar", value);
  }
  setFullscreen(value: boolean) {
    return this.call("setFullscreen", value);
  }
  setPosition(value: unknown) {
    return this.call("setPosition", value);
  }
  setSize(value: unknown) {
    return this.call("setSize", value);
  }
  setMinSize(value: unknown) {
    return this.call("setMinSize", value);
  }
  setMaxSize(value: unknown) {
    return this.call("setMaxSize", value);
  }
  setBackgroundColor(value: unknown) {
    return this.call("setBackgroundColor", value);
  }
  startDragging() {
    return this.call("startDragging");
  }
  startResizeDragging(value: string) {
    return this.call("startResizeDragging", value);
  }
  listen<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    return listen(event, handler, {
      target: { kind: "Window", label: this.label },
    });
  }
  async once<T>(event: string, handler: EventCallback<T>): Promise<UnlistenFn> {
    if (event === "tauri://created" || event === "tauri://error") {
      let active = true;
      void this.created.then(
        () => {
          if (active && event === "tauri://created")
            handler({ event, id: 0, payload: undefined as T });
        },
        (error: unknown) => {
          if (active && event === "tauri://error")
            handler({ event, id: 0, payload: String(error) as T });
        }
      );
      return () => {
        active = false;
      };
    }
    return once(event, handler, {
      target: { kind: "Window", label: this.label },
    });
  }
  emit(event: string, payload?: unknown) {
    return emit(event, payload);
  }
  emitTo(target: string, event: string, payload?: unknown) {
    return emitTo(target, event, payload);
  }
  onMoved(handler: EventCallback<{ x: number; y: number }>) {
    return this.listen("tauri://move", handler);
  }
  onResized(handler: EventCallback<{ width: number; height: number }>) {
    return this.listen("tauri://resize", handler);
  }
  onFocusChanged(handler: EventCallback<boolean>) {
    return this.listen("tauri://focus", handler);
  }
  onDragDropEvent(handler: EventCallback<unknown>) {
    return this.listen("tauri://drag-drop", handler);
  }
  onCloseRequested(
    handler: (event: { preventDefault(): void }) => void | Promise<void>
  ) {
    return this.listen("tauri://close-requested", async () => {
      let prevented = false;
      await handler({
        preventDefault() {
          prevented = true;
        },
      });
      if (!prevented) await this.destroy();
    });
  }
}
export const getCurrentWindow = () =>
  new ElectronWindow(
    getElectronBridge()?.metadata.label ?? "main",
    undefined,
    true
  );
export const getAllWindows = async () =>
  (await request<string[]>("window.labels")).map(
    (label) => new ElectronWindow(label, undefined, true)
  );
export const currentMonitor = () => request("window.monitor");
