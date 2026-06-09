import type { ChatMessageNode } from "../../../types";
import type { PresetMessageGroup } from "../../../types/agent";

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
