<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useI18n } from "@/i18n";
import type { PresetMessage, PresetMessageGroup } from "../types/agent";

const props = defineProps<{
  open: boolean;
  messages: PresetMessage[];
  groups: PresetMessageGroup[];
}>();
const emit = defineEmits<{
  close: [];
  apply: [
    ids: string[],
    action: "enable" | "disable" | "delete" | "group",
    groupId?: string,
  ];
}>();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.agent-manager.PresetEditor.${key}`);
const selected = ref<string[]>([]);
const groupId = ref<string | undefined>();
const allSelected = computed(
  () =>
    props.messages.length > 0 && selected.value.length === props.messages.length
);

watch(
  () => props.open,
  (open) => {
    if (open) {
      selected.value = [];
      groupId.value = undefined;
    }
  }
);

function toggleAll(): void {
  selected.value = allSelected.value
    ? []
    : props.messages.map((message) => message.id);
}

function apply(action: "enable" | "disable" | "delete" | "group"): void {
  if (selected.value.length)
    emit("apply", selected.value, action, groupId.value);
}
</script>

<template>
  <div v-if="open" class="overlay">
    <section class="dialog" role="dialog" aria-modal="true">
      <header>
        <div>
          <h2>{{ t("批量管理预设消息") }}</h2>
          <small>{{ t("已选择") }} {{ selected.length }}</small>
        </div>
        <button type="button" @click="emit('close')">{{ t("完成") }}</button>
      </header>
      <div class="actions">
        <button type="button" @click="toggleAll">
          {{ allSelected ? t("取消全选") : t("全选") }}
        </button>
        <button type="button" @click="apply('enable')">{{ t("启用") }}</button>
        <button type="button" @click="apply('disable')">{{ t("禁用") }}</button>
        <select v-model="groupId">
          <option :value="undefined">{{ t("移动到未分组") }}</option>
          <option v-for="group in groups" :key="group.id" :value="group.id">
            {{ t("移动到") }}{{ group.name }}
          </option>
        </select>
        <button type="button" @click="apply('group')">{{ t("移动") }}</button>
        <button class="danger" type="button" @click="apply('delete')">
          {{ t("删除") }}
        </button>
      </div>
      <label v-for="message in messages" :key="message.id" class="message">
        <input v-model="selected" :value="message.id" type="checkbox" />
        <span>
          <strong>{{ message.name || t("未命名预设") }}</strong>
          <small>{{ message.content }}</small>
        </span>
      </label>
    </section>
  </div>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 104;
  padding: 16px;
  background: #0007;
}
.dialog {
  height: calc(100% - 32px);
  display: flex;
  flex-direction: column;
  overflow: auto;
  border-radius: 8px;
  color: var(--text-color);
  background: var(--card-bg);
}
.dialog header {
  padding: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: var(--border-width) solid var(--border-color);
}
h2 {
  margin: 0;
  font-size: 1.05rem;
}
header small {
  color: var(--color-on-surface-variant);
}
button,
select {
  padding: 8px;
  border: 0;
  border-radius: 7px;
  color: var(--text-color);
  background: var(--input-bg);
}
.actions {
  padding: 12px;
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  border-bottom: var(--border-width) solid var(--border-color);
}
.danger {
  color: var(--color-danger, #d14343);
}
.message {
  padding: 13px 16px;
  display: flex;
  gap: 10px;
  border-bottom: var(--border-width) solid var(--border-color);
}
.message span {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.message small {
  overflow: hidden;
  color: var(--color-on-surface-variant);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
