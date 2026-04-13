<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { ArrowLeft, Save, X, ExternalLink, ChevronLeft, ChevronRight, FileCode, History } from "lucide-vue-next";
import { useCanvasStore } from "../../stores/canvasStore";
import type { CanvasFileNode } from "../../types";
import CanvasFileTree from "../sidebar/CanvasFileTree.vue";
import PendingChangesBar from "../shared/PendingChangesBar.vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { debounce } from "lodash-es";
import { customMessage } from "@/utils/customMessage";
import { useDetachedManager } from "@/composables/useDetachedManager";

const props = defineProps<{
  canvasId: string;
}>();

const emit = defineEmits<{
  (e: "back"): void;
}>();

const store = useCanvasStore();

// --- 状态 ---
const fileTree = ref<CanvasFileNode[]>([]);
const sidebarWidth = ref(240);
const isSidebarVisible = ref(true);
const openTabs = ref<string[]>([]); // 存储文件路径
const activeTab = ref<string | null>(null);
const fileContent = ref<string>("");
const isFileLoading = ref(false);

// --- 计算属性 ---
const activeCanvas = computed(() => store.activeCanvas);

const EXT_LANGUAGE_MAP: Record<string, string> = {
  ".html": "html",
  ".htm": "html",
  ".css": "css",
  ".scss": "scss",
  ".sass": "sass",
  ".js": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".json": "json",
  ".md": "markdown",
  ".xml": "xml",
  ".svg": "xml",
  ".yaml": "yaml",
  ".yml": "yaml",
  ".py": "python",
  ".vue": "vue",
};

const currentLanguage = computed(() => {
  if (!activeTab.value) return "text";
  const ext = "." + activeTab.value.split(".").pop()?.toLowerCase();
  return EXT_LANGUAGE_MAP[ext] || "text";
});

// --- 方法 ---

const loadFileTree = async () => {
  fileTree.value = await store.getFileTree(props.canvasId);
};

const handleSelectFile = async (path: string) => {
  if (!openTabs.value.includes(path)) {
    openTabs.value.push(path);
  }
  activeTab.value = path;
};

const closeTab = (path: string) => {
  const index = openTabs.value.indexOf(path);
  if (index !== -1) {
    openTabs.value.splice(index, 1);
    if (activeTab.value === path) {
      activeTab.value = openTabs.value[openTabs.value.length - 1] || null;
    }
  }
};

const loadActiveFileContent = async () => {
  if (!activeTab.value) {
    fileContent.value = "";
    return;
  }

  isFileLoading.value = true;
  try {
    const content = await store.readCanvasFileAsync(props.canvasId, activeTab.value);
    fileContent.value = content || "";
  } finally {
    isFileLoading.value = false;
  }
};

const debouncedWriteFile = debounce((content: string) => {
  if (activeTab.value) {
    store.writeFile(props.canvasId, activeTab.value, content);
    // 刷新文件树以更新修改状态
    loadFileTree();
  }
}, 300);

const handleContentChange = (content: string) => {
  fileContent.value = content;
  debouncedWriteFile(content);
};

const handleCommit = async () => {
  await store.commitChanges(props.canvasId);
  customMessage.success("更改已提交");
  loadFileTree();
};

const handleDiscard = () => {
  store.discardChanges(props.canvasId);
  customMessage.info("已丢弃更改");
  loadFileTree();
  // 重新加载当前文件内容
  loadActiveFileContent();
};

const detachedManager = useDetachedManager();

const handlePreview = async () => {
  const canvasId = props.canvasId;
  if (!canvasId) return;

  const isAlreadyOpen = detachedManager.isDetached("canvas:preview");
  if (isAlreadyOpen) {
    await detachedManager.focusWindow("canvas:preview");
    return;
  }

  await detachedManager.createToolWindow({
    label: `canvas-preview-${canvasId}`,
    title: `Canvas: ${activeCanvas.value?.metadata.name || "Preview"}`,
    url: `/detached-component/canvas:preview?id=${canvasId}`,
    width: 1200,
    height: 800,
  });
};

// --- 生命周期与监听 ---

onMounted(() => {
  loadFileTree();
  // 默认打开入口文件
  if (activeCanvas.value?.metadata.entryFile) {
    handleSelectFile(activeCanvas.value.metadata.entryFile);
  }
});

watch(activeTab, () => {
  loadActiveFileContent();
});

// 监听 store 中的 pendingUpdates，如果当前文件在外部被修改（如 AI 写入），需要同步
watch(
  () => store.pendingUpdates[props.canvasId]?.[activeTab.value || ""],
  (newVal) => {
    if (newVal !== undefined && newVal !== fileContent.value) {
      fileContent.value = newVal;
    }
  },
);
</script>

<template>
  <div class="canvas-editor-panel">
    <!-- 顶部工具栏 -->
    <header class="editor-header">
      <div class="header-left">
        <el-button link :icon="ArrowLeft" @click="emit('back')">返回</el-button>
        <div class="divider"></div>
        <div class="canvas-info">
          <FileCode :size="18" class="canvas-icon" />
          <span class="canvas-name">{{ activeCanvas?.metadata.name }}</span>
        </div>
      </div>

      <div class="header-center">
        <!-- Tab 栏 -->
        <div class="tabs-container">
          <div
            v-for="path in openTabs"
            :key="path"
            class="tab-item"
            :class="{ 'is-active': activeTab === path }"
            @click="activeTab = path"
          >
            <span class="tab-name">{{ path.split("/").pop() }}</span>
            <el-icon class="close-icon" @click.stop="closeTab(path)"><X :size="12" /></el-icon>
          </div>
        </div>
      </div>

      <div class="header-right">
        <el-button-group>
          <el-button type="primary" :icon="Save" :disabled="!store.hasPendingChanges" @click="handleCommit">
            Commit All
          </el-button>
          <el-button :icon="ExternalLink" @click="handlePreview"> 独立预览 </el-button>
        </el-button-group>
      </div>
    </header>

    <div class="editor-body">
      <!-- 左侧边栏 -->
      <aside v-if="isSidebarVisible" class="editor-sidebar" :style="{ width: sidebarWidth + 'px' }">
        <div class="sidebar-section explorer">
          <div class="section-header">
            <span>资源管理器</span>
          </div>
          <div class="section-content">
            <CanvasFileTree :nodes="fileTree" :active-file="activeTab" @select="handleSelectFile" />
          </div>
        </div>

        <div class="sidebar-section changes">
          <PendingChangesBar
            :canvas-id="canvasId"
            :pending-files="store.pendingUpdates[canvasId] || {}"
            @commit="handleCommit"
            @discard="handleDiscard"
          />
        </div>
      </aside>

      <!-- 侧边栏折叠按钮 -->
      <div class="sidebar-toggle" @click="isSidebarVisible = !isSidebarVisible">
        <ChevronLeft v-if="isSidebarVisible" :size="14" />
        <ChevronRight v-else :size="14" />
      </div>

      <!-- 编辑器区域 -->
      <main class="editor-main">
        <template v-if="activeTab">
          <RichCodeEditor
            v-model="fileContent"
            :language="currentLanguage"
            editor-type="monaco"
            @update:model-value="handleContentChange"
          />
        </template>
        <div v-else class="empty-editor">
          <div class="empty-content">
            <FileCode :size="48" />
            <p>从左侧选择一个文件开始编辑</p>
          </div>
        </div>
      </main>
    </div>

    <!-- 底部状态栏 -->
    <footer class="editor-footer">
      <div class="footer-left">
        <span v-if="activeTab" class="status-item"> <FileCode :size="12" /> {{ activeTab }} </span>
      </div>
      <div class="footer-right">
        <span class="status-item">
          <History :size="12" /> {{ Object.keys(store.pendingUpdates[canvasId] || {}).length }} 个待定更改
        </span>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
.canvas-editor-panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
  overflow: hidden;

  .editor-header {
    height: 48px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: var(--border-width) solid var(--border-color);
    background-color: rgba(var(--card-bg-rgb), 0.8);
    flex-shrink: 0;

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 200px;

      .divider {
        width: 1px;
        height: 20px;
        background-color: var(--border-color);
      }

      .canvas-info {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--el-text-color-primary);
        font-weight: 500;

        .canvas-icon {
          color: var(--el-color-primary);
        }
      }
    }

    .header-center {
      flex: 1;
      height: 100%;
      overflow: hidden;
      margin: 0 16px;

      .tabs-container {
        display: flex;
        height: 100%;
        align-items: flex-end;
        overflow-x: auto;

        &::-webkit-scrollbar {
          display: none;
        }

        .tab-item {
          height: 36px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          gap: 8px;
          background-color: rgba(var(--el-fill-color-light), 0.3);
          border: var(--border-width) solid var(--border-color);
          border-bottom: none;
          border-radius: 6px 6px 0 0;
          margin-right: 4px;
          font-size: 12px;
          color: var(--el-text-color-secondary);
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.2s;

          &:hover {
            background-color: rgba(var(--el-fill-color-light), 0.5);

            .close-icon {
              opacity: 1;
            }
          }

          &.is-active {
            background-color: var(--card-bg);
            color: var(--el-color-primary);
            border-top: 2px solid var(--el-color-primary);
          }

          .close-icon {
            opacity: 0.5;
            transition: opacity 0.2s;
            &:hover {
              color: var(--el-color-danger);
            }
          }
        }
      }
    }
  }

  .editor-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;

    .editor-sidebar {
      display: flex;
      flex-direction: column;
      border-right: var(--border-width) solid var(--border-color);
      background-color: rgba(var(--card-bg-rgb), 0.5);
      flex-shrink: 0;

      .sidebar-section {
        display: flex;
        flex-direction: column;
        overflow: hidden;

        &.explorer {
          flex: 1;
        }

        &.changes {
          flex-shrink: 0;
        }

        .section-header {
          height: 32px;
          padding: 0 12px;
          display: flex;
          align-items: center;
          background-color: rgba(var(--el-fill-color-light), 0.3);
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
          color: var(--el-text-color-secondary);
        }

        .section-content {
          flex: 1;
          overflow: hidden;
        }
      }
    }

    .sidebar-toggle {
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 12px;
      height: 48px;
      background-color: var(--border-color);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 10;
      border-radius: 0 4px 4px 0;
      opacity: 0;
      transition: opacity 0.2s;

      &:hover {
        opacity: 1;
      }
    }

    &:hover .sidebar-toggle {
      opacity: 0.5;
    }

    .editor-main {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;

      :deep(.rich-code-editor-wrapper) {
        border: none;
        border-radius: 0;
      }

      .empty-editor {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--el-text-color-placeholder);

        .empty-content {
          text-align: center;
          p {
            margin-top: 16px;
          }
        }
      }
    }
  }

  .editor-footer {
    height: 24px;
    padding: 0 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: var(--el-color-primary);
    color: #fff;
    font-size: 11px;
    flex-shrink: 0;

    .status-item {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .footer-left,
    .footer-right {
      display: flex;
      gap: 16px;
    }
  }
}
</style>
