import { describe, expect, it } from "vitest";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import type { PresetMessageGroup } from "../../types/agent";
import { normalizePresetGroupState } from "@aiohub/agent-preset-core";
import { reconcilePresetGroupSelection } from "../presetGroupSelection";
import { applyPresetGroupEnabledState } from "../../components/assets/presetGroupState";

const group: PresetMessageGroup = {
  id: "group",
  name: "Choice",
  selectionMode: "radio",
  enabled: true,
};
const message = (id: string, enabled = true): ChatMessageNode => ({
  id,
  groupId: group.id,
  role: "system",
  content: id,
  parentId: null,
  childrenIds: [],
  status: "complete",
  isEnabled: enabled,
});
const selected = (messages: ChatMessageNode[]) =>
  messages
    .filter((entry) => entry.isEnabled !== false)
    .map((entry) => entry.id);

describe("preset group editing selection", () => {
  it("retains the original enabled member when its duplicate is inserted below it", () => {
    const original = message("original");
    const messages = [original, { ...original, id: "duplicate" }];
    reconcilePresetGroupSelection(messages, [group]);
    expect(selected(messages)).toEqual(["original"]);
    expect(() => normalizePresetGroupState(messages, [group])).not.toThrow();
  });

  it("selects an enabled incoming member and leaves a disabled incoming member disabled", () => {
    const messages = [message("original"), message("incoming")];
    reconcilePresetGroupSelection(messages, [group], "incoming");
    expect(selected(messages)).toEqual(["incoming"]);
    messages.push(message("disabled", false));
    reconcilePresetGroupSelection(messages, [group], "disabled");
    expect(selected(messages)).toEqual(["incoming"]);
  });

  it("retains the first enabled member when a checkbox group changes to radio", () => {
    const messages = [
      message("disabled", false),
      message("first"),
      message("second"),
    ];
    reconcilePresetGroupSelection(messages, [
      { ...group, selectionMode: "checkbox" },
    ]);
    expect(selected(messages)).toEqual(["first", "second"]);
    reconcilePresetGroupSelection(messages, [group]);
    expect(selected(messages)).toEqual(["first"]);
  });

  it("restores only the remembered selection after copying or moving into a disabled radio group", () => {
    const disabled = { ...group, enabled: false };
    const messages = [message("original")];
    applyPresetGroupEnabledState(disabled, messages);
    messages.push({
      ...messages[0],
      id: "duplicate",
      metadata: { ...messages[0].metadata },
    });
    messages.push(message("incoming"));
    reconcilePresetGroupSelection(messages, [disabled]);
    expect(selected(messages)).toEqual([]);
    applyPresetGroupEnabledState(group, messages);
    expect(selected(messages)).toEqual(["original"]);
    expect(
      messages.every((entry) => entry.metadata?.lastEnabledState !== true)
    ).toBe(true);
  });
});
