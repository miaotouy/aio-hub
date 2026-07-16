<script setup lang="ts">
import { computed } from "vue";
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-vue-next";
import { useI18n } from "@/i18n";
import type { PresetMessage, PresetMessageGroup } from "../types/agent";

const props = defineProps<{
  message: PresetMessage;
  group?: PresetMessageGroup;
  groups: PresetMessageGroup[];
  tokenCount: number;
  tokenizerLabel: string;
  expanded?: boolean;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  dragging?: boolean;
}>();
const emit = defineEmits<{
  edit: [];
  toggle: [];
  move: ["up" | "down"];
  clone: [];
  remove: [];
  moveGroup: [groupId?: string];
  dragStart: [event: PointerEvent];
  "update:expanded": [value: boolean];
}>();
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.agent-manager.PresetEditor.${key}`);
const roleLabel = computed(
  () =>
    ({ system: "System", user: "User", assistant: "Assistant" })[
      props.message.role
    ]
);
const preview = computed(
  () => props.message.content.replace(/\s+/g, " ").trim() || t("空消息")
);
const disabled = computed(
  () => props.message.isEnabled === false || props.group?.enabled === false
);

function moveGroup(event: Event): void {
  const groupId = (event.target as HTMLSelectElement).value;
  emit("moveGroup", groupId || undefined);
}
</script>

<template>
  <article
    class="message-card"
    :class="[{ disabled, expanded, dragging }, `role-${message.role}`]"
    :data-message-id="message.id"
  >
    <button
      class="drag-handle"
      type="button"
      :aria-label="t('拖拽排序')"
      @pointerdown.prevent="emit('dragStart', $event)"
      @contextmenu.prevent
    >
      <GripVertical :size="18" />
    </button>
    <button
      class="card-main"
      type="button"
      @click="emit('update:expanded', !expanded)"
    >
      <div class="card-heading">
        <span class="role-pill">{{ roleLabel }}</span>
        <strong>{{ message.name || t("未命名预设") }}</strong>
        <span v-if="group" class="group-pill">{{ group.name }}</span>
      </div>
      <p :class="{ unclamped: expanded }">{{ preview }}</p>
      <small>
        ~{{ tokenCount }} tokens · {{ tokenizerLabel }}
        <span v-if="message.injectionStrategy"> · {{ t("注入策略") }}</span>
        <span v-if="message.modelMatch?.enabled"> · {{ t("模型限定") }}</span>
      </small>
    </button>
    <div class="card-actions">
      <label class="switch" @click.stop>
        <input
          :checked="message.isEnabled !== false"
          :disabled="group?.enabled === false"
          type="checkbox"
          @change="emit('toggle')"
        />
        <i />
      </label>
      <details @click.stop>
        <summary :aria-label="t('更多操作')">
          <MoreHorizontal :size="19" />
        </summary>
        <div class="menu">
          <button type="button" @click="emit('edit')">
            <Pencil :size="16" />{{ t("编辑") }}
          </button>
          <button type="button" @click="emit('clone')">
            {{ t("复制一份") }}
          </button>
          <label class="group-move">
            {{ t("移动到") }}
            <select :value="message.groupId || ''" @change="moveGroup">
              <option value="">{{ t("不分组") }}</option>
              <option v-for="item in groups" :key="item.id" :value="item.id">
                {{ item.name }}
              </option>
            </select>
          </label>
          <button
            type="button"
            :disabled="!canMoveUp"
            @click="emit('move', 'up')"
          >
            {{ t("上移") }}
          </button>
          <button
            type="button"
            :disabled="!canMoveDown"
            @click="emit('move', 'down')"
          >
            {{ t("下移") }}
          </button>
          <button class="danger" type="button" @click="emit('remove')">
            <Trash2 :size="16" />{{ t("删除") }}
          </button>
        </div>
      </details>
      <ChevronDown
        class="expand-icon"
        :size="17"
        :class="{ rotate: expanded }"
      />
    </div>
  </article>
</template>

<style scoped>
.message-card {
  padding: 12px 10px;
  display: grid;
  grid-template-columns: 26px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: var(--border-width) solid var(--border-color);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--app-radius-md, 8px);
  background: var(--card-bg);
  transition:
    opacity 0.16s,
    transform 0.16s;
}
.message-card.role-user {
  border-left-color: #4c8bf5;
}
.message-card.role-assistant {
  border-left-color: #26a269;
}
.message-card.disabled {
  opacity: 0.5;
}
.message-card.dragging {
  z-index: 2;
  opacity: 0.72;
  transform: scale(0.99);
}
.drag-handle,
.card-main,
summary,
.menu button {
  border: 0;
  color: inherit;
  background: transparent;
}
.drag-handle {
  padding: 4px;
  color: var(--color-on-surface-variant);
  touch-action: none;
}
.card-main {
  min-width: 0;
  padding: 0;
  text-align: left;
}
.card-heading {
  min-width: 0;
  display: flex;
  gap: 6px;
  align-items: center;
}
.card-heading strong {
  overflow: hidden;
  font-size: 0.92rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.role-pill,
.group-pill {
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 14%, transparent);
  font-size: 0.68rem;
  white-space: nowrap;
}
.group-pill {
  color: var(--color-on-surface-variant);
  background: var(--input-bg);
}
p {
  margin: 6px 0 3px;
  display: -webkit-box;
  overflow: hidden;
  color: var(--color-on-surface-variant);
  font-size: 0.8rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 1;
}
.unclamped {
  display: block;
}
small {
  color: var(--color-on-surface-variant);
  font-size: 0.68rem;
}
.card-actions {
  display: flex;
  gap: 4px;
  align-items: center;
}
.switch input {
  display: none;
}
.switch i {
  position: relative;
  width: 32px;
  height: 18px;
  display: block;
  border-radius: 99px;
  background: var(--border-color);
}
.switch i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  content: "";
  transition: 0.18s;
}
.switch input:checked + i {
  background: var(--color-primary);
}
.switch input:checked + i::after {
  transform: translateX(14px);
}
.switch input:disabled + i {
  opacity: 0.55;
}
details {
  position: relative;
}
summary {
  padding: 5px;
  display: flex;
  list-style: none;
}
summary::-webkit-details-marker {
  display: none;
}
.menu {
  position: absolute;
  top: 30px;
  right: 0;
  z-index: 5;
  min-width: 116px;
  padding: 5px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  box-shadow: 0 8px 24px #0002;
}
.menu button {
  width: 100%;
  padding: 8px;
  display: flex;
  gap: 7px;
  text-align: left;
  font-size: 0.78rem;
}
.group-move {
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  color: var(--color-on-surface-variant);
  font-size: 0.7rem;
}
.group-move select {
  max-width: 150px;
  padding: 6px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  color: var(--text-color);
  background: var(--input-bg);
  font: inherit;
}
.menu button:disabled {
  opacity: 0.4;
}
.menu .danger {
  color: var(--color-danger, #d14343);
}
.expand-icon {
  color: var(--color-on-surface-variant);
  transition: 0.18s;
}
.rotate {
  transform: rotate(180deg);
}
</style>
