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

import type { BrowserWindow } from "electron";

type WorkspaceWindow = Pick<
  BrowserWindow,
  | "isDestroyed"
  | "isMinimized"
  | "restore"
  | "show"
  | "focus"
  | "destroy"
  | "close"
  | "setTitle"
  | "setIgnoreMouseEvents"
  | "setSkipTaskbar"
  | "setHasShadow"
  | "setAlwaysOnTop"
  | "setResizable"
  | "setPosition"
  | "getBounds"
>;
export interface DetachedWindowInfo {
  label: string;
  id: string;
  type: "tool" | "component";
}
export interface CanvasWindowInfo {
  label: string;
  canvasId: string;
  title: string;
}
interface DetachConfig extends Record<string, unknown> {
  id: string;
  displayName: string;
  type: "tool" | "component";
  width: number;
  height: number;
  disableNativeResize: boolean;
}
interface DetachSession {
  owner: number;
  config: DetachConfig;
  task: Promise<string>;
  timer?: ReturnType<typeof setTimeout>;
}
interface WorkspaceHost {
  windows: ReadonlyMap<string, WorkspaceWindow>;
  create(label: string, options: Record<string, unknown>): Promise<void>;
  emit(event: string, payload: unknown, target?: string): void;
  transparent: boolean;
  sessionTimeoutMs?: number;
}
function text(value: unknown, name: string, maximum = 512): string {
  if (
    typeof value !== "string" ||
    !value ||
    value.length > maximum ||
    value.includes("\0")
  )
    throw new Error(name + "无效");
  return value;
}
function canvasId(value: unknown): string {
  const id = text(value, "画布 ID");
  if (!/^cp_\d{8}_[A-Za-z0-9_-]{6}$/.test(id)) throw new Error("画布 ID 无效");
  return id;
}
function size(value: unknown, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0 ||
    value > 16384
  )
    throw new Error("窗口尺寸无效");
  return Math.max(100, Math.round(value));
}
function detachConfig(value: unknown): DetachConfig {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("分离窗口配置无效");
  const input = value as Record<string, unknown>;
  const id = text(input.id, "组件 ID", 110);
  if (
    !/^[A-Za-z0-9_:.-]+$/.test(id) ||
    !["tool", "component"].includes(String(input.type))
  )
    throw new Error("分离窗口类型或 ID 无效");
  return {
    ...input,
    id,
    displayName:
      input.displayName === ""
        ? "AIO Hub"
        : text(input.displayName, "窗口名称"),
    type: input.type as DetachConfig["type"],
    width: size(input.width, 900),
    height: size(input.height, 700),
    disableNativeResize: input.disableNativeResize === true,
  };
}
/** Domain registries stay separate: detached components reattach; Canvas windows emit Canvas events. */
export class WorkspaceWindows {
  readonly detached = new Map<string, DetachedWindowInfo>();
  readonly canvases = new Map<string, CanvasWindowInfo>();
  private sessions = new Map<string, DetachSession>();
  private canvasCreating = new Map<string, Promise<string>>();
  private detachedCreating = new Map<string, Promise<string>>();
  constructor(private host: WorkspaceHost) {}
  private window(label: string) {
    const win = this.host.windows.get(label);
    if (!win || win.isDestroyed()) throw new Error("窗口已关闭：" + label);
    return win;
  }
  private focus(label: string) {
    const win = this.window(label);
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  begin(owner: number, value: unknown): Promise<string> {
    const config = detachConfig(value),
      label = "detached-" + config.id;
    if (this.detached.has(label)) {
      this.focus(label);
      return Promise.resolve(label);
    }
    const existing = this.sessions.get(label);
    if (existing) {
      if (existing.owner !== owner) throw new Error("分离会话属于其他窗口");
      return existing.task;
    }
    if (this.detachedCreating.has(label))
      throw new Error("分离会话正在清理，请稍后重试");
    if (this.host.windows.has(label)) throw new Error("窗口标识已被使用");
    const session: DetachSession = {
      owner,
      config,
      task: Promise.resolve(label),
    };
    this.sessions.set(label, session);
    session.task = Promise.resolve()
      .then(async () => {
        if (this.sessions.get(label) !== session)
          throw new Error("分离会话已取消");
        const route =
          config.type === "tool"
            ? "/detached-window/" +
              config.id.replace(
                /[A-Z]/g,
                (char, index) => (index ? "-" : "") + char.toLowerCase()
              )
            : "/detached-component/" +
              config.id +
              "?config=" +
              encodeURIComponent(JSON.stringify(config));
        try {
          await this.host.create(label, {
            url: route,
            title: config.displayName,
            width: config.width,
            height: config.height,
            minWidth: 100,
            minHeight: 100,
            visible: false,
            skipTaskbar: true,
            transparent: this.host.transparent,
          });
          if (this.sessions.get(label) !== session)
            throw new Error("分离会话已取消");
          this.window(label).setIgnoreMouseEvents(true);
          session.timer = setTimeout(
            () => this.abort(label, session),
            this.host.sessionTimeoutMs ?? 30000
          );
          session.timer.unref?.();
          return label;
        } catch (error) {
          this.abort(label, session);
          throw error;
        }
      })
      .finally(() => this.detachedCreating.delete(label));
    this.detachedCreating.set(label, session.task);
    return session.task;
  }
  private abort(label: string, session: DetachSession) {
    clearTimeout(session.timer);
    if (this.sessions.get(label) === session) this.sessions.delete(label);
    if (!this.detached.has(label)) {
      const win = this.host.windows.get(label);
      if (win && !win.isDestroyed()) win.destroy();
    }
  }
  async finalize(owner: number, sessionId: string, shouldDetach: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (shouldDetach && this.detached.has(sessionId)) {
        this.focus(sessionId);
        return;
      }
      throw new Error("分离会话不存在或已处理");
    }
    if (session.owner !== owner) throw new Error("分离会话属于其他窗口");
    await session.task;
    if (this.sessions.get(sessionId) !== session) {
      if (shouldDetach && this.detached.has(sessionId)) {
        this.focus(sessionId);
        return;
      }
      throw new Error("分离会话已取消");
    }
    if (!shouldDetach) {
      this.abort(sessionId, session);
      return;
    }
    const win = this.window(sessionId),
      config = session.config;
    win.setTitle(config.displayName);
    win.setIgnoreMouseEvents(false);
    win.setSkipTaskbar(false);
    win.setHasShadow(config.type === "tool");
    if (config.type === "component") win.setAlwaysOnTop(true);
    if (config.disableNativeResize) win.setResizable(false);
    const info: DetachedWindowInfo = {
      label: sessionId,
      id: config.id,
      type: config.type,
    };
    clearTimeout(session.timer);
    this.sessions.delete(sessionId);
    this.detached.set(sessionId, info);
    this.host.emit("finalize-component-view", undefined, sessionId);
    this.host.emit("window-detached", info);
    this.focus(sessionId);
  }
  updatePosition(owner: number, sessionId: string, x: number, y: number) {
    const session = this.sessions.get(sessionId);
    if (!session || session.owner !== owner)
      throw new Error("分离会话不存在或属于其他窗口");
    if (![x, y].every((v) => Number.isFinite(v) && Math.abs(v) <= 10000000))
      throw new Error("窗口位置无效");
    const win = this.window(sessionId),
      bounds = win.getBounds();
    win.setPosition(
      Math.round(x - bounds.width / 2),
      Math.round(y - bounds.height / 2)
    );
  }
  updateStatus(owner: number, sessionId: string, canDetach: boolean) {
    const session = this.sessions.get(sessionId);
    if (!session || session.owner !== owner)
      throw new Error("分离会话不存在或属于其他窗口");
    this.host.emit("detach-status-update", { canDetach }, sessionId);
  }
  registerTool(label: string) {
    if (this.detached.has(label)) return;
    const info: DetachedWindowInfo = { label, id: label, type: "tool" };
    this.detached.set(label, info);
    this.host.emit("finalize-component-view", undefined, label);
    this.host.emit("window-detached", info);
  }
  createCanvas(args: Record<string, unknown>): Promise<string> {
    const id = canvasId(args.canvasId),
      label = "canvas-win-" + id;
    const pending = this.canvasCreating.get(label);
    if (pending) return pending;
    if (this.canvases.has(label)) {
      this.focus(label);
      return Promise.resolve(label);
    }
    if (this.host.windows.has(label)) throw new Error("窗口标识已被使用");
    const title = text(args.title, "画布标题"),
      width = size(args.width, 1200),
      height = size(args.height, 800);
    const task = Promise.resolve().then(async () => {
      try {
        await this.host.create(label, {
          url: "/canvas-window/" + id,
          title,
          width,
          height,
          minWidth: 400,
          minHeight: 300,
          visible: false,
          transparent: this.host.transparent,
        });
        this.window(label);
        const info = { label, canvasId: id, title };
        this.canvases.set(label, info);
        this.host.emit("canvas-window-opened", info);
        this.focus(label);
        return label;
      } catch (error) {
        this.host.windows.get(label)?.destroy();
        throw error;
      } finally {
        this.canvasCreating.delete(label);
      }
    });
    this.canvasCreating.set(label, task);
    return task;
  }
  closeCanvas(value: unknown) {
    this.host.windows.get("canvas-win-" + canvasId(value))?.close();
  }
  closeAllCanvases(): number {
    const labels = [...this.canvases.keys()];
    for (const label of labels) this.host.windows.get(label)?.close();
    return labels.length;
  }
  closed(label: string) {
    const session = this.sessions.get(label);
    if (session) {
      clearTimeout(session.timer);
      this.sessions.delete(label);
    }
    const detached = this.detached.get(label);
    if (detached) {
      this.detached.delete(label);
      this.host.emit("window-attached", detached);
    }
    const canvas = this.canvases.get(label);
    if (canvas) {
      this.canvases.delete(label);
      this.host.emit("canvas-window-closed", canvas);
    }
  }
  disposeOwner(owner: number) {
    for (const [label, session] of this.sessions)
      if (session.owner === owner) this.abort(label, session);
  }
}
