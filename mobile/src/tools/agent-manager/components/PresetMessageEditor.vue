<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  Copy,
  Download,
  Pencil,
  Plus,
  Settings2,
  Upload,
} from "lucide-vue-next";
import { useI18n } from "@/i18n";
import { customDialog, customMessage } from "@/utils/feedback";
import { usePresetTokenCalculator } from "../composables/usePresetTokenCalculator";
import type { PresetMessage, PresetMessageGroup } from "../types/agent";
import AgentPresetBatchDialog from "./AgentPresetBatchDialog.vue";
import PresetGroupEditDialog from "./PresetGroupEditDialog.vue";
import PresetMessageCard from "./PresetMessageCard.vue";
import SinglePresetMessageEditor from "./SinglePresetMessageEditor.vue";

const messages = defineModel<PresetMessage[]>("messages", {
  default: () => [],
});
const groups = defineModel<PresetMessageGroup[]>("groups", {
  default: () => [],
});
const { tRaw } = useI18n();
const t = (key: string) => tRaw(`tools.agent-manager.PresetEditor.${key}`);
const { totalTokens, isCalculating, isFallback, getTokenCount } =
  usePresetTokenCalculator(messages, groups);
const editMessage = ref<PresetMessage | null>(null);
const editorOpen = ref(false);
const groupOpen = ref(false);
const editGroup = ref<PresetMessageGroup | null>(null);
const batchOpen = ref(false);
const expandedId = ref<string | null>(null);
const activeGroup = ref<string | "all">("all");
const importFileInput = ref<HTMLInputElement | null>(null);
const page = ref(1);
const pageSize = 20;
const draggingId = ref<string | null>(null);
let dragPointerId: number | null = null;

const visibleMessages = computed(() =>
  activeGroup.value === "all"
    ? messages.value
    : messages.value.filter((message) => message.groupId === activeGroup.value)
);
const totalPages = computed(() =>
  Math.max(1, Math.ceil(visibleMessages.value.length / pageSize))
);
const pagedMessages = computed(() => {
  const start = (page.value - 1) * pageSize;
  return visibleMessages.value.slice(start, start + pageSize);
});

watch([activeGroup, () => visibleMessages.value.length], () => {
  page.value = Math.min(page.value, totalPages.value);
  if (page.value < 1) page.value = 1;
});

function messageGroup(message: PresetMessage): PresetMessageGroup | undefined {
  return groups.value.find((group) => group.id === message.groupId);
}

function openNewMessage(): void {
  editMessage.value = null;
  editorOpen.value = true;
}

function openMessage(message: PresetMessage): void {
  editMessage.value = message;
  editorOpen.value = true;
}

function cloneMessage(message: PresetMessage): void {
  editMessage.value = {
    ...structuredClone(message),
    id: crypto.randomUUID(),
    parentId: null,
    childrenIds: [],
    name: `${message.name || t("未命名预设")} ${t("副本")}`,
    timestamp: new Date().toISOString(),
  };
  editorOpen.value = true;
}

function replaceMessage(message: PresetMessage): void {
  const index = messages.value.findIndex((item) => item.id === message.id);
  if (index >= 0) messages.value.splice(index, 1, message);
  else messages.value.push(message);
  normalizeRadioGroup(
    message.groupId,
    message.isEnabled !== false ? message.id : undefined
  );
  editorOpen.value = false;
}

function toggleMessage(message: PresetMessage): void {
  const group = messageGroup(message);
  if (group?.enabled === false) return;
  const enabled = message.isEnabled === false;
  if (enabled && group?.selectionMode === "radio") {
    messages.value.forEach((item) => {
      if (item.groupId === message.groupId)
        item.isEnabled = item.id === message.id;
    });
  } else {
    message.isEnabled = enabled;
  }
}

function normalizeRadioGroup(groupId?: string, preferredId?: string): void {
  if (!groupId) return;
  const group = groups.value.find((item) => item.id === groupId);
  if (group?.selectionMode !== "radio") return;
  if (preferredId) {
    messages.value.forEach((message) => {
      if (message.groupId === groupId)
        message.isEnabled = message.id === preferredId;
    });
    return;
  }
  const enabled = messages.value.filter(
    (message) => message.groupId === groupId && message.isEnabled !== false
  );
  enabled.slice(1).forEach((message) => {
    message.isEnabled = false;
  });
}

function moveMessage(message: PresetMessage, direction: "up" | "down"): void {
  const visibleIndex = visibleMessages.value.findIndex(
    (item) => item.id === message.id
  );
  const target =
    visibleMessages.value[visibleIndex + (direction === "up" ? -1 : 1)];
  if (!target) return;
  const sourceIndex = messages.value.findIndex(
    (item) => item.id === message.id
  );
  const targetIndex = messages.value.findIndex((item) => item.id === target.id);
  [messages.value[sourceIndex], messages.value[targetIndex]] = [
    messages.value[targetIndex],
    messages.value[sourceIndex],
  ];
}

function moveMessageToGroup(message: PresetMessage, groupId?: string): void {
  message.groupId = groupId;
  normalizeRadioGroup(
    groupId,
    message.isEnabled !== false ? message.id : undefined
  );
}

function canMove(message: PresetMessage, direction: "up" | "down"): boolean {
  const index = visibleMessages.value.findIndex(
    (item) => item.id === message.id
  );
  return direction === "up"
    ? index > 0
    : index >= 0 && index < visibleMessages.value.length - 1;
}

function startDrag(message: PresetMessage, event: PointerEvent): void {
  draggingId.value = message.id;
  dragPointerId = event.pointerId;
  window.addEventListener("pointermove", handleDragMove, { passive: false });
  window.addEventListener("pointerup", stopDrag);
  window.addEventListener("pointercancel", stopDrag);
}

function handleDragMove(event: PointerEvent): void {
  if (dragPointerId !== event.pointerId || !draggingId.value) return;
  event.preventDefault();
  const targetElement = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest<HTMLElement>("[data-message-id]");
  const targetId = targetElement?.dataset.messageId;
  if (!targetId || targetId === draggingId.value) return;

  const fromVisible = visibleMessages.value.findIndex(
    (item) => item.id === draggingId.value
  );
  const toVisible = visibleMessages.value.findIndex(
    (item) => item.id === targetId
  );
  const sourceIndex = messages.value.findIndex(
    (item) => item.id === draggingId.value
  );
  if (fromVisible < 0 || toVisible < 0 || sourceIndex < 0) return;

  const [moving] = messages.value.splice(sourceIndex, 1);
  const targetIndex = messages.value.findIndex((item) => item.id === targetId);
  messages.value.splice(
    fromVisible < toVisible ? targetIndex + 1 : targetIndex,
    0,
    moving
  );
}

function stopDrag(event?: PointerEvent): void {
  if (event && dragPointerId !== event.pointerId) return;
  draggingId.value = null;
  dragPointerId = null;
  window.removeEventListener("pointermove", handleDragMove);
  window.removeEventListener("pointerup", stopDrag);
  window.removeEventListener("pointercancel", stopDrag);
}

async function removeMessage(message: PresetMessage): Promise<void> {
  const confirmed = await customDialog({
    title: t("删除预设消息"),
    message: t("删除消息确认"),
  });
  if (confirmed)
    messages.value = messages.value.filter((item) => item.id !== message.id);
}

function openNewGroup(): void {
  editGroup.value = null;
  groupOpen.value = true;
}

function openExistingGroup(group: PresetMessageGroup): void {
  editGroup.value = group;
  groupOpen.value = true;
}

function saveGroup(group: PresetMessageGroup): void {
  const index = groups.value.findIndex((item) => item.id === group.id);
  if (index >= 0) groups.value.splice(index, 1, group);
  else groups.value.push(group);
  normalizeRadioGroup(group.id);
  groupOpen.value = false;
}

function toggleGroup(group: PresetMessageGroup): void {
  group.enabled = !group.enabled;
}

async function removeGroup(group: PresetMessageGroup): Promise<void> {
  const confirmed = await customDialog({
    title: t("删除消息组"),
    message: t("删除消息组确认"),
  });
  if (!confirmed) return;
  messages.value.forEach((message) => {
    if (message.groupId === group.id) message.groupId = undefined;
  });
  groups.value = groups.value.filter((item) => item.id !== group.id);
  if (activeGroup.value === group.id) activeGroup.value = "all";
  groupOpen.value = false;
}

async function batchApply(
  ids: string[],
  action: "enable" | "disable" | "delete" | "group",
  groupId?: string
): Promise<void> {
  if (action === "delete") {
    const confirmed = await customDialog({
      title: t("批量删除"),
      message: t("批量删除确认"),
    });
    if (!confirmed) return;
    messages.value = messages.value.filter(
      (message) => !ids.includes(message.id)
    );
  } else {
    messages.value.forEach((message) => {
      if (!ids.includes(message.id)) return;
      if (action === "group") message.groupId = groupId;
      else message.isEnabled = action === "enable";
    });
    groups.value.forEach((group) => normalizeRadioGroup(group.id));
  }
  batchOpen.value = false;
  customMessage(t("批量操作完成"), "success");
}

function normalizeImportedMessage(value: unknown): PresetMessage | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  if (typeof source.content !== "string") return null;
  const role = ["system", "user", "assistant"].includes(String(source.role))
    ? (source.role as PresetMessage["role"])
    : "system";
  return {
    ...source,
    id: typeof source.id === "string" ? source.id : crypto.randomUUID(),
    parentId: typeof source.parentId === "string" ? source.parentId : null,
    childrenIds: Array.isArray(source.childrenIds) ? source.childrenIds : [],
    role,
    status:
      source.status === "generating" || source.status === "error"
        ? source.status
        : "complete",
    content: source.content,
    timestamp:
      typeof source.timestamp === "string"
        ? source.timestamp
        : new Date().toISOString(),
  } as PresetMessage;
}

function parsePresetPayload(value: unknown): {
  messages: PresetMessage[];
  groups: PresetMessageGroup[];
} {
  let rawMessages: unknown = value;
  let rawGroups: unknown = [];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const source = value as Record<string, unknown>;
    rawMessages = source.messages ?? source.presetMessages;
    rawGroups = source.groups ?? source.presetGroups ?? [];
  }
  if (!Array.isArray(rawMessages)) throw new Error("Invalid preset payload");
  const importedMessages = rawMessages
    .map(normalizeImportedMessage)
    .filter((message): message is PresetMessage => message !== null);
  if (importedMessages.length === 0 && rawMessages.length > 0)
    throw new Error("Invalid preset messages");
  const importedGroups = Array.isArray(rawGroups)
    ? rawGroups.filter((group): group is PresetMessageGroup => {
        if (!group || typeof group !== "object") return false;
        const candidate = group as Partial<PresetMessageGroup>;
        return Boolean(
          typeof candidate.id === "string" &&
          typeof candidate.name === "string" &&
          (candidate.selectionMode === "checkbox" ||
            candidate.selectionMode === "radio")
        );
      })
    : [];
  return {
    messages: importedMessages,
    groups: structuredClone(importedGroups),
  };
}

async function applyImportedPreset(value: unknown): Promise<void> {
  const imported = parsePresetPayload(value);
  if (messages.value.length > 0) {
    const confirmed = await customDialog({
      title: t("导入预设"),
      message: t("覆盖预设确认"),
      confirmButtonText: t("覆盖"),
      cancelButtonText: t("取消"),
    });
    if (!confirmed) return;
  }
  messages.value = imported.messages;
  groups.value = imported.groups;
  activeGroup.value = "all";
  page.value = 1;
  customMessage(t("导入成功"), "success");
}

async function handleFileSelected(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  try {
    await applyImportedPreset(JSON.parse(await file.text()));
  } catch {
    customMessage(t("导入失败"), "error");
  } finally {
    input.value = "";
  }
}

function exportPreset(): void {
  if (messages.value.length === 0) {
    customMessage(t("没有可导出的消息"), "warning");
    return;
  }
  const content = JSON.stringify(
    {
      version: 2,
      groups: structuredClone(groups.value),
      messages: structuredClone(messages.value),
    },
    null,
    2
  );
  const url = URL.createObjectURL(
    new Blob([content], { type: "application/json" })
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `preset-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  customMessage(t("导出成功"), "success");
}

async function copyPreset(): Promise<void> {
  try {
    await navigator.clipboard.writeText(
      JSON.stringify(
        { version: 2, groups: groups.value, messages: messages.value },
        null,
        2
      )
    );
    customMessage(t("复制成功"), "success");
  } catch {
    customMessage(t("复制失败"), "error");
  }
}

async function pastePreset(): Promise<void> {
  try {
    const content = await navigator.clipboard.readText();
    if (!content.trim()) {
      customMessage(t("剪贴板为空"), "warning");
      return;
    }
    await applyImportedPreset(JSON.parse(content));
  } catch {
    customMessage(t("粘贴失败"), "error");
  }
}

onBeforeUnmount(stopDrag);
</script>

<template>
  <section class="preset-editor">
    <header class="editor-header">
      <div>
        <h2>{{ t("预设消息") }}</h2>
        <p>
          {{ t("已启用") }} {{ totalTokens }} tokens ·
          {{
            isCalculating
              ? t("计算中")
              : isFallback
                ? t("字符估算")
                : t("o200k 预估")
          }}
        </p>
      </div>
      <button class="primary" type="button" @click="openNewMessage">
        <Plus :size="19" />{{ t("新增") }}
      </button>
    </header>

    <div class="utility-bar">
      <button type="button" :title="t('新建消息组')" @click="openNewGroup">
        <Boxes :size="18" />{{ t("消息组") }}
      </button>
      <button type="button" :title="t('批量管理')" @click="batchOpen = true">
        <Settings2 :size="18" />{{ t("批量") }}
      </button>
      <button
        type="button"
        :title="t('导入')"
        @click="importFileInput?.click()"
      >
        <Upload :size="18" />{{ t("导入") }}
      </button>
      <button type="button" :title="t('导出')" @click="exportPreset">
        <Download :size="18" />{{ t("导出") }}
      </button>
      <button type="button" :title="t('复制')" @click="copyPreset">
        <Copy :size="18" />{{ t("复制") }}
      </button>
      <button type="button" :title="t('粘贴')" @click="pastePreset">
        <ClipboardPaste :size="18" />{{ t("粘贴") }}
      </button>
      <input
        ref="importFileInput"
        class="file-input"
        type="file"
        accept="application/json,.json"
        @change="handleFileSelected"
      />
    </div>

    <div class="group-strip">
      <button
        class="all-group"
        :class="{ active: activeGroup === 'all' }"
        @click="activeGroup = 'all'"
      >
        {{ t("全部") }}
      </button>
      <div
        v-for="group in groups"
        :key="group.id"
        class="group-control"
        :class="{ disabled: !group.enabled }"
      >
        <button
          class="group-filter"
          :class="{ active: activeGroup === group.id }"
          @click="activeGroup = group.id"
        >
          {{ group.selectionMode === "radio" ? "◉" : "☐" }} {{ group.name }}
        </button>
        <label class="mini-switch" :title="t('组整体开关')">
          <input
            :checked="group.enabled"
            type="checkbox"
            @change="toggleGroup(group)"
          />
          <i />
        </label>
        <button
          class="group-edit"
          type="button"
          :title="t('编辑消息组')"
          @click="openExistingGroup(group)"
        >
          <Pencil :size="14" />
        </button>
      </div>
      <button class="group-add" type="button" @click="openNewGroup">
        <Plus :size="15" />{{ t("组") }}
      </button>
    </div>

    <div class="message-list">
      <p v-if="visibleMessages.length === 0" class="empty">{{ t("空状态") }}</p>
      <PresetMessageCard
        v-for="message in pagedMessages"
        :key="message.id"
        :message="message"
        :group="messageGroup(message)"
        :groups="groups"
        :token-count="getTokenCount(message.id)"
        :tokenizer-label="isFallback ? t('字符估算') : t('o200k 预估')"
        :expanded="expandedId === message.id"
        :can-move-up="canMove(message, 'up')"
        :can-move-down="canMove(message, 'down')"
        :dragging="draggingId === message.id"
        @edit="openMessage(message)"
        @toggle="toggleMessage(message)"
        @move="moveMessage(message, $event)"
        @move-group="moveMessageToGroup(message, $event)"
        @clone="cloneMessage(message)"
        @remove="removeMessage(message)"
        @drag-start="startDrag(message, $event)"
        @update:expanded="expandedId = $event ? message.id : null"
      />
    </div>

    <nav v-if="totalPages > 1" class="pagination" :aria-label="t('分页')">
      <button
        type="button"
        :disabled="page === 1"
        :aria-label="t('上一页')"
        @click="page--"
      >
        <ChevronLeft :size="18" />
      </button>
      <span>{{ page }} / {{ totalPages }}</span>
      <button
        type="button"
        :disabled="page === totalPages"
        :aria-label="t('下一页')"
        @click="page++"
      >
        <ChevronRight :size="18" />
      </button>
    </nav>

    <SinglePresetMessageEditor
      :open="editorOpen"
      :message="editMessage"
      :groups="groups"
      @close="editorOpen = false"
      @save="replaceMessage"
    />
    <PresetGroupEditDialog
      :open="groupOpen"
      :group="editGroup"
      @close="groupOpen = false"
      @save="saveGroup"
      @remove="removeGroup"
    />
    <AgentPresetBatchDialog
      :open="batchOpen"
      :messages="messages"
      :groups="groups"
      @close="batchOpen = false"
      @apply="batchApply"
    />
  </section>
</template>

<style scoped>
.preset-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.editor-header h2 {
  margin: 0;
  font-size: 1.05rem;
}
.editor-header p {
  margin: 3px 0 0;
  color: var(--color-on-surface-variant);
  font-size: 0.72rem;
}
.editor-header .primary {
  padding: 9px 12px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 7px;
  color: white;
  background: var(--color-primary);
}
.utility-bar {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
}
.utility-bar button {
  padding: 8px 9px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  border: 0;
  border-radius: 7px;
  color: var(--text-color);
  background: var(--input-bg);
  font-size: 0.75rem;
}
.file-input {
  display: none;
}
.group-strip {
  display: flex;
  gap: 7px;
  overflow-x: auto;
  padding-bottom: 3px;
}
.all-group,
.group-add,
.group-control {
  flex: 0 0 auto;
}
.all-group,
.group-add,
.group-filter,
.group-edit {
  border: 0;
  color: var(--text-color);
  background: transparent;
}
.all-group,
.group-add {
  padding: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  border-radius: 7px;
  background: var(--input-bg);
  font-size: 0.76rem;
  white-space: nowrap;
}
.all-group.active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 16%, transparent);
}
.group-control {
  padding: 3px 4px 3px 8px;
  display: flex;
  align-items: center;
  gap: 4px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 7px;
  background: var(--input-bg);
}
.group-control.disabled {
  opacity: 0.58;
}
.group-filter {
  max-width: 150px;
  overflow: hidden;
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-filter.active {
  color: var(--color-primary);
}
.group-edit {
  padding: 5px;
  display: inline-flex;
}
.group-add {
  border: var(--border-width) dashed var(--border-color);
  background: transparent;
}
.mini-switch input {
  display: none;
}
.mini-switch i {
  position: relative;
  width: 25px;
  height: 14px;
  display: block;
  border-radius: 99px;
  background: var(--border-color);
}
.mini-switch i::after {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #fff;
  content: "";
  transition: 0.16s;
}
.mini-switch input:checked + i {
  background: var(--color-primary);
}
.mini-switch input:checked + i::after {
  transform: translateX(11px);
}
.message-list {
  display: flex;
  flex-direction: column;
  gap: 9px;
}
.empty {
  margin: 0;
  padding: 18px 12px;
  border: var(--border-width) dashed var(--border-color);
  border-radius: 8px;
  color: var(--color-on-surface-variant);
  font-size: 0.82rem;
  line-height: 1.55;
}
.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
}
.pagination button {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  color: var(--text-color);
  background: var(--input-bg);
}
.pagination button:disabled {
  opacity: 0.4;
}
.pagination span {
  color: var(--color-on-surface-variant);
  font-size: 0.78rem;
}
</style>
