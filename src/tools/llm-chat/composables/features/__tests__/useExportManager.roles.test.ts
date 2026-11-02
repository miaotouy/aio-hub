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

import { describe, expect, it, vi } from "vitest";
import type {
  ChatMessageNode,
  ChatSessionDetail,
  ChatSessionIndex,
  MessageRole,
} from "../../../types";
import { useExportManager } from "../useExportManager";
import { filterSessionExportRoles } from "../../../utils/exportRoles";

vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({ getProfileById: () => null }),
}));
vi.mock("@/tools/llm-chat/stores/userProfileStore", () => ({
  useUserProfileStore: () => ({ getProfileById: () => null }),
}));
vi.mock("@/tools/agent-manager/stores/agentStore", () => ({
  useAgentStore: () => ({ getAgentById: () => null }),
}));

const timestamp = "2026-09-01T08:00:00.000Z";
const root = {
  id: "root",
  parentId: null,
  childrenIds: ["message-0"],
  role: "system",
  content: "",
  status: "complete",
  isEnabled: true,
  timestamp,
  updatedAt: timestamp,
} as ChatMessageNode;
const index = {
  id: "session",
  name: "角色筛选",
  createdAt: timestamp,
  updatedAt: timestamp,
} as ChatSessionIndex;
const detail = {
  id: "session",
  rootNodeId: "root",
  activeLeafId: "root",
  nodes: { root },
  updatedAt: timestamp,
  history: [],
  historyIndex: -1,
} as ChatSessionDetail;

const roles: MessageRole[] = [
  "user",
  "system",
  "assistant",
  "tool",
  "assistant",
];
const roleNodes = roles.map((role, i) => ({
  ...root,
  id: "message-" + i,
  role,
  parentId: i === 0 ? "root" : "message-" + (i - 1),
  childrenIds: i === roles.length - 1 ? [] : ["message-" + (i + 1)],
  content: "content-" + i,
}));
const roleDetail: ChatSessionDetail = {
  ...detail,
  activeLeafId: "message-4",
  history: [
    {
      actionTag: "INITIAL_STATE",
      timestamp: 0,
      context: {},
      isSnapshot: true,
      snapshot: {
        hidden: { ...root, id: "hidden", content: "history-only-content" },
      },
    },
  ],
  historyIndex: 0,
  nodes: {
    root: { ...root, childrenIds: ["message-0"] },
    ...Object.fromEntries(roleNodes.map((node) => [node.id, node])),
  },
};

describe("导出消息角色筛选", () => {
  it.each(["markdown", "json", "raw"] as const)(
    "%s 在原消息范围内筛选角色",
    async (format) => {
      const manager = useExportManager();
      const options = {
        roles: ["system", "tool"] as MessageRole[],
        range: [2, 4] as [number, number],
        includeAttachments: false,
      };
      let content: string;
      if (format === "markdown") {
        content = await manager.exportBranchAsMarkdown(
          index,
          roleDetail,
          "message-4",
          false,
          [],
          options
        );
        expect(content).toContain("工具");
      } else if (format === "json") {
        const result = await manager.exportBranchAsJson(
          index,
          roleDetail,
          "message-4",
          false,
          [],
          options
        );
        expect(
          result.messages.map((message: { role: string }) => message.role)
        ).toEqual(["system", "tool"]);
        expect(result.messageCount).toBe(2);
        content = JSON.stringify(result);
      } else {
        content = manager.exportBranchAsRaw(
          index,
          roleDetail,
          "message-4",
          options
        );
      }
      expect(content).toContain("content-1");
      expect(content).toContain("content-3");
      for (const i of [0, 2, 4]) expect(content).not.toContain("content-" + i);
    }
  );

  it.each([true, false])(
    "预设消息沿用相同角色筛选（合并：%s）",
    async (mergePresetIntoMessages) => {
      const manager = useExportManager();
      const presets = roleNodes
        .slice(0, 2)
        .map((node) => ({ ...node, content: "preset-" + node.role }));
      const options = {
        roles: ["system"] as MessageRole[],
        mergePresetIntoMessages,
        includeAttachments: false,
      };
      const json = await manager.exportBranchAsJson(
        index,
        roleDetail,
        "message-4",
        true,
        presets,
        options
      );
      const markdown = await manager.exportBranchAsMarkdown(
        index,
        roleDetail,
        "message-4",
        true,
        presets,
        options
      );
      expect(JSON.stringify(json)).toContain("preset-system");
      expect(JSON.stringify(json)).not.toContain("preset-user");
      expect(markdown).toContain("preset-system");
      expect(markdown).not.toContain("preset-user");
    }
  );

  it("管道结果筛选到空集后，保留空结果并避免回退到会话消息", async () => {
    const manager = useExportManager();
    const options = {
      roles: ["tool"] as MessageRole[],
      useContextPipeline: true,
      processedMessages: [{ role: "system", content: "pipeline-system" }],
    };
    const json = await manager.exportBranchAsJson(
      index,
      roleDetail,
      "message-4",
      false,
      [],
      options
    );
    const markdown = await manager.exportBranchAsMarkdown(
      index,
      roleDetail,
      "message-4",
      false,
      [],
      options
    );
    expect(json.messages).toEqual([]);
    expect(json.messageCount).toBe(0);
    expect(markdown).toContain("共 0 条处理后消息");
    expect(markdown).not.toContain("content-");
    expect(markdown).not.toContain("pipeline-system");
  });

  it("管道消息按角色保留原内容", async () => {
    const manager = useExportManager();
    const options = {
      roles: ["tool"] as MessageRole[],
      useContextPipeline: true,
      processedMessages: [
        { role: "system", content: "pipeline-system" },
        { role: "tool", content: "pipeline-tool" },
      ],
    };
    const json = await manager.exportBranchAsJson(
      index,
      roleDetail,
      "message-4",
      false,
      [],
      options
    );
    const markdown = await manager.exportBranchAsMarkdown(
      index,
      roleDetail,
      "message-4",
      false,
      [],
      options
    );
    expect(json.messages).toEqual([{ role: "tool", content: "pipeline-tool" }]);
    expect(markdown).toContain("pipeline-tool");
    expect(markdown).not.toContain("pipeline-system");
  });

  it("树状导出保留被筛父节点下的匹配消息，并正确标记工具角色", async () => {
    const markdown = await useExportManager().exportSessionAsMarkdownTree(
      index,
      roleDetail,
      { roles: ["tool"], includeAttachments: false }
    );
    expect(markdown).toContain("**总消息数**: 1 条");
    expect(markdown).toContain("content-3");
    expect(markdown).toContain("工具");
    for (const i of [0, 1, 2, 4])
      expect(markdown).not.toContain("content-" + i);
  });

  it("结构化会话筛选重接分支与活动节点，且保持源会话数据不变", () => {
    const source = structuredClone(roleDetail);
    const filtered = filterSessionExportRoles(roleDetail, ["assistant"]);
    expect(Object.keys(filtered.nodes)).toEqual([
      "root",
      "message-2",
      "message-4",
    ]);
    expect(filtered.nodes.root.childrenIds).toEqual(["message-2"]);
    expect(filtered.nodes["message-2"].childrenIds).toEqual(["message-4"]);
    expect(filtered.nodes["message-4"].parentId).toBe("message-2");
    expect(filterSessionExportRoles(roleDetail, ["tool"]).activeLeafId).toBe(
      "message-3"
    );
    expect(Object.keys(filterSessionExportRoles(roleDetail, []).nodes)).toEqual(
      ["root"]
    );
    expect(filtered.history).toEqual([]);
    expect(filtered.historyIndex).toBe(-1);
    expect(JSON.stringify(filtered)).not.toContain("history-only-content");
    expect(roleDetail).toEqual(source);
  });
});
