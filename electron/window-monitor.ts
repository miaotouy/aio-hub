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

import type { Display } from "electron";

/** Preserve the shared physical-pixel monitor contract, including the taskbar-excluded work area. */
export function toWindowMonitor(
  display: Pick<
    Display,
    "label" | "bounds" | "size" | "scaleFactor" | "workArea"
  >
) {
  const scale = display.scaleFactor;
  const position = (rect: { x: number; y: number }) => ({
    x: rect.x * scale,
    y: rect.y * scale,
  });
  const size = (rect: { width: number; height: number }) => ({
    width: rect.width * scale,
    height: rect.height * scale,
  });
  return {
    name: display.label,
    position: position(display.bounds),
    size: size(display.size),
    scaleFactor: scale,
    workArea: {
      position: position(display.workArea),
      size: size(display.workArea),
    },
  };
}
