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

import { randomUUID } from "node:crypto";
import type { BrowserWindow, Rectangle } from "electron";
import {
  WINDOW_RESIZE_DIRECTIONS,
  type WindowResizeDirection,
  type WindowResizePoint,
} from "./shared";

type ResizeWindow = Pick<
  BrowserWindow,
  | "isDestroyed"
  | "isVisible"
  | "isMinimized"
  | "isMaximized"
  | "isFullScreen"
  | "isResizable"
  | "setResizable"
  | "getBounds"
  | "setBounds"
  | "getMinimumSize"
  | "getMaximumSize"
> & { webContents: { readonly id: number } };
interface ResizeSession {
  id: string;
  owner: number;
  window: ResizeWindow;
  direction: WindowResizeDirection;
  origin: WindowResizePoint;
  bounds: Rectangle;
  minimum: [number, number];
  maximum: [number, number];
  resizable: boolean;
  timer?: ReturnType<typeof setTimeout>;
}
const MAX_WINDOW_SIZE = 16384;
function point(value: unknown): WindowResizePoint {
  if (!value || typeof value !== "object") throw new Error("窗口缩放坐标无效");
  const { x, y } = value as WindowResizePoint;
  if (
    [x, y].some(
      (v) =>
        typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > 10_000_000
    )
  )
    throw new Error("窗口缩放坐标无效");
  return { x, y };
}
function id(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("窗口缩放会话无效");
  return value;
}

/** Window bounds and pointer screen coordinates are both Electron DIP units. */
export class WindowResizes {
  private sessions = new Map<number, ResizeSession>();
  constructor(
    private onError: (error: unknown) => void = console.warn,
    private idleTimeoutMs = 15000
  ) {}

  private authorize(window: ResizeWindow, owner: number) {
    if (window.isDestroyed() || owner !== window.webContents.id)
      throw new Error("仅可拖动当前窗口的缩放手柄");
  }
  private renew(session: ResizeSession) {
    clearTimeout(session.timer);
    session.timer = setTimeout(() => {
      try {
        this.cancel(session.owner);
      } catch (error) {
        this.onError(error);
      }
    }, this.idleTimeoutMs);
    session.timer.unref?.();
  }
  begin(window: ResizeWindow, owner: number, value: unknown): string {
    this.authorize(window, owner);
    const input = value as { direction?: unknown; point?: unknown } | null;
    if (
      !input ||
      !WINDOW_RESIZE_DIRECTIONS.includes(
        input.direction as WindowResizeDirection
      )
    )
      throw new Error("窗口缩放方向无效");
    const origin = point(input.point);
    if (this.sessions.has(owner))
      throw new Error("窗口正在调整大小，请释放鼠标后重试");
    if (
      !window.isVisible() ||
      window.isMinimized() ||
      window.isMaximized() ||
      window.isFullScreen()
    )
      throw new Error("请先还原窗口后调整大小");
    const session: ResizeSession = {
      id: randomUUID(),
      owner,
      window,
      direction: input.direction as WindowResizeDirection,
      origin,
      bounds: window.getBounds(),
      minimum: [1, 1],
      maximum: [0, 0],
      resizable: window.isResizable(),
    };
    try {
      if (!session.resizable) window.setResizable(true);
      // Fixed windows expose their current size as min/max on Windows and Linux.
      // Enabling resize restores the configured constraints before they are read.
      const [minWidth = 1, minHeight = 1] = window.getMinimumSize();
      const [maxWidth = 0, maxHeight = 0] = window.getMaximumSize();
      session.minimum = [minWidth, minHeight];
      session.maximum = [maxWidth, maxHeight];
      this.sessions.set(owner, session);
      this.renew(session);
      return session.id;
    } catch (error) {
      this.sessions.delete(owner);
      clearTimeout(session.timer);
      if (!window.isDestroyed()) {
        try {
          window.setResizable(session.resizable);
        } catch (restoreError) {
          this.onError(restoreError);
        }
      }
      throw error;
    }
  }
  update(window: ResizeWindow, owner: number, value: unknown) {
    this.authorize(window, owner);
    const input = value as { id?: unknown; point?: unknown } | null;
    const session = this.sessions.get(owner);
    if (!input || !session || session.id !== id(input.id))
      throw new Error("窗口缩放已结束，请重新拖动");
    const current = point(input.point);
    if (
      !window.isVisible() ||
      window.isMinimized() ||
      window.isMaximized() ||
      window.isFullScreen()
    ) {
      this.cancel(owner);
      throw new Error("窗口状态已改变，请还原后重新拖动");
    }
    const dx = Math.round(current.x - session.origin.x),
      dy = Math.round(current.y - session.origin.y);
    const horizontal = session.direction.includes("East")
      ? 1
      : session.direction.includes("West")
        ? -1
        : 0;
    const vertical = session.direction.includes("South")
      ? 1
      : session.direction.includes("North")
        ? -1
        : 0;
    const clamp = (value: number, index: 0 | 1) => {
      const min = Math.max(1, session.minimum[index]);
      const max = Math.min(
        MAX_WINDOW_SIZE,
        session.maximum[index] > 0 ? session.maximum[index] : MAX_WINDOW_SIZE
      );
      return Math.max(min, Math.min(Math.max(min, max), value));
    };
    const width = horizontal
      ? clamp(session.bounds.width + horizontal * dx, 0)
      : session.bounds.width;
    const height = vertical
      ? clamp(session.bounds.height + vertical * dy, 1)
      : session.bounds.height;
    const bounds = {
      x: session.bounds.x + (horizontal < 0 ? session.bounds.width - width : 0),
      y: session.bounds.y + (vertical < 0 ? session.bounds.height - height : 0),
      width,
      height,
    };
    try {
      const previous = window.getBounds();
      if (
        Object.keys(bounds).some(
          (key) =>
            previous[key as keyof Rectangle] !== bounds[key as keyof Rectangle]
        )
      )
        window.setBounds(bounds);
      this.renew(session);
    } catch (error) {
      try {
        this.cancel(owner);
      } catch (restoreError) {
        this.onError(restoreError);
      }
      throw error;
    }
  }
  end(window: ResizeWindow, owner: number, value: unknown) {
    this.authorize(window, owner);
    const input = value as {
      id?: unknown;
      point?: unknown;
      cancelled?: unknown;
    } | null;
    const session = this.sessions.get(owner);
    if (!input || session?.id !== id(input.id)) return;
    try {
      if (input.cancelled === true) window.setBounds(session.bounds);
      else if (input.point !== undefined) this.update(window, owner, input);
    } finally {
      this.cancel(owner);
    }
  }
  /** Called on blur, hide, navigation, renderer loss and destruction as well as explicit release. */
  cancel(owner: number) {
    const session = this.sessions.get(owner);
    if (!session) return;
    this.sessions.delete(owner);
    clearTimeout(session.timer);
    if (
      !session.window.isDestroyed() &&
      session.window.isResizable() !== session.resizable
    )
      session.window.setResizable(session.resizable);
  }
}
