<!--
  截图预览面板 (右下)。
  - Props: 生成结果 + 进度 + 选中数 + 截图容器宽度 (用于显示 fallback 尺寸)
  - Emits: regenerate / copy / save
  - 缩略图点击: 内部 useImageViewer 放大查看
-->
<template>
  <section class="right-panel">
    <div class="preview-toolbar">
      <span class="preview-stats">
        <Camera :size="14" />
        <template v-if="lastCanvas">
          {{ Math.round(lastCanvas.width / 2) }} ×
          {{ Math.round(lastCanvas.height / 2) }} px
        </template>
        <template v-else>{{ width }} × ? px</template>
      </span>
      <div class="preview-toolbar-actions">
        <el-button
          type="primary"
          size="small"
          :loading="generating"
          :disabled="selectedCount === 0"
          @click="emit('regenerate')"
        >
          重新生成
        </el-button>
      </div>
    </div>

    <div class="preview-thumbnail-area">
      <div v-if="generating" class="thumbnail-state">
        <el-icon :size="32" class="is-spinning">
          <Loader2 />
        </el-icon>
        <p class="thumbnail-state-title">正在生成截图…</p>
        <p class="thumbnail-state-progress">
          {{ progress.done }} / {{ progress.total }}
        </p>
      </div>
      <img
        v-else-if="lastImageUrl"
        :src="lastImageUrl"
        class="screenshot-thumbnail"
        alt="截图缩略图，点击查看大图"
        @click="openImageViewer"
      />
      <div
        v-else-if="selectedCount === 0"
        class="thumbnail-state"
      >
        <el-icon :size="32"><Eye /></el-icon>
        <p class="thumbnail-state-title">请选择至少一条消息</p>
      </div>
      <div v-else class="thumbnail-state">
        <el-icon :size="32"><Camera /></el-icon>
        <p class="thumbnail-state-title">等待生成截图</p>
        <p class="thumbnail-state-hint">
          点击右上角"重新生成"或修改左侧配置
        </p>
      </div>
    </div>

    <div class="preview-footer">
      <div class="preview-status">
        <template v-if="generating">
          正在生成… {{ progress.done }} / {{ progress.total }}
        </template>
        <template v-else-if="lastCanvas">
          已生成 ({{ Math.round(lastCanvas.width / 2) }} ×
          {{ Math.round(lastCanvas.height / 2) }} px,
          {{ selectedCount }} 条消息)
        </template>
        <template v-else>等待生成截图</template>
      </div>
      <div class="preview-actions">
        <el-button
          :icon="Copy"
          size="small"
          :disabled="!lastCanvas"
          @click="emit('copy')"
        >
          复制到剪贴板
        </el-button>
        <el-button
          type="primary"
          size="small"
          :icon="Download"
          :disabled="!lastCanvas"
          @click="emit('save')"
        >
          保存图片
        </el-button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { Camera, Copy, Download, Eye, Loader2 } from "lucide-vue-next";
import { ElButton, ElIcon } from "element-plus";
import { useImageViewer } from "@/composables/useImageViewer";

interface Props {
  lastImageUrl: string;
  lastCanvas: HTMLCanvasElement | null;
  generating: boolean;
  progress: { done: number; total: number; currentLabel: string };
  selectedCount: number;
  /** 截图容器宽度 (CSS px), 用于尚未生成时的 fallback 尺寸显示 */
  width: number;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "regenerate"): void;
  (e: "copy"): void;
  (e: "save"): void;
}>();

const imageViewer = useImageViewer();

function openImageViewer() {
  if (!props.lastImageUrl) return;
  imageViewer.show(props.lastImageUrl);
}
</script>

<style scoped>
.right-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  overflow: hidden;
  min-width: 0;
}

.preview-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}
.preview-stats {
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
  font-variant-numeric: tabular-nums;
}
.preview-toolbar-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

/* 缩略图容器: 居中显示截图缩略图, 背景与对比明显 */
.preview-thumbnail-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: var(--container-bg);
  overflow: auto;
  min-height: 0;
}

.screenshot-thumbnail {
  /* 缩略图最大 360px 宽, 高度按比例自动缩放 */
  max-width: 360px;
  width: auto;
  height: auto;
  max-height: 100%;
  display: block;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  cursor: zoom-in;
  transition: transform 0.15s, box-shadow 0.15s;
}
.screenshot-thumbnail:hover {
  transform: scale(1.02);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
}

/* 占位 / 加载态 */
.thumbnail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-color-secondary);
  text-align: center;
}
.thumbnail-state-title {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
}
.thumbnail-state-progress {
  margin: 0;
  font-size: 12px;
  color: var(--text-color-placeholder);
  font-variant-numeric: tabular-nums;
}
.thumbnail-state-hint {
  margin: 0;
  font-size: 11px;
  color: var(--text-color-placeholder);
}
.is-spinning {
  animation: spin 1s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.preview-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-color);
  flex-shrink: 0;
}
.preview-status {
  font-size: 12px;
  color: var(--text-color-secondary);
  font-variant-numeric: tabular-nums;
}
.preview-actions {
  margin-left: auto;
  display: flex;
  gap: 8px;
}
</style>
