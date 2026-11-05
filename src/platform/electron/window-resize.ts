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

import { getElectronBridge, request } from "./client";
import {
  WINDOW_RESIZE_DIRECTIONS,
  type WindowResizeDirection,
  type WindowResizePoint,
} from "../../../electron/shared";

interface ResizePointer {
  id: number;
  target: Element;
  origin: WindowResizePoint;
  latest: WindowResizePoint;
}
let pointer: ResizePointer | undefined;
let tracking = false;
let active:
  { label: string; pointerId: number; task: Promise<void> } | undefined;
const position = (event: PointerEvent): WindowResizePoint => ({
  x: event.screenX,
  y: event.screenY,
});

/** Keep the initiating pointer across the async window/IPC calls made by existing mousedown handlers. */
export function ensureResizeInputTracking() {
  if (tracking || typeof window === "undefined" || !getElectronBridge()) return;
  tracking = true;
  document.addEventListener(
    "pointerdown",
    (event) => {
      if (
        event.button === 0 &&
        event.isPrimary &&
        event.target instanceof Element
      ) {
        pointer = {
          id: event.pointerId,
          target: event.target,
          origin: position(event),
          latest: position(event),
        };
      }
    },
    true
  );
  document.addEventListener(
    "pointermove",
    (event) => {
      if (pointer?.id === event.pointerId) pointer.latest = position(event);
    },
    true
  );
  const release = (event: PointerEvent) => {
    if (pointer?.id === event.pointerId) pointer = undefined;
  };
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
  window.addEventListener("blur", () => {
    pointer = undefined;
  });
  window.addEventListener("pagehide", () => {
    pointer = undefined;
  });
}
ensureResizeInputTracking();

const cursors: Record<WindowResizeDirection, string> = {
  North: "n-resize",
  NorthEast: "ne-resize",
  East: "e-resize",
  SouthEast: "se-resize",
  South: "s-resize",
  SouthWest: "sw-resize",
  West: "w-resize",
  NorthWest: "nw-resize",
};
async function drag(
  label: string,
  direction: WindowResizeDirection,
  input: ResizePointer,
  ready: Promise<unknown>
) {
  let session: string | undefined;
  let latest = input.latest;
  let stopped = false,
    cancelled = false,
    failure: unknown;
  let frame = 0,
    heartbeat: number | undefined;
  let running = false,
    inFlight = Promise.resolve();
  let finish!: () => void;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const stop = () => {
    stopped = true;
    finish();
  };
  const call = <T = void>(method: string, value: unknown) =>
    request<T>("window.call", { label, method, value });
  const send = () => {
    frame = 0;
    if (!session || stopped || running) return;
    const sent = latest;
    running = true;
    inFlight = call("updateResizeDragging", { id: session, point: sent })
      .catch((error) => {
        if (!stopped) {
          failure = error;
          stop();
        }
      })
      .finally(() => {
        running = false;
        if (!stopped && sent !== latest && !frame)
          frame = window.requestAnimationFrame(send);
      });
  };
  const move = (event: PointerEvent) => {
    if (event.pointerId !== input.id || stopped) return;
    latest = position(event);
    if (!(event.buttons & 1)) {
      stop();
      return;
    }
    event.preventDefault();
    if (!frame) frame = window.requestAnimationFrame(send);
  };
  const release = (event: PointerEvent) => {
    if (event.pointerId !== input.id) return;
    latest = position(event);
    stop();
  };
  const cancel = (event: PointerEvent) => {
    if (event.pointerId === input.id) {
      cancelled = true;
      stop();
    }
  };
  const lost = (event: PointerEvent) => {
    if (event.pointerId === input.id) stop();
  };
  const key = (event: KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelled = true;
      stop();
    }
  };
  const visibility = () => {
    if (document.hidden) stop();
  };
  const html = document.documentElement,
    oldCursor = html.style.cursor,
    oldSelect = html.style.userSelect;
  document.addEventListener("pointermove", move, {
    capture: true,
    passive: false,
  });
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", cancel, true);
  document.addEventListener("keydown", key, true);
  document.addEventListener("visibilitychange", visibility);
  input.target.addEventListener("lostpointercapture", lost as EventListener);
  window.addEventListener("blur", stop);
  window.addEventListener("pagehide", stop);
  try {
    input.target.setPointerCapture(input.id);
    html.style.cursor = cursors[direction];
    html.style.userSelect = "none";
    await ready;
    session = await call<string>("startResizeDragging", {
      direction,
      point: input.origin,
    });
    if (!stopped) {
      heartbeat = window.setInterval(send, 2000);
      send();
      await finished;
    }
  } catch (error) {
    failure = error;
  } finally {
    stopped = true;
    if (frame) window.cancelAnimationFrame(frame);
    window.clearInterval(heartbeat);
    await inFlight;
    if (session) {
      try {
        await call("endResizeDragging", {
          id: session,
          point: latest,
          cancelled,
        });
      } catch (error) {
        failure ??= error;
      }
    }
    document.removeEventListener("pointermove", move, true);
    document.removeEventListener("pointerup", release, true);
    document.removeEventListener("pointercancel", cancel, true);
    document.removeEventListener("keydown", key, true);
    document.removeEventListener("visibilitychange", visibility);
    input.target.removeEventListener(
      "lostpointercapture",
      lost as EventListener
    );
    window.removeEventListener("blur", stop);
    window.removeEventListener("pagehide", stop);
    if (input.target.hasPointerCapture(input.id))
      input.target.releasePointerCapture(input.id);
    html.style.cursor = oldCursor;
    html.style.userSelect = oldSelect;
  }
  if (failure) throw failure;
}

export async function startWindowResizeDragging(
  label: string,
  direction: string,
  ready: Promise<unknown>
): Promise<void> {
  ensureResizeInputTracking();
  if (!WINDOW_RESIZE_DIRECTIONS.includes(direction as WindowResizeDirection))
    throw new Error("窗口缩放方向无效");
  if (label !== getElectronBridge()?.metadata.label)
    throw new Error("请在目标窗口的缩放手柄上拖动");
  if (!pointer) throw new Error("请按住窗口缩放手柄后拖动");
  if (active) {
    if (active.label === label && active.pointerId === pointer.id)
      return active.task;
    throw new Error("窗口正在调整大小，请释放鼠标后重试");
  }
  const input = pointer;
  const task = drag(
    label,
    direction as WindowResizeDirection,
    input,
    ready
  ).finally(() => {
    if (active?.task === task) active = undefined;
  });
  active = { label, pointerId: input.id, task };
  return task;
}
