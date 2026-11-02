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

import { createConfigManager } from "@/utils/configManager";
import type {
  ChatSessionDraft,
  ChatSessionDetail,
  ChatSessionIndex,
} from "../../types/session";

/** 新会话的身份与配置；输入草稿沿用 sessionId 关联的输入存储。 */
interface NewSessionDraftRecord {
  index: ChatSessionIndex;
  rootNodeId: string;
  parameterOverrides?: ChatSessionDetail["parameterOverrides"];
}

interface NewSessionDraftConfig {
  version: string;
  draft: NewSessionDraftRecord | null;
}

const config = createConfigManager<NewSessionDraftConfig>({
  moduleName: "llm-chat",
  fileName: "new-session-draft.json",
  version: "1.0.0",
  createDefault: () => ({ version: "1.0.0", draft: null }),
});

// 在入队时冻结快照。清除排在已发起的保存之后，避免提升后草稿记录复活。
let pendingWrite: Promise<void> = Promise.resolve();

export function saveNewSessionDraft(
  draft: ChatSessionDraft | null
): Promise<void> {
  const snapshot: NewSessionDraftConfig = JSON.parse(
    JSON.stringify({
      version: "1.0.0",
      draft: draft
        ? {
            index: draft.index,
            rootNodeId: draft.detail.rootNodeId,
            parameterOverrides: draft.detail.parameterOverrides,
          }
        : null,
    })
  );
  const write = pendingWrite.then(() => config.save(snapshot));
  pendingWrite = write.catch(() => {});
  return write;
}

export async function loadNewSessionDraft(): Promise<ChatSessionDraft | null> {
  await pendingWrite;
  const { draft } = await config.load();
  if (
    !draft?.index?.id ||
    typeof draft.index.id !== "string" ||
    !draft.rootNodeId ||
    typeof draft.rootNodeId !== "string"
  )
    return null;

  const index = { ...draft.index, messageCount: 0 };
  const rootNodeId = draft.rootNodeId;
  return {
    index,
    detail: {
      id: index.id,
      updatedAt: index.updatedAt,
      rootNodeId,
      activeLeafId: rootNodeId,
      nodes: {
        [rootNodeId]: {
          id: rootNodeId,
          parentId: null,
          childrenIds: [],
          content: "",
          role: "system",
          status: "complete",
          isEnabled: true,
          timestamp: index.createdAt,
        },
      },
      parameterOverrides: draft.parameterOverrides,
      history: [],
      historyIndex: 0,
    },
  };
}
