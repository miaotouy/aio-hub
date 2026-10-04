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

const mocks = vi.hoisted(() => ({
  agents: [] as Array<{ id: string }>,
  loadAgents: vi.fn(),
  createAgent: vi.fn(),
  ensurePresetAssetsImported: vi.fn(),
  fetch: vi.fn(),
}));

vi.stubGlobal("fetch", mocks.fetch);

vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({
    agents: mocks.agents,
    loadAgents: mocks.loadAgents,
    createAgent: mocks.createAgent,
    ensurePresetAssetsImported: mocks.ensurePresetAssetsImported,
  }),
}));

import { subAgentBaselineService } from "../subAgentBaselineService";
import { builtinPresets } from "@/config/agent-presets";

describe("SubAgentBaselineService 按需释出", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.agents = [];
    mocks.loadAgents.mockResolvedValue(undefined);
    mocks.createAgent.mockImplementation(
      (_name: string, _p: string, _m: string, options: { customId?: string }) =>
        options.customId ?? "agent-random"
    );
    mocks.ensurePresetAssetsImported.mockResolvedValue(undefined);
    // 测试环境无 public 静态资源，按索引 configUrl 返回预设 JSON
    mocks.fetch.mockImplementation(async (url: string) => {
      const meta = builtinPresets.find((p) => p.configUrl === url);
      if (!meta) {
        return { ok: false, status: 404 };
      }
      return {
        ok: true,
        status: 200,
        json: async () => ({
          name: meta.id,
          displayName: meta.name,
          description: meta.description,
          icon: meta.icon,
          category: "workflow",
          subAgentConfig: {
            enabled: true,
            modelBindingMode: "inherit_caller",
            isBuiltinBaseline: true,
            onlySubVisible: true,
          },
          parameters: { temperature: 0.3 },
          presetMessages: [],
          toolCallConfig: { enabled: true, mode: "auto" },
        }),
      };
    });
  });

  it("纯净安装时释出内置基线并保持稳定 ID", async () => {
    await subAgentBaselineService.ensureBaselineMaterialized();

    expect(mocks.createAgent).toHaveBeenCalledTimes(1);
    const createdIds = mocks.createAgent.mock.calls.map(
      (call) => call[3]?.customId
    );
    expect(createdIds).toEqual([
      "builtin-subagent",
    ]);
    // 释出的 Agent 应完成预设资产导入
    expect(mocks.ensurePresetAssetsImported).toHaveBeenCalledTimes(1);
  });

  it("已存在（无论启用状态）的内置 ID 绝不重复释出覆盖", async () => {
    mocks.agents = [
      { id: "builtin-subagent" },
    ];

    await subAgentBaselineService.ensureBaselineMaterialized();

    expect(mocks.createAgent).not.toHaveBeenCalled();
    expect(mocks.ensurePresetAssetsImported).not.toHaveBeenCalled();
  });

  it("仅在缺失时释出，保留用户修改过的实体", async () => {
    mocks.agents = [{ id: "builtin-subagent" }];

    await subAgentBaselineService.ensureBaselineMaterialized();

    expect(mocks.createAgent).not.toHaveBeenCalled();
  });

  it("释出后的 Agent 携带内置基线标记与 enabled: true", async () => {
    await subAgentBaselineService.ensureBaselineMaterialized();

    const [, , , options] = mocks.createAgent.mock.calls[0];
    expect(options.subAgentConfig).toMatchObject({
      enabled: true,
      isBuiltinBaseline: true,
      onlySubVisible: true,
    });
  });

  it("并发调用共享同一释出 Promise；完成后重置允许删除后重释", async () => {
    const [first, second] = await Promise.all([
      subAgentBaselineService.ensureBaselineMaterialized(),
      subAgentBaselineService.ensureBaselineMaterialized(),
    ]);
    await Promise.all([first, second]);
    expect(mocks.createAgent).toHaveBeenCalledTimes(1);

    // 模拟用户删除后再次触发：应重新释出
    mocks.createAgent.mockClear();
    mocks.agents = [];
    await subAgentBaselineService.ensureBaselineMaterialized();
    expect(mocks.createAgent).toHaveBeenCalledTimes(1);
  });

  it("所有内置预设均已在 builtinPresets 静态索引中注册", async () => {
    await subAgentBaselineService.ensureBaselineMaterialized();

    for (const id of [
      "builtin-subagent",
    ]) {
      const meta = builtinPresets.find((p) => p.id === id);
      expect(meta, `${id} 缺少静态索引注册`).toBeDefined();
      expect(meta?.configUrl).toContain(id);
    }
  });
});
