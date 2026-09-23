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
} from "../../../types";
import { useExportManager } from "../useExportManager";

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
  childrenIds: ["delegation"],
  role: "system",
  content: "",
  status: "complete",
  isEnabled: true,
  timestamp,
  updatedAt: timestamp,
} as ChatMessageNode;
const delegation = {
  id: "delegation",
  parentId: "root",
  childrenIds: ["intervention"],
  role: "user",
  content: "调查问题",
  status: "complete",
  isEnabled: true,
  timestamp,
  updatedAt: timestamp,
  metadata: {
    origin: {
      kind: "agent",
      channel: "sub_agent",
      actorId: "agent-parent",
      actorDisplayName: "调度者",
    },
  },
} as ChatMessageNode;
const intervention = {
  id: "intervention",
  parentId: "delegation",
  childrenIds: [],
  role: "user",
  content: "补充线索",
  status: "complete",
  isEnabled: true,
  timestamp,
  updatedAt: timestamp,
  metadata: {
    origin: {
      kind: "user",
      channel: "user_intervention",
      actorDisplayName: "主人",
    },
    userProfileName: "owner",
    userProfileDisplayName: "主人",
  },
} as ChatMessageNode;
const index = {
  id: "session",
  name: "子会话",
  createdAt: timestamp,
  updatedAt: timestamp,
} as ChatSessionIndex;
const detail = {
  id: "session",
  rootNodeId: "root",
  activeLeafId: "intervention",
  nodes: { root, delegation, intervention },
  updatedAt: timestamp,
  history: [],
  historyIndex: -1,
} as ChatSessionDetail;

describe("阅读型会话导出的消息来源", () => {
  it("保留委派 Agent 与用户介入的身份，不把两条 user role 混为同一发送者", async () => {
    const { exportSessionAsMarkdown, exportSessionAsMarkdownTree } =
      useExportManager();
    const active = await exportSessionAsMarkdown(index, detail, [
      root,
      delegation,
      intervention,
    ]);
    const tree = await exportSessionAsMarkdownTree(index, detail, {
      includeAttachments: false,
    });

    expect(active).toContain("## 调度者");
    expect(active).toContain("## 主人");
    expect(tree).toContain("**调度者**");
    expect(tree).toContain("**主人**");
  });
});
