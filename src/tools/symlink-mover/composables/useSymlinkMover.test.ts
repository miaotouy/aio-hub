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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@/platform/native/core";
import { listen } from "@/platform/native/events";
import { useSymlinkMoverLogic } from "./useSymlinkMover";
vi.mock("@/platform/native/events", () => ({ listen: vi.fn() }));
vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ info: vi.fn(), debug: vi.fn() }),
}));
vi.mock("@/utils/errorHandler", () => ({
  ErrorLevel: { WARNING: "warning", ERROR: "error" },
  createModuleErrorHandler: () => ({
    wrapAsync: async (fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    },
  }),
}));
let logic: ReturnType<typeof useSymlinkMoverLogic>;
beforeEach(() => {
  vi.clearAllMocks();
  logic = useSymlinkMoverLogic();
});
afterEach(async () => {
  await logic.dispose();
});
const options = {
  sourcePaths: ["C:/source.txt"],
  targetDir: "C:/target",
  linkType: "symlink" as const,
};
describe("symlink frontend task ownership", () => {
  it("closes a listener that finishes registering after disposal", async () => {
    let finish!: (value: () => void) => void;
    vi.mocked(listen).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    const pending = logic.startProgressListener(vi.fn());
    await logic.dispose();
    const unlisten = vi.fn();
    finish(unlisten);
    expect(await pending).toBe(false);
    expect(unlisten).toHaveBeenCalledOnce();
    expect(await logic.moveAndLink(options)).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
  it("filters stale progress and cancels only its current operation", async () => {
    let callback!: (event: { payload: any }) => void;
    const unlisten = vi.fn();
    vi.mocked(listen).mockImplementationOnce(async (_name, handler: any) => {
      callback = handler;
      return unlisten;
    });
    const onProgress = vi.fn();
    await logic.startProgressListener(onProgress);
    let finish!: (value: string) => void;
    vi.mocked(invoke).mockImplementation(async (command) =>
      command === "move_and_link"
        ? new Promise((resolve) => {
            finish = resolve;
          })
        : (null as any)
    );
    const pending = logic.moveAndLink(options);
    await vi.waitFor(() => expect(finish).toBeTypeOf("function"));
    const id = (
      vi
        .mocked(invoke)
        .mock.calls.find((call) => call[0] === "move_and_link")?.[1] as any
    ).operationId;
    callback({ payload: { operationId: "old", copiedBytes: 1 } });
    expect(onProgress).not.toHaveBeenCalled();
    callback({ payload: { operationId: id, copiedBytes: 2 } });
    expect(onProgress).toHaveBeenCalledOnce();
    expect(await logic.createLinksOnly(options)).toBeNull();
    await logic.cancelOperation();
    expect(invoke).toHaveBeenCalledWith("cancel_move_operation", {
      operationId: id,
    });
    finish("done");
    expect(await pending).toBe("done");
    callback({ payload: { operationId: id, copiedBytes: 3 } });
    expect(onProgress).toHaveBeenCalledOnce();
    await logic.dispose();
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
