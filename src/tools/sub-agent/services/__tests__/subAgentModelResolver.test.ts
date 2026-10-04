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
import type { ChatAgent } from "@/tools/agent-manager/types/agent";

const mocks = vi.hoisted(() => ({
  enabledProfiles: { value: [] as Array<Record<string, unknown>> },
}));

vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    enabledProfiles: mocks.enabledProfiles,
  }),
}));

import { resolveSubAgentModel } from "../subAgentModelResolver";

function makeAgent(overrides: Partial<ChatAgent> = {}): ChatAgent {
  return {
    id: "agent-x",
    name: "agent-x",
    profileId: "",
    modelId: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  } as ChatAgent;
}

describe("resolveSubAgentModel 模型晚绑定决策链", () => {
  beforeEach(() => {
    mocks.enabledProfiles.value = [
      {
        id: "profile-a",
        enabled: true,
        models: [{ id: "model-a1" }, { id: "model-a2" }],
      },
      {
        id: "profile-b",
        enabled: true,
        models: [{ id: "model-b1" }],
      },
    ];
  });

  it("inherit_caller（默认）跟随调用方父会话模型", () => {
    const resolved = resolveSubAgentModel(makeAgent(), {
      callerProfileId: "profile-a",
      callerModelId: "model-a2",
    });
    expect(resolved).toEqual({
      profileId: "profile-a",
      modelId: "model-a2",
      source: "caller",
    });
  });

  it("prefer_self 且自身模型有效时使用自身模型", () => {
    const resolved = resolveSubAgentModel(
      makeAgent({
        subAgentConfig: {
          enabled: true,
          modelBindingMode: "prefer_self",
        },
        profileId: "profile-b",
        modelId: "model-b1",
      }),
      { callerProfileId: "profile-a", callerModelId: "model-a1" }
    );
    expect(resolved).toEqual({
      profileId: "profile-b",
      modelId: "model-b1",
      source: "self",
    });
  });

  it("prefer_self 但自身 Profile 被删除时优雅降级回调用方模型", () => {
    const resolved = resolveSubAgentModel(
      makeAgent({
        subAgentConfig: {
          enabled: true,
          modelBindingMode: "prefer_self",
        },
        profileId: "profile-deleted",
        modelId: "model-gone",
      }),
      { callerProfileId: "profile-a", callerModelId: "model-a1" }
    );
    expect(resolved).toEqual({
      profileId: "profile-a",
      modelId: "model-a1",
      source: "caller",
    });
  });

  it("调用方模型不可用时回退系统激活的默认 Profile 首选模型", () => {
    const resolved = resolveSubAgentModel(makeAgent(), {
      callerProfileId: "profile-gone",
      callerModelId: "model-gone",
    });
    expect(resolved).toEqual({
      profileId: "profile-a",
      modelId: "model-a1",
      source: "fallback",
    });
  });

  it("无任何可用 Profile 时抛出明确可操作的错误提示", () => {
    mocks.enabledProfiles.value = [];
    expect(() => resolveSubAgentModel(makeAgent(), {})).toThrow(
      "无法解析到可用模型：当前无可用上级模型且系统未启用任何 LLM Profile"
    );
  });
});
