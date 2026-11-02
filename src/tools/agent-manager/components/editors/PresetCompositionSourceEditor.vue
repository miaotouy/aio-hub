<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useAgentStore } from "../../stores/agentStore";
import type { ChatMessageNode } from "@/tools/llm-chat/types";
import PresetMessageEditor from "./PresetMessageEditor.vue";
const props = defineProps<{
  agentId: string;
  messageId: string;
  visible: boolean;
}>();
const emit = defineEmits<{ "update:visible": [value: boolean] }>();
const store = useAgentStore();
const agent = computed(() => store.getAgentById(props.agentId));
const original = ref<ChatMessageNode>();
watch(
  () => [props.visible, props.messageId] as const,
  ([visible]) => {
    if (!visible) return;
    const message = agent.value?.presetMessages?.find(
      (item) => item.id === props.messageId
    );
    original.value = message ? JSON.parse(JSON.stringify(message)) : undefined;
  },
  { immediate: true }
);
async function save(
  form: Partial<ChatMessageNode> & {
    role: ChatMessageNode["role"];
    content: string;
  }
) {
  if (!original.value) throw new Error("原消息已被删除");
  const next = { ...original.value, ...form };
  await store.savePresetMessage(props.agentId, next, original.value);
  original.value = JSON.parse(JSON.stringify(next));
}
</script>
<template>
  <PresetMessageEditor
    v-if="original"
    :visible="visible"
    :is-edit-mode="true"
    :initial-form="original"
    :agent="agent"
    :agent-name="agent?.name"
    :preset-groups="agent?.presetGroups"
    :save-message="save"
    @update:visible="emit('update:visible', $event)"
  />
</template>
