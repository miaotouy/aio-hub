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

  it("自身绑定失效时返回配置错误，即使调用方和其他渠道可用", () => {
    expect(() =>
      resolveSubAgentModel(
        makeAgent({
          subAgentConfig: { enabled: true, modelBindingMode: "prefer_self" },
          profileId: "deleted",
          modelId: "missing",
        }),
        { callerProfileId: "profile-a", callerModelId: "model-a1" }
      )
    ).toThrow("自身绑定的渠道或模型不可用");
  });
  it("继承失效或缺失时返回配置错误", () => {
    expect(() =>
      resolveSubAgentModel(makeAgent(), {
        callerProfileId: "gone",
        callerModelId: "gone",
      })
    ).toThrow("调用方模型");
    expect(() => resolveSubAgentModel(makeAgent())).toThrow("调用方模型");
  });
  it("保留调用方虚拟渠道的逻辑模型绑定", () => {
    mocks.enabledProfiles.value.push({
      id: "virtual",
      type: "virtual",
      models: [{ id: "logical-model" }],
    });
    expect(
      resolveSubAgentModel(
        makeAgent({ profileId: "profile-b", modelId: "model-b1" }),
        { callerProfileId: "virtual", callerModelId: "logical-model" }
      )
    ).toEqual({
      profileId: "virtual",
      modelId: "logical-model",
      source: "caller",
    });
  });
});
