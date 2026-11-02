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

import type { ChatMessageNode, ChatSessionDetail, MessageRole } from "../types";

export const EXPORT_MESSAGE_ROLES: MessageRole[] = [
  "user",
  "assistant",
  "system",
  "tool",
];

export function filterExportMessages<T extends { role: string }>(
  messages: T[],
  roles?: readonly MessageRole[]
): T[] {
  return roles
    ? messages.filter((message) => roles.some((role) => role === message.role))
    : messages;
}

/** 保留结构根节点，并将筛掉角色的子节点接到最近保留的祖先，维持分支可遍历。 */
export function filterSessionExportRoles(
  detail: ChatSessionDetail,
  roles?: readonly MessageRole[],
  nodeIds?: ReadonlySet<string>
): ChatSessionDetail {
  if (
    !nodeIds &&
    (!roles || EXPORT_MESSAGE_ROLES.every((role) => roles.includes(role)))
  )
    return detail;

  const nodes: Record<string, ChatMessageNode> = {};
  for (const node of Object.values(detail.nodes)) {
    if (
      node.id === detail.rootNodeId ||
      ((!roles || roles.includes(node.role)) &&
        (!nodeIds || nodeIds.has(node.id)))
    ) {
      nodes[node.id] = { ...node, childrenIds: [] };
    }
  }

  const nearestRetained = (id: string | null): string | null => {
    const visited = new Set<string>();
    while (id && !nodes[id]) {
      if (visited.has(id)) return null;
      visited.add(id);
      id = detail.nodes[id]?.parentId ?? null;
    }
    return id;
  };

  // 按原树的顺序重接，保持同层分支顺序。
  const visit = (id: string) => {
    const original = detail.nodes[id];
    if (!original) return;
    const node = nodes[id];
    if (node) {
      node.parentId = nearestRetained(original.parentId);
      if (node.parentId) nodes[node.parentId].childrenIds.push(id);
    }
    original.childrenIds.forEach(visit);
  };
  visit(detail.rootNodeId);

  return {
    ...detail,
    nodes,
    // 原撤销链包含完整节点快照，裁剪后清空以保持导出的角色与范围。
    history: [],
    historyIndex: -1,
    activeLeafId: nearestRetained(detail.activeLeafId) ?? detail.rootNodeId,
  };
}
