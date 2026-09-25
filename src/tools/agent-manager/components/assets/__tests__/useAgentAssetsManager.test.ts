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
import { useAgentAssetsManager } from "../useAgentAssetsManager";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  error: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mocks.invoke,
  convertFileSrc: vi.fn(),
}));

vi.mock("@vueuse/core", () => ({
  useClipboard: () => ({ copy: vi.fn() }),
}));

vi.mock("@/utils/appPath", () => ({
  getAppConfigDir: vi.fn(),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({ error: mocks.error }),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/customMessage", () => ({
  customMessage: {
    success: mocks.success,
    warning: mocks.warning,
  },
}));

describe("useAgentAssetsManager", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.error.mockReset();
    mocks.success.mockReset();
    mocks.warning.mockReset();
    mocks.invoke.mockResolvedValue({
      filename: "听歌.png",
      path: "assets/听歌.png",
      mimeType: "image/png",
      size: 3,
    });
  });

  it("同时收到同名路径和 File 导入时只保存一次", async () => {
    const emit = vi.fn();
    const manager = useAgentAssetsManager(
      {
        modelValue: [],
        assetGroups: [],
        agentId: "agent-1",
      },
      emit
    );
    const file = {
      name: "听歌.png",
      arrayBuffer: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]).buffer),
    } as unknown as File;

    await Promise.all([
      manager.handleFileObjectsUpload([file]),
      manager.handleFileUpload(["C:\\fixtures\\听歌.png"]),
    ]);

    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke).toHaveBeenCalledWith("save_agent_asset", {
      agentId: "agent-1",
      fileName: "听歌.png",
      data: expect.any(Uint8Array),
      customId: "听歌",
    });
    expect(manager.assets.value).toHaveLength(1);
    expect(manager.assets.value[0]).toMatchObject({
      filename: "听歌.png",
      group: "default",
    });
    expect(emit).toHaveBeenCalledWith("physical-change");
  });
});
