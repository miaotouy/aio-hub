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

import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../../types/agent";

export interface PresetGroupMessageStats {
  total: number;
  enabled: number;
}

export function getPresetGroupMessageStats(
  groupId: string,
  messages: ChatMessageNode[]
): PresetGroupMessageStats {
  const groupMessages = messages.filter((msg) => msg.groupId === groupId);

  return {
    total: groupMessages.length,
    enabled: groupMessages.filter((msg) => msg.isEnabled !== false).length,
  };
}

export function applyPresetGroupEnabledState(
  group: PresetMessageGroup,
  messages: ChatMessageNode[]
) {
  const isGroupEnabled = group.enabled !== false;

  messages.forEach((msg) => {
    if (msg.groupId !== group.id) return;

    if (!isGroupEnabled) {
      if (msg.isEnabled !== false) {
        msg.isEnabled = false;
        msg.metadata = {
          ...(msg.metadata ?? {}),
          lastEnabledState: true,
        };
      }
      return;
    }

    if (msg.metadata?.lastEnabledState === true) {
      msg.isEnabled = true;
      delete msg.metadata.lastEnabledState;
    }
  });
}

export function cleanupPresetMessageGroupRefs(
  messages: ChatMessageNode[],
  groups: PresetMessageGroup[]
): boolean {
  const groupIds = new Set(groups.map((group) => group.id));
  let changed = false;

  messages.forEach((msg) => {
    const hasGhostGroup = !!msg.groupId && !groupIds.has(msg.groupId);
    if (hasGhostGroup) {
      msg.groupId = undefined;
      changed = true;
    }

    if ((!msg.groupId || hasGhostGroup) && msg.metadata?.lastEnabledState) {
      delete msg.metadata.lastEnabledState;
      changed = true;
    }
  });

  return changed;
}

export function resolvePresetMessageGroupId(
  groupId: string | undefined,
  groups: PresetMessageGroup[]
): string | undefined {
  if (!groupId) return undefined;
  return groups.some((group) => group.id === groupId) ? groupId : undefined;
}
