import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../types/agent";

/** Keep the current choice, or select an explicitly enabled incoming message. */
export function reconcilePresetGroupSelection(
  messages: ChatMessageNode[],
  groups: PresetMessageGroup[] = [],
  preferredMessageId?: string
): void {
  for (const group of groups) {
    const members = messages.filter((message) => message.groupId === group.id);
    if (group.enabled === false) {
      for (const message of members) {
        if (message.isEnabled !== false) {
          message.metadata = { ...message.metadata, lastEnabledState: true };
          message.isEnabled = false;
        }
      }
    }
    if (group.selectionMode !== "radio") continue;
    const candidates = members.filter((message) =>
      group.enabled === false
        ? message.metadata?.lastEnabledState === true
        : message.isEnabled !== false
    );
    const selected =
      candidates.find((message) => message.id === preferredMessageId) ??
      candidates[0];
    for (const message of members) {
      if (group.enabled === false) {
        if (message !== selected && message.metadata)
          delete message.metadata.lastEnabledState;
      } else {
        message.isEnabled = message === selected;
        if (message.metadata) delete message.metadata.lastEnabledState;
      }
    }
  }
}
