// Copyright 2025-2026 miaotouy(Github@miaotouy)
import {
  computed,
  inject,
  onBeforeUnmount,
  provide,
  reactive,
  watch,
  type InjectionKey,
  type Ref,
} from "vue";
import type { ChatMessageNode } from "../../types";
import { projectMessagePresentation } from "../../utils/messagePresentation";

const characterCountsKey: InjectionKey<Map<string, number>> = Symbol(
  "message-character-counts"
);
export function useMessagePresentation(
  messages: Ref<ChatMessageNode[]>,
  compact: Ref<boolean>
) {
  const characterCounts = reactive(new Map<string, number>());
  provide(characterCountsKey, characterCounts);
  const presentation = computed(() =>
    projectMessagePresentation(messages.value, compact.value)
  );
  const rowLayoutKeys = computed(() => {
    const keys = new Map<string, string>();
    for (const [id, row] of presentation.value.rows) {
      const group = presentation.value.groupById.get(row.groupId)!;
      keys.set(
        id,
        row.layoutKey +
          (compact.value && row.grouped && row.last
            ? JSON.stringify(
                group.members.map((member) => characterCounts.get(member.id))
              )
            : "")
      );
    }
    return keys;
  });
  return { presentation, characterCounts, rowLayoutKeys };
}
/** Publish the existing attachment-aware count, without resolving attachments again at the tail. */
export function reportMessageCharacterCount(
  messageId: () => string,
  count: Ref<number>
) {
  const counts = inject(characterCountsKey, undefined);
  watch(
    [messageId, count],
    ([id, value], old) => {
      if (old?.[0] && old[0] !== id) counts?.delete(old[0]);
      counts?.set(id, value);
    },
    { immediate: true }
  );
  onBeforeUnmount(() => counts?.delete(messageId()));
}
