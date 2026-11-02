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
import { restoreImportedAgentAssets } from "../agentImportedAssetService";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// Protect the shared archive-to-storage contract used by import and upgrade.
describe("restoreImportedAgentAssets", () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(undefined);
  });

  it("restores nested assets, thumbnails and avatar history without mutating the source", async () => {
    const source = {
      icon: "assets/avatar.png",
      avatarHistory: ["assets/old.png", "old.png"],
      assets: [
        {
          path: "assets/images/picture.png",
          thumbnailPath: "assets/thumbs/picture.png",
        },
      ],
    };
    const files = Object.fromEntries(
      ["avatar.png", "old.png", "images/picture.png", "thumbs/picture.png"].map(
        (name) => [`assets/${name}`, new Uint8Array([1]).buffer]
      )
    );
    const restored = await restoreImportedAgentAssets(source, files, "target");
    expect(restored).toEqual({
      ...source,
      icon: "avatar.png",
      avatarHistory: ["old.png", "old.png"],
    });
    expect(source.icon).toBe("assets/avatar.png");
    expect(
      invoke.mock.calls.map(
        ([, args]) => `${args.subdirectory}/${args.filename}`
      )
    ).toEqual([
      "agent-manager/agents/target/avatar.png",
      "agent-manager/agents/target/old.png",
      "agent-manager/agents/target/assets/images/picture.png",
      "agent-manager/agents/target/assets/thumbs/picture.png",
    ]);
  });

  it("rejects archive references that would escape the agent directory", async () => {
    await expect(
      restoreImportedAgentAssets(
        { assets: [{ path: "assets/../../escape.png" }] },
        {
          "assets/../../escape.png": new Uint8Array([1]).buffer,
        },
        "target"
      )
    ).rejects.toThrow("资产路径无效");
    expect(invoke).not.toHaveBeenCalled();
  });
});
