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

import { expect, it } from "vitest";
import { toWindowMonitor } from "./window-monitor";

it("keeps monitor bounds and the taskbar-excluded work area in physical pixels on an offset display", () => {
  const monitor = toWindowMonitor({
    label: "Secondary",
    bounds: { x: -1280, y: 80, width: 1280, height: 800 },
    size: { width: 1280, height: 800 },
    scaleFactor: 1.5,
    workArea: { x: -1280, y: 104, width: 1280, height: 736 },
  });
  expect(monitor).toEqual({
    name: "Secondary",
    position: { x: -1920, y: 120 },
    size: { width: 1920, height: 1200 },
    scaleFactor: 1.5,
    workArea: {
      position: { x: -1920, y: 156 },
      size: { width: 1920, height: 1104 },
    },
  });
});
