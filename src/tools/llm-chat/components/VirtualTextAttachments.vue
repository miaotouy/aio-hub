<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from "vue";
import { ElButton, ElInput, ElMessageBox } from "element-plus";
import {
  FileText,
  X,
  Plus,
  Copy,
  Download,
  Pencil,
  CornerDownLeft,
} from "lucide-vue-next";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import BaseDialog from "@/components/common/BaseDialog.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import type { VirtualTextAttachment } from "../types/virtual-attachment";
import {
  createVirtualTextAttachment,
  normalizeVirtualAttachments,
  textCharacterCount,
} from "../utils/virtualAttachments";

const props = withDefaults(
  defineProps<{
    attachments: VirtualTextAttachment[];
    draft?: boolean;
    editable?: boolean;
    busy?: boolean;
    allowBranch?: boolean;
    hasReplies?: boolean;
    commit: (
      original: VirtualTextAttachment | null,
      updated: VirtualTextAttachment,
      branch: boolean
    ) => Promise<void>;
  }>(),
  { editable: true }
);
const emit = defineEmits<{
  remove: [attachment: VirtualTextAttachment];
  insert: [attachment: VirtualTextAttachment];
  "editing-change": [editing: boolean];
}>();
const errorHandler = createModuleErrorHandler("llm-chat/text-attachments");
const visible = ref(false);
const editing = ref(false);
const saving = ref(false);
const original = ref<VirtualTextAttachment | null>(null);
const working = ref<VirtualTextAttachment>(createVirtualTextAttachment(""));
const baseline = ref("");
const error = ref("");
const count = computed(() => textCharacterCount(working.value.text));
const dirty = computed(() => JSON.stringify(working.value) !== baseline.value);
const canSave = computed(
  () =>
    !!working.value.text.trim() &&
    !!working.value.title.trim() &&
    !props.busy &&
    !saving.value
);
const summaries = computed(() =>
  props.attachments.map((item) => ({
    attachment: item,
    count: textCharacterCount(item.text).toLocaleString(),
    preview: item.text.slice(0, 220).replace(/\s+/g, " ").trim(),
  }))
);

function open(attachment?: VirtualTextAttachment) {
  original.value = attachment ? { ...attachment } : null;
  working.value = attachment
    ? { ...attachment }
    : createVirtualTextAttachment("", props.attachments);
  baseline.value = JSON.stringify(working.value);
  error.value = "";
  editing.value = props.draft || !attachment;
  visible.value = true;
  emit("editing-change", true);
}
function closed() {
  visible.value = false;
  emit("editing-change", false);
}
async function beforeClose() {
  if (saving.value) return false;
  if (dirty.value) {
    try {
      await ElMessageBox.confirm("放弃这次修改？", "未保存的修改", {
        confirmButtonText: "放弃修改",
        cancelButtonText: "继续编辑",
        lockScroll: false,
      });
    } catch {
      return false;
    }
  }
  return true;
}
async function close() {
  if (await beforeClose()) closed();
}
async function commit(branch = false) {
  if (!canSave.value) return;
  saving.value = true;
  error.value = "";
  try {
    const updated = normalizeVirtualAttachments([
      { ...working.value, title: working.value.title.trim() },
    ])[0];
    await props.commit(original.value, updated, branch);
    closed();
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "保存失败，请重试或复制内容";
    errorHandler.handle(cause, { userMessage: error.value, showToUser: false });
  } finally {
    saving.value = false;
  }
}
async function copyText() {
  try {
    await writeText(working.value.text);
    customMessage.success("已复制全文");
  } catch (cause) {
    errorHandler.handle(cause, {
      userMessage: "复制失败，请重试",
      showToUser: true,
    });
  }
}
async function saveFile() {
  try {
    const name =
      working.value.title.replace(/[<>:"/\\|?*\x00-\x1f]/g, "_") || "文本附件";
    const path = await save({
      defaultPath: `${name}.txt`,
      filters: [{ name: "文本文件", extensions: ["txt"] }],
    });
    if (path) await writeTextFile(path, working.value.text);
  } catch (cause) {
    errorHandler.handle(cause, {
      userMessage: "另存文件失败，请重试",
      showToUser: true,
    });
  }
}
onBeforeUnmount(() => emit("editing-change", false));
defineExpose({ openNew: () => open() });
</script>

<template>
  <section
    v-if="attachments.length || draft"
    class="text-attachments"
    aria-label="文本附件"
  >
    <div v-if="draft" class="text-attachments-heading">
      <button
        type="button"
        class="text-action"
        :disabled="busy"
        @click="open()"
      >
        <Plus :size="13" />新建文本附件
      </button>
      <span v-if="attachments.length" class="text-muted"
        >{{ attachments.length }} 份材料</span
      >
    </div>
    <div class="text-attachment-list">
      <div
        v-for="item in summaries"
        :key="item.attachment.id"
        class="text-attachment-card"
      >
        <button
          type="button"
          class="text-attachment-open"
          :title="item.attachment.title"
          @click="open(item.attachment)"
        >
          <FileText :size="25" class="text-file-icon" />
          <span class="text-attachment-info">
            <strong>{{ item.attachment.title }}</strong>
            <span class="text-muted">文本 · {{ item.count }} 字符</span>
            <span class="text-attachment-preview">{{ item.preview }}</span>
          </span>
        </button>
        <button
          v-if="draft && editable"
          type="button"
          class="text-remove"
          :disabled="busy"
          :aria-label="`移除文本附件 ${item.attachment.title}`"
          @click="emit('remove', item.attachment)"
        >
          <X :size="14" />
        </button>
      </div>
    </div>
  </section>
  <BaseDialog
    :model-value="visible"
    :title="editing ? '编辑文本附件' : '文本附件'"
    width="min(880px, 94vw)"
    height="min(720px, 86vh)"
    :before-close="beforeClose"
    :close-on-backdrop-click="false"
    :destroy-on-close="true"
    @update:model-value="!$event && closed()"
  >
    <div
      class="text-attachment-editor"
      @keydown.ctrl.enter.stop.prevent
      @keydown.meta.enter.stop.prevent
    >
      <ElInput
        v-model="working.title"
        aria-label="文本附件标题"
        placeholder="材料标题"
        :maxlength="200"
        :readonly="!editing"
      />
      <div class="text-editor-actions">
        <span class="text-muted">{{ count.toLocaleString() }} 字符</span>
        <div class="text-editor-tools">
          <ElButton size="small" :icon="Copy" @click="copyText"
            >复制全文</ElButton
          >
          <ElButton size="small" :icon="Download" @click="saveFile"
            >另存文件</ElButton
          >
          <ElButton
            v-if="draft && original"
            size="small"
            :icon="CornerDownLeft"
            :disabled="dirty || busy"
            @click="
              emit('insert', original);
              closed();
            "
            >插入正文</ElButton
          >
          <ElButton
            v-if="!editing && editable"
            size="small"
            :icon="Pencil"
            :disabled="busy"
            @click="editing = true"
            >编辑</ElButton
          >
        </div>
      </div>
      <RichCodeEditor
        v-if="visible"
        v-model="working.text"
        language="plaintext"
        editor-type="codemirror"
        :read-only="!editing"
        class="text-source-editor"
      />
      <p
        v-if="editing && !draft && hasReplies"
        class="text-muted text-edit-hint"
      >
        后续回复保持原样。下次生成使用更新后的材料。
      </p>
      <p v-if="error" class="text-edit-error" role="alert">{{ error }}</p>
    </div>
    <template #footer>
      <div class="text-editor-footer">
        <ElButton @click="close">{{ editing ? "取消" : "关闭" }}</ElButton>
        <template v-if="editing">
          <ElButton
            v-if="allowBranch"
            :disabled="!canSave"
            :loading="saving"
            @click="commit(true)"
            >保存到新分支</ElButton
          >
          <ElButton
            type="primary"
            :disabled="!canSave"
            :loading="saving"
            @click="commit(false)"
            >{{ draft ? "保存" : "保存到消息" }}</ElButton
          >
        </template>
      </div>
    </template>
  </BaseDialog>
</template>

<style scoped>
.text-attachments {
  min-width: 0;
}
.text-attachments-heading,
.text-editor-actions,
.text-editor-tools,
.text-editor-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.text-attachments-heading {
  justify-content: space-between;
  padding: 2px 0 6px;
}
.text-action {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: transparent;
  border: 0;
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 3px 0;
}
.text-action:hover {
  color: var(--el-color-primary);
}
.text-action:disabled,
.text-remove:disabled {
  opacity: 0.5;
  cursor: default;
}
.text-muted {
  color: var(--text-secondary);
  font-size: 12px;
}
.text-attachment-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.text-attachment-card {
  display: flex;
  align-items: flex-start;
  width: 280px;
  max-width: 100%;
  background: var(--input-bg, var(--container-bg));
  border: var(--border-width) solid var(--border-color);
  border-radius: 10px;
}
.text-attachment-card:focus-within,
.text-attachment-card:hover {
  border-color: var(--el-color-primary);
}
.text-attachment-open {
  display: flex;
  flex: 1;
  gap: 10px;
  min-width: 0;
  align-items: center;
  padding: 10px;
  background: transparent;
  border: 0;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
}
.text-file-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}
.text-attachment-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.text-attachment-info strong {
  font-size: 13px;
  font-weight: 500;
}
.text-attachment-info strong,
.text-attachment-preview {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.text-attachment-preview {
  font-size: 11px;
  color: var(--text-secondary);
}
.text-remove {
  display: grid;
  place-items: center;
  margin: 5px;
  padding: 3px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.text-remove:hover {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
}
.text-attachment-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  gap: 12px;
}
.text-editor-actions {
  justify-content: space-between;
  flex-wrap: wrap;
}
.text-editor-tools {
  flex-wrap: wrap;
  gap: 6px;
}
.text-editor-tools :deep(.el-button + .el-button) {
  margin-left: 0;
}
.text-source-editor {
  flex: 1;
  min-height: 120px;
  overflow: hidden;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
}
.text-edit-hint,
.text-edit-error {
  margin: 0;
}
.text-edit-error {
  color: var(--el-color-danger);
  font-size: 12px;
}
.text-editor-footer {
  justify-content: flex-end;
  flex-wrap: wrap;
}
</style>
