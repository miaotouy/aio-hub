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

import { PhysicalPosition } from "../native/window";
import type { DragDropEvent } from "../native/webview";
import type { EventCallback, UnlistenFn } from "../native/events";
import type { NativeDragDrop } from "../../../electron/drag-drop";
import { getElectronBridge } from "./client";
import { listen } from "./events";
let nextId = 0;
function normalized(event: NativeDragDrop): DragDropEvent {
  return event.type === "leave"
    ? event
    : {
        ...event,
        position: new PhysicalPosition(event.position.x, event.position.y),
      };
}
export async function onDragDropEvent(
  label: string,
  handler: EventCallback<DragDropEvent>
): Promise<UnlistenFn> {
  const host = getElectronBridge();
  if (!host) throw new Error("Electron 拖放监听桥未就绪");
  if (label === host.metadata.label) {
    const id = ++nextId;
    let active = true;
    const stop = host.subscribeDragDrop((event, preventDefault) => {
      if (active) {
        const forwarded = {
          event: "tauri://drag-" + event.type,
          id,
          payload: normalized(event),
          preventDefault,
        };
        handler(forwarded);
      }
    });
    return () => {
      if (active) {
        active = false;
        stop();
      }
    };
  }
  const stops: UnlistenFn[] = [];
  try {
    for (const type of ["enter", "over", "drop", "leave"] as const) {
      stops.push(
        await listen<NativeDragDrop>(
          "tauri://drag-" + type,
          (event) => {
            handler({
              ...event,
              payload: normalized(
                type === "leave"
                  ? { type }
                  : ({ ...event.payload, type } as NativeDragDrop)
              ),
            });
          },
          { target: { kind: "Window", label } }
        )
      );
    }
  } catch (error) {
    stops.forEach((stop) => stop());
    throw error;
  }
  return () => {
    stops.splice(0).forEach((stop) => stop());
  };
}
