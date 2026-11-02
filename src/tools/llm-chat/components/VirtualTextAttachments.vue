<script setup lang="ts">
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import {
  ElButton,
  ElInput,
  ElMessageBox,
  ElRadioGroup,
  ElRadioButton,
} from "element-plus";
import {
  FileText,
  X,
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
import RichTextRenderer from "@/tools/rich-text-renderer/RichTextRenderer.vue";
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
    inline?: boolean;
    restorePasteId?: string;
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
  "restore-paste": [];
  remove: [attachment: VirtualTextAttachment];
  insert: [attachment: VirtualTextAttachment];
  "editing-change": [editing: boolean];
}>();
const errorHandler = createModuleErrorHandler("llm-chat/text-attachments");
const visible = ref(false);
const editing = ref(false);
const viewMode = ref<"source" | "preview">("source");
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);
const saving = ref(false);
const original = ref<VirtualTextAttachment | null>(null);
const working = ref<VirtualTextAttachment>(createVirtualTextAttachment(""));
const baseline = ref("");
const error = ref("");
const count = computed(() => textCharacterCount(working.value.text));
const dirty = computed(() => JSON.stringify(working.value) !== baseline.value);
const canSave = computed(
  () =>
    editing.value &&
    props.editable &&
    dirty.value &&
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

// 等待弹窗和编辑器挂载完成，再将输入焦点交给正文。
watch([visible, viewMode], async ([isVisible, mode]) => {
  if (!isVisible || mode !== "source") return;
  await nextTick();
  if (visible.value && viewMode.value === "source") {
    editorRef.value?.focusEditor();
  }
});

function focusSourceBackground(event: MouseEvent) {
  if (event.button !== 0 || !(event.target instanceof HTMLElement)) return;
  // 保留正文选区、行号折叠、搜索栏及补全菜单自身的交互。
  if (
    event.target.matches(
      ".rich-code-editor-wrapper, .editor-container, .cm-editor, .cm-scroller"
    )
  ) {
    editorRef.value?.focusEditor();
  }
}

function open(attachment?: VirtualTextAttachment) {
  original.value = attachment ? { ...attachment } : null;
  working.value = attachment
    ? { ...attachment }
    : createVirtualTextAttachment("", props.attachments);
  baseline.value = JSON.stringify(working.value);
  error.value = "";
  editing.value = props.editable;
  viewMode.value = props.editable ? "source" : "preview";
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
  if (!canSave.value || (branch && !props.allowBranch)) return;
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
    v-if="attachments.length"
    class="text-attachments"
    :class="{ 'is-inline': inline, 'is-draft': draft }"
    aria-label="文本附件"
  >
    <div class="text-attachment-list">
      <div
        v-for="item in summaries"
        :key="item.attachment.id"
        class="text-attachment-card"
      >
        <button
          type="button"
          class="text-attachment-open"
          :title="`${item.attachment.title} · ${item.count} 字符\n${item.preview}`"
          @click="open(item.attachment)"
        >
          <FileText :size="25" class="text-file-icon" />
          <span class="text-attachment-info">
            <strong>{{ item.attachment.title }}</strong>
            <span class="text-muted"
              >{{ draft ? "" : "文本 · " }}{{ item.count }} 字符</span
            >
            <span v-if="!draft" class="text-attachment-preview">{{
              item.preview
            }}</span>
          </span>
        </button>
        <div v-if="draft && editable" class="text-card-actions">
          <button
            v-if="item.attachment.id === restorePasteId"
            type="button"
            class="text-restore"
            :disabled="busy"
            title="直接粘贴文本"
            aria-label="直接粘贴文本"
            @click="emit('restore-paste')"
          >
            <CornerDownLeft :size="14" />
          </button>
          <button
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
        :readonly="!editing || !editable || busy || saving"
      />
      <div class="text-editor-actions">
        <div class="text-editor-view-controls">
          <ElRadioGroup
            v-model="viewMode"
            size="small"
            aria-label="文本附件显示模式"
          >
            <ElRadioButton value="source">源码</ElRadioButton>
            <ElRadioButton value="preview">预览</ElRadioButton>
          </ElRadioGroup>
          <span class="text-muted">{{ count.toLocaleString() }} 字符</span>
        </div>
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
            @click="
              editing = true;
              viewMode = 'source';
            "
            >编辑</ElButton
          >
        </div>
      </div>
      <RichCodeEditor
        ref="editorRef"
        v-show="viewMode === 'source'"
        v-if="visible"
        v-model="working.text"
        language="plaintext"
        editor-type="codemirror"
        :read-only="!editing || !editable || busy || saving"
        class="text-source-editor"
        @mousedown="focusSourceBackground"
      />
      <div
        v-if="visible && viewMode === 'preview'"
        class="text-attachment-rendered-preview"
        role="region"
        aria-label="文本附件预览"
        tabindex="0"
      >
        <RichTextRenderer
          :content="working.text"
          :enable-enter-animation="false"
          :llm-think-rules="[]"
        />
      </div>
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
        <template v-if="editing && editable">
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
.text-attachments.is-inline,
.text-attachments.is-inline .text-attachment-list {
  display: contents;
}
.text-attachments.is-draft .text-attachment-card {
  box-sizing: border-box;
  width: 160px;
  height: 54px;
  flex-shrink: 0;
  background: var(--card-bg);
}
.text-attachments.is-draft .text-attachment-open {
  align-self: stretch;
  gap: 8px;
  padding: 6px 8px;
}
.text-attachments.is-draft .text-attachment-info {
  flex: 1;
  gap: 2px;
}
.text-attachments.is-draft .text-muted {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.text-attachments.is-draft .text-card-actions {
  align-self: stretch;
  flex-direction: column;
  justify-content: center;
  padding-right: 4px;
}
.text-attachments.is-draft .text-card-actions button {
  margin: 0;
  padding: 2px;
}
.text-attachment-open:focus-visible,
.text-card-actions button:focus-visible {
  outline: 2px solid var(--el-color-primary);
  outline-offset: -2px;
  border-radius: 4px;
}
.text-editor-actions,
.text-editor-tools,
.text-editor-footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.text-card-actions {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.text-restore {
  display: grid;
  place-items: center;
  margin: 5px 0;
  padding: 3px;
  border: 0;
  background: transparent;
  color: var(--el-color-primary);
  font-size: 11px;
  cursor: pointer;
}
.text-restore:disabled,
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
.text-editor-view-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
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
.text-source-editor :deep(.cm-content) {
  min-height: 100%;
}
.text-attachment-rendered-preview {
  flex: 1;
  min-height: 120px;
  overflow: auto;
  overflow-wrap: anywhere;
  padding: 16px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background: var(--input-bg);
  color: var(--text-primary);
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
