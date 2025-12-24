<template>
  <div class="raw-debugger">
    <div class="debugger-layout">
      <!-- 左侧：输入与配置 -->
      <div class="config-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">原始向量化调试</span>
            <span class="panel-subtitle">直接调用 API 获取向量数据</span>
          </div>
          <el-button
            type="primary"
            :loading="isLoading"
            @click="handleRun"
            :disabled="!store.selectedProfile || !store.selectedModelId"
            class="run-btn"
          >
            <template #icon>
              <lucide-play class="w-4 h-4" />
            </template>
            运行
          </el-button>
        </div>

        <div class="panel-content scrollbar-custom">
          <div class="config-section">
            <label class="section-label">维度 (Optional)</label>
            <el-select
              v-model="store.rawDimensions"
              placeholder="默认 / 选择或输入维度"
              filterable
              allow-create
              clearable
              default-first-option
              class="w-full custom-select"
              @change="handleDimensionChange"
            >
              <el-option
                v-for="dim in COMMON_DIMENSIONS"
                :key="dim.value"
                :label="dim.label"
                :value="dim.value"
              />
            </el-select>
            <div class="field-hint">
              仅部分模型支持自定义维度（如 OpenAI text-embedding-3 系列）
            </div>
          </div>

          <div class="config-section flex-1-input">
            <label class="section-label">输入文本</label>
            <div class="editor-container">
              <RichCodeEditor
                v-model="store.rawInput"
                language="markdown"
                placeholder="输入要向量化的文本内容..."
              />
            </div>
          </div>
        </div>
      </div>

      <!-- 分割线 -->
      <div class="divider"></div>

      <!-- 右侧：响应结果 -->
      <div class="result-panel">
        <div class="panel-header">
          <div class="title-group">
            <span class="panel-title">运行结果</span>
            <span v-if="executionTime" class="panel-subtitle">耗时: {{ executionTime }}ms</span>
          </div>
          <div v-if="lastResponse" class="header-tags">
            <el-tag effect="plain" size="small" type="info">维度: {{ vectorDimension }}</el-tag>
            <el-tag effect="plain" size="small" type="success"
              >Tokens: {{ lastResponse.usage?.totalTokens || 0 }}</el-tag
            >
          </div>
        </div>

        <div class="panel-content scrollbar-custom">
          <div v-if="lastResponse" class="results-container">
            <!-- 向量预览 -->
            <div class="result-section">
              <div class="section-header-mini">
                <lucide-binary class="w-3 h-3 mr-1" />
                向量预览 (首尾各 5 个数值)
              </div>
              <div class="vector-preview-box">[ {{ vectorPreview }} ]</div>
            </div>

            <!-- 完整 JSON -->
            <div class="result-section full-height">
              <div class="section-header-mini">
                <lucide-json class="w-3 h-3 mr-1" />
                完整响应 JSON
              </div>
              <div class="json-editor-wrapper">
                <RichCodeEditor
                  :model-value="JSON.stringify(lastResponse, null, 2)"
                  language="json"
                  readonly
                  height="100%"
                />
              </div>
            </div>
          </div>

          <div v-else class="empty-state">
            <el-icon class="empty-icon"><lucide-terminal /></el-icon>
            <p>等待运行</p>
            <span>配置输入后点击“运行”查看原始 API 响应</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import {
  Play as LucidePlay,
  Binary as LucideBinary,
  FileJson as LucideJson,
  Terminal as LucideTerminal,
} from "lucide-vue-next";
import { useEmbeddingPlaygroundStore } from "../store";
import { useEmbeddingRunner } from "../composables/useEmbeddingRunner";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";

const store = useEmbeddingPlaygroundStore();
const { isLoading, lastResponse, executionTime, runEmbedding } = useEmbeddingRunner();

const errorHandler = createModuleErrorHandler("embedding-playground/RawDebugger");
const logger = createModuleLogger("embedding-playground/RawDebugger");

// 常用维度预设
const COMMON_DIMENSIONS = [
  { label: "256", value: 256 },
  { label: "512", value: 512 },
  { label: "768", value: 768 },
  { label: "1024", value: 1024 },
  { label: "1536", value: 1536 },
  { label: "3072", value: 3072 },
] as const;

const handleDimensionChange = (val: any) => {
  if (val === "") {
    store.rawDimensions = undefined;
    return;
  }
  const num = parseInt(val);
  if (!isNaN(num)) {
    store.rawDimensions = num;
  }
};

const vectorDimension = computed(() => {
  return lastResponse.value?.data?.[0]?.embedding?.length || 0;
});

const vectorPreview = computed(() => {
  const vec = lastResponse.value?.data?.[0]?.embedding;
  if (!vec) return "";
  if (vec.length <= 10) return vec.join(", ");
  const head = vec.slice(0, 5);
  const tail = vec.slice(-5);
  return `${head.join(", ")} ... ${tail.join(", ")}`;
});

const handleRun = async () => {
  if (!store.selectedProfile || !store.selectedModelId) {
    errorHandler.warn("请先在顶部选择 Profile 和模型");
    return;
  }

  if (!store.rawInput.trim()) {
    errorHandler.warn("请输入需要向量化的文本");
    return;
  }

  logger.info("开始运行原始向量化调试", {
    modelId: store.selectedModelId,
    dimensions: store.rawDimensions,
  });

  await errorHandler.wrapAsync(
    async () => {
      await runEmbedding(store.selectedProfile!, {
        modelId: store.selectedModelId!,
        input: store.rawInput,
        dimensions: store.rawDimensions || undefined,
      });
    },
    {
      userMessage: "向量化请求执行失败",
    }
  );
};
</script>

<style scoped>
.raw-debugger {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.debugger-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 面板通用样式 */
.config-panel,
.result-panel {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.config-panel {
  flex: 0 0 400px;
}

.result-panel {
  flex: 1;
}

.panel-header {
  height: 52px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  flex-shrink: 0;
}

.title-group {
  display: flex;
  flex-direction: column;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
}

.panel-subtitle {
  font-size: 11px;
  margin-top: 1px;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
}

/* 分割线 */
.divider {
  width: 1px;
  flex-shrink: 0;
}

/* 配置项样式 */
.config-section {
  margin-bottom: 24px;
  flex-shrink: 0;
}

.config-section.flex-1-input {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  margin-bottom: 0;
  overflow: hidden;
}

.editor-container {
  flex: 1;
  min-height: 0;
  box-sizing: border-box;
  /* 增加内边距并预留底部空间，防止编辑器聚焦时的高亮描边被父级 overflow: hidden 裁切 */
  padding: 2px;
  margin-bottom: 2px;
}

.section-label {
  display: flex;
  align-items: center;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
}

/* 结果容器 */
.results-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
  height: 100%;
}

.result-section {
  display: flex;
  flex-direction: column;
}

.result-section.full-height {
  flex: 1;
  min-height: 0;
}

.section-header-mini {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 10px;
  display: flex;
  align-items: center;
}

.vector-preview-box {
  padding: 12px;
  border-radius: 8px;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  line-height: 1.6;
  word-break: break-all;
}

.json-editor-wrapper {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  box-sizing: border-box;
}

.header-tags {
  display: flex;
  gap: 8px;
}

/* 空状态 */
.empty-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.empty-icon {
  font-size: 40px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state p {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px 0;
}

.empty-state span {
  font-size: 13px;
}

/* 自定义滚动条 */
.scrollbar-custom::-webkit-scrollbar {
  width: 6px;
}

.scrollbar-custom::-webkit-scrollbar-thumb {
  border-radius: 10px;
}

.scrollbar-custom::-webkit-scrollbar-track {
  background: transparent;
}

.field-hint {
  font-size: 11px;
  margin-top: 6px;
  line-height: 1.4;
}
</style>
