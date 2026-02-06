<script setup lang="ts">
import { ref, watch, onUnmounted, computed, nextTick } from "vue";
import { useKnowledgeBaseStore } from "../stores/knowledgeBaseStore";
import { useKnowledgeBase } from "../composables/useKnowledgeBase";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useFileInteraction } from "@/composables/useFileInteraction";
import { isTextFile } from "@/utils/fileTypeDetector";
import { useKbIndexer } from "../composables/useKbIndexer";
import { performGenerateTags, mergeTags } from "../core/tagGenerator";
import { getProfileId } from "../utils/kbUtils";
import {
  Trash2,
  Zap,
  Tag,
  FileText,
  ChevronLeft,
  Loader2,
  Check,
  Settings2,
  Sparkles,
  FileUp,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useLlmRequest } from "@/composables/useLlmRequest";
import { format } from "date-fns";
import { invoke } from "@tauri-apps/api/core";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import TagEditor from "./TagEditor.vue";
import type { CaiuInput } from "../types";
import { debounce, isEqual } from "lodash-es";

defineProps<{
  isWide: boolean;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const kbStore = useKnowledgeBaseStore();
const { updateEntry, deleteEntry } = useKnowledgeBase();
const { indexEntry } = useKbIndexer();
const { sendRequest } = useLlmRequest();
const editorRef = ref<InstanceType<typeof RichCodeEditor> | null>(null);
const editorContentRef = ref<HTMLElement>();
const detailFileInputRef = ref<HTMLInputElement>();
const isEmbedding = ref(false);
const isGeneratingTags = ref(false);
const isSaving = ref(false);
const lastSavedTime = ref<number | null>(null);
let lastSavedData: CaiuInput | null = null;

const isVectorReady = computed(() => {
  if (!kbStore.activeEntryId) return false;
  return kbStore.vectorizedIds.has(kbStore.activeEntryId);
});

const lastSavedText = computed(() => {
  if (!lastSavedTime.value) return "";
  return format(lastSavedTime.value, "HH:mm:ss");
});

const form = ref<CaiuInput>({
  key: "",
  content: "",
  tags: [],
  assets: [],
  priority: 100,
  enabled: true,
});

// 用于平滑切换，避免闪烁
const isDetailLoading = ref(false);
const hasValidEntry = computed(
  () => !!kbStore.activeEntryId && (form.value.key || form.value.content || isDetailLoading.value)
);

// 自动保存逻辑
const debouncedSave = debounce(async () => {
  if (!kbStore.activeEntryId) return;

  // 检查数据是否有实际变化
  if (lastSavedData && isEqual(form.value, lastSavedData)) {
    return;
  }

  isSaving.value = true;
  try {
    const currentData = { ...form.value };
    await updateEntry(kbStore.activeEntryId, currentData, true);
    lastSavedData = currentData;
    lastSavedTime.value = Date.now();
  } finally {
    isSaving.value = false;
  }
}, 800);

// 监听选中项变化，同步表单
watch(
  () => kbStore.activeEntryId,
  async (newId) => {
    // 切换前如果还有没保存的，立即保存
    debouncedSave.flush();

    if (newId) {
      isDetailLoading.value = true;
      const entry = await kbStore.getOrLoadEntry(newId);

      // 确保还是同一个 ID，防止竞态
      if (entry && kbStore.activeEntryId === newId) {
        const newData = {
          key: entry.key,
          content: entry.content,
          tags: [...(entry.tags || [])],
          assets: [...(entry.assets || [])],
          priority: entry.priority,
          enabled: entry.enabled,
        };
        form.value = newData;
        lastSavedData = { ...newData };
        lastSavedTime.value = entry.updatedAt || null;

        // 切换条目后清除编辑器历史，防止撤销到上一个条目
        nextTick(() => {
          editorRef.value?.clearHistory();
          isDetailLoading.value = false;
        });
      } else {
        isDetailLoading.value = false;
      }
    } else {
      // 重置表单状态
      form.value = {
        key: "",
        content: "",
        tags: [],
        assets: [],
        priority: 100,
        enabled: true,
      };
      lastSavedData = null;
      lastSavedTime.value = null;
    }
  },
  { immediate: true }
);

// 深度监听表单变化触发自动保存
watch(
  form,
  () => {
    if (kbStore.activeEntryId) {
      debouncedSave();
    }
  },
  { deep: true }
);

onUnmounted(() => {
  debouncedSave.cancel();
});

const handleDelete = async () => {
  if (!kbStore.activeEntryId) return;
  try {
    const idToDelete = kbStore.activeEntryId;
    await deleteEntry(idToDelete);
    emit("close");
  } catch (error) {
    // 处理已由 store 层完成
  }
};

const handleEmbedding = async () => {
  if (!kbStore.activeEntryId) return;
  isEmbedding.value = true;
  try {
    // 传入 silent: true，避免触发 WorkspaceView 的全局“初始化”加载层
    // 因为我们这里已经有 isEmbedding 局部状态控制按钮 loading 了
    await indexEntry(kbStore.activeEntryId, true);
  } finally {
    isEmbedding.value = false;
  }
};

const handleGenerateTags = async () => {
  if (!form.value.content) {
    customMessage.warning("请先输入内容");
    return;
  }

  const config = kbStore.config.tagGeneration;
  if (!config.enabled || !config.modelId) {
    customMessage.warning("请先在设置中启用标签生成并配置模型");
    return;
  }

  isGeneratingTags.value = true;
  try {
    const profileId = getProfileId(config.modelId);
    const { profiles } = useLlmProfiles();
    const profile = profiles.value.find((p) => p.id === profileId);
    if (!profile) {
      customMessage.error("未找到对应的模型配置 Profile");
      return;
    }

    const newTags = await performGenerateTags({
      content: form.value.content,
      config,
      profile,
      sendRequest,
    });

    const merged = mergeTags(form.value.tags, newTags);
    const addedCount = merged.length - form.value.tags.length;

    if (addedCount > 0) {
      form.value.tags = merged;
      customMessage.success(`成功生成 ${addedCount} 个新标签`);
    } else {
      customMessage.info("未发现新标签");
    }
  } catch (error) {
    // 错误已由 errorHandler 处理
  } finally {
    isGeneratingTags.value = false;
  }
};
const processAppendFiles = async (files: File[]) => {
  if (!kbStore.activeEntryId) return;

  const textFiles = files.filter((file) => isTextFile(file.name, file.type));

  if (textFiles.length === 0) {
    customMessage.warning("只支持追加文本文件内容");
    return;
  }

  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  let addedCount = 0;
  let skippedCount = 0;

  for (const file of textFiles) {
    if (file.size > MAX_SIZE) {
      skippedCount++;
      continue;
    }

    try {
      const content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsText(file);
      });

      if (content) {
        const currentContent = form.value.content || "";
        const separator =
          currentContent && !currentContent.endsWith("\n")
            ? "\n\n"
            : currentContent.endsWith("\n\n")
              ? ""
              : currentContent.endsWith("\n")
                ? "\n"
                : "";

        form.value.content = currentContent + separator + content;
        addedCount++;
      }
    } catch (err) {
      console.error(`读取文件 ${file.name} 失败:`, err);
    }
  }

  if (addedCount > 0) {
    customMessage.success(`成功从 ${addedCount} 个文件中追加内容`);
  }
  if (skippedCount > 0) {
    customMessage.warning(`${skippedCount} 个文件超过 5MB 已跳过`);
  }
};

// 文件拖放处理
const processAppendPaths = async (paths: string[]) => {
  if (!kbStore.activeEntryId) return;

  let addedCount = 0;
  let errorCount = 0;
  for (const path of paths) {
    try {
      if (!isTextFile(path, "")) continue;

      const content = await invoke<string>("read_text_file_force", { path });
      if (content) {
        const currentContent = form.value.content || "";
        const separator =
          currentContent && !currentContent.endsWith("\n")
            ? "\n\n"
            : currentContent.endsWith("\n\n")
              ? ""
              : currentContent.endsWith("\n")
                ? "\n"
                : "";

        form.value.content = currentContent + separator + content;
        addedCount++;
      }
    } catch (err) {
      console.error(`读取路径 ${path} 失败:`, err);
      errorCount++;
    }
  }

  if (addedCount > 0) {
    customMessage.success(`成功从 ${addedCount} 个文件路径追加内容`);
  }
  if (errorCount > 0) {
    customMessage.error(`${errorCount} 个文件读取失败`);
  }
};

const { isDraggingOver } = useFileInteraction({
  element: editorContentRef,
  multiple: true,
  disabled: computed(() => !kbStore.activeEntryId),
  onFiles: processAppendFiles,
  onPaths: processAppendPaths,
});

const triggerDetailFileInput = () => {
  detailFileInputRef.value?.click();
};

const handleDetailFileChange = (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    processAppendFiles(Array.from(target.files));
    target.value = "";
  }
};
</script>

<template>
  <div class="caiu-detail-container" :class="{ 'is-loading': isDetailLoading }">
    <template v-if="hasValidEntry">
      <div class="editor-header">
        <div class="header-left">
          <el-button v-if="!isWide" link @click="emit('close')">
            <ChevronLeft :size="16" />
          </el-button>
          <el-input v-model="form.key" placeholder="条目标题 (Key)" class="title-input" />
        </div>
        <div style="width: 8px"></div>
        <div class="header-actions">
          <div class="status-group">
            <div v-if="isSaving" class="saving-indicator">
              <Loader2 :size="13" class="animate-spin" />
              <span>正在保存...</span>
            </div>
            <div v-else-if="lastSavedTime" class="saving-indicator saved">
              <Check :size="13" />
              <span>已保存 {{ lastSavedText }}</span>
            </div>
          </div>

          <div class="button-group">
            <el-tooltip
              :content="
                !kbStore.activeEntry
                  ? '加载中...'
                  : isVectorReady
                    ? '向量已就绪'
                    : kbStore.pendingIds.has(kbStore.activeEntryId!)
                      ? '向量处理中'
                      : '点击同步向量'
              "
            >
              <el-button
                :type="isVectorReady ? 'success' : 'warning'"
                size="small"
                :loading="isEmbedding || isDetailLoading"
                :disabled="!kbStore.config.defaultEmbeddingModel || !kbStore.activeEntry"
                @click="handleEmbedding"
                class="vector-action-btn"
                :class="{ 'is-ready': isVectorReady }"
              >
                <template #icon>
                  <Zap
                    :size="14"
                    :fill="isVectorReady ? 'currentColor' : 'none'"
                  />
                </template>
                {{ isVectorReady ? "已向量化" : "同步向量" }}
              </el-button>
            </el-tooltip>

            <el-divider direction="vertical" />

            <el-popconfirm title="确定要删除此条目吗？" @confirm="handleDelete">
              <template #reference>
                <el-button
                  type="danger"
                  plain
                  size="small"
                  class="delete-btn"
                  :disabled="!kbStore.activeEntry"
                >
                  <Trash2 :size="14" />
                </el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </div>

      <div
        ref="editorContentRef"
        class="editor-content custom-scrollbar"
        :class="{ 'is-dragging': isDraggingOver }"
      >
        <!-- 拖拽遮罩 -->
        <div v-if="isDraggingOver" class="drag-overlay">
          <div class="drag-hint">
            <Sparkles :size="32" />
            <span>释放以追加文本内容</span>
          </div>
        </div>

        <!-- 条目属性 -->
        <div class="form-section attributes-section">
          <div class="section-title">
            <Settings2 :size="16" />
            <span>条目属性</span>
          </div>
          <div class="attributes-grid">
            <div class="attr-card tags-card">
              <div class="attr-header">
                <div class="attr-label">
                  <Tag :size="14" />
                  <span>标签与权重</span>
                </div>
                <el-button
                  v-if="kbStore.config.tagGeneration?.enabled"
                  link
                  type="primary"
                  size="small"
                  :loading="isGeneratingTags"
                  @click="handleGenerateTags"
                >
                  <template #icon>
                    <Sparkles :size="12" />
                  </template>
                  AI 生成
                </el-button>
              </div>
              <div class="attr-body">
                <TagEditor v-model="form.tags" />
              </div>
            </div>

            <div class="attr-card meta-card">
              <div class="attr-header">
                <div class="attr-label">
                  <Settings2 :size="14" />
                  <span>配置</span>
                </div>
              </div>
              <div class="attr-body meta-body">
                <div class="meta-item">
                  <span class="meta-label">优先级</span>
                  <el-input-number
                    v-model="form.priority"
                    :min="0"
                    :max="999"
                    size="small"
                    controls-position="right"
                  />
                </div>
                <div class="meta-item">
                  <span class="meta-label">启用状态</span>
                  <el-switch v-model="form.enabled" size="small" />
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 内容编辑填满下方 -->
        <div class="form-section content-section">
          <div class="section-title">
            <div class="title-left">
              <FileText :size="16" />
              <span>内容 (Markdown)</span>
            </div>
            <div class="title-right">
              <input
                ref="detailFileInputRef"
                type="file"
                multiple
                style="display: none"
                @change="handleDetailFileChange"
              />
              <el-button link size="small" @click="triggerDetailFileInput">
                <template #icon><FileUp :size="14" /></template>
                追加文件
              </el-button>
            </div>
          </div>
          <div class="editor-container">
            <RichCodeEditor
              ref="editorRef"
              v-model="form.content"
              language="markdown"
              height="100%"
            />
          </div>
        </div>
      </div>
    </template>
    <el-empty v-else description="选择一个条目开始编辑" />
  </div>
</template>

<style scoped>
.caiu-detail-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-width: 0;
  transition: opacity 0.15s ease;
}

.caiu-detail-container.is-loading {
  opacity: 0.7;
  pointer-events: none;
}

.editor-header {
  padding: 10px 16px;
  height: 56px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--sidebar-bg);
  box-sizing: border-box;
}

.header-left {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.title-input {
  max-width: 600px;
}

.title-input :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background: rgba(var(--el-text-color-primary-rgb), 0.04);
  padding: 4px 12px;
  border-radius: 6px;
  transition: all 0.2s ease;
}

.title-input :deep(.el-input__wrapper:hover) {
  background: rgba(var(--el-text-color-primary-rgb), 0.08);
}

.title-input :deep(.el-input__wrapper.is-focus) {
  background: var(--input-bg);
  box-shadow: 0 0 0 1px var(--el-color-primary) inset !important;
}

.title-input :deep(.el-input__inner) {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.header-actions {
  display: flex;
  gap: 16px;
  align-items: center;
  flex-shrink: 0;
}

.status-group {
  display: flex;
  align-items: center;
}

.button-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.vector-action-btn {
  font-weight: 500;
  padding: 8px 12px;
}

.vector-action-btn.is-ready {
  background-color: rgba(var(--el-color-success-rgb), 0.1);
  border-color: rgba(var(--el-color-success-rgb), 0.2);
  color: var(--el-color-success);
}

.vector-action-btn.is-ready:hover {
  background-color: rgba(var(--el-color-success-rgb), 0.15);
  border-color: rgba(var(--el-color-success-rgb), 0.3);
}

.saving-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  transition: all 0.3s ease;
  user-select: none;
}

.saving-indicator.saved {
  color: var(--el-text-color-placeholder);
}

.saving-indicator.saved:hover {
  opacity: 1;
}

.animate-spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.editor-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  position: relative;
  transition: background-color 0.2s ease;
}

.editor-content.is-dragging {
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.drag-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  border: 2px dashed var(--el-color-primary);
  margin: 10px;
  border-radius: 12px;
  box-sizing: border-box;
}

.drag-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--el-color-primary);
  font-weight: 600;
}

.form-section {
  margin-bottom: 0;
}

.content-section {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 400px;
}

.content-section .editor-container {
  flex: 1;
}

.attributes-grid {
  display: grid;
  grid-template-columns: 1fr 200px;
  gap: 16px;
}

@media (max-width: 1000px) {
  .attributes-grid {
    grid-template-columns: 1fr;
  }
}

.attr-card {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.attr-header {
  padding: 8px 12px;
  background-color: rgba(var(--el-text-color-primary-rgb), 0.03);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.attr-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.attr-body {
  padding: 12px;
  flex: 1;
}

.meta-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.meta-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.meta-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-weight: 600;
  margin-bottom: 12px;
  font-size: 14px;
}

.title-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title-right {
  display: flex;
  align-items: center;
}

.editor-container {
  display: flex;
  flex-direction: column;
}

.editor-container :deep(.rich-code-editor-wrapper) {
  border-radius: 8px;
}
</style>
