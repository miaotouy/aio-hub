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

import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { streamLoadRepository, type GitProgressEvent } from "../useGitLoader";

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(),
}));

describe("git analyzer stream loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forwards the selected branch to the full-load command", async () => {
    let emitProgress:
      ((event: { payload: GitProgressEvent }) => void) | undefined;
    const unlisten = vi.fn();

    vi.mocked(listen).mockImplementation(async (_event, handler) => {
      emitProgress = handler as typeof emitProgress;
      return unlisten;
    });
    vi.mocked(invoke).mockImplementation(async () => {
      emitProgress?.({ payload: { type: "end" } });
    });

    await streamLoadRepository(
      {
        path: "C:/repo",
        branch: "feature",
        limit: 100,
        batchSize: 20,
      },
      vi.fn()
    );

    expect(invoke).toHaveBeenCalledWith("git_load_repository_stream", {
      path: "C:/repo",
      branch: "feature",
      limit: 100,
      batchSize: 20,
      includeFiles: undefined,
      includeLineStats: undefined,
      includeBranchInference: undefined,
    });
    expect(unlisten).toHaveBeenCalledOnce();
  });
});
