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

import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ listen: vi.fn() }));
vi.mock("./core/env", () => ({ isTauriRuntime: () => true }));
vi.mock("./native/events", () => ({ listen: mocks.listen }));
import { onWindowDestroyed, onFileDropPaths } from "./modules/window";
afterEach(() => vi.resetAllMocks());

// Protect detached-window state restoration when the host puts identity in either envelope field.
it("normalizes window identity and returns the native teardown", async () => {
  const handler = vi.fn();
  const stop = vi.fn();
  mocks.listen.mockImplementation(async (event, callback) => {
    expect(event).toBe("tauri://destroyed");
    callback({ payload: { label: "detached-tool" } });
    callback({ payload: null, windowLabel: "overlay" });
    return stop;
  });
  const unlisten = await onWindowDestroyed(handler);
  expect(handler.mock.calls).toEqual([
    [{ label: "detached-tool", windowLabel: undefined }],
    [{ label: undefined, windowLabel: "overlay" }],
  ]);
  unlisten();
  expect(stop).toHaveBeenCalledTimes(1);
});

it("forwards dropped paths and returns the listener teardown", async () => {
  const handler = vi.fn();
  const stop = vi.fn();
  const paths = ["C:\\media\\片段.mp4"];
  mocks.listen.mockImplementation(async (name, callback) => {
    expect(name).toBe("tauri-file-drop");
    callback({ payload: paths });
    return stop;
  });
  const unlisten = await onFileDropPaths(handler);
  expect(handler).toHaveBeenCalledWith(paths);
  unlisten();
  expect(stop).toHaveBeenCalledTimes(1);
});
