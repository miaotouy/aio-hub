<template>
  <div class="rich-text-renderer-tester">
    <!-- 顶部操作栏 -->
    <el-card shadow="never" class="header-card">
      <div class="header-content">
        <div class="header-left">
          <el-tooltip v-if="!isInputCollapsed" content="折叠输入栏" placement="bottom">
            <el-button :icon="DArrowLeft" circle @click="isInputCollapsed = true" />
          </el-tooltip>
          <el-tooltip v-else content="展开输入栏" placement="bottom">
            <el-button :icon="DArrowRight" circle @click="isInputCollapsed = false" />
          </el-tooltip>
          <h3 class="page-title">富文本渲染器测试</h3>
          <el-tag v-if="isRendering" type="primary" effect="dark">
            <el-icon class="is-loading"><Loading /></el-icon>
            渲染中...
          </el-tag>
        </div>
        <div class="header-right">
          <el-tooltip
            :content="
              isRendering
                ? '停止当前的渲染'
                : streamEnabled
                  ? '开始流式渲染输入的 Markdown 内容'
                  : '立即渲染输入的 Markdown 内容'
            "
            placement="bottom"
          >
            <el-button
              :type="isRendering ? 'danger' : 'primary'"
              :icon="isRendering ? VideoPause : VideoPlay"
              @click="isRendering ? stopRender() : startRender()"
              :disabled="!isRendering && !inputContent.trim()"
            >
              {{ isRendering ? "停止" : streamEnabled ? "开始流式渲染" : "立即渲染" }}
            </el-button>
          </el-tooltip>
          <el-tooltip content="清空右侧的渲染输出区域" placement="bottom">
            <el-button
              :icon="RefreshRight"
              @click="clearOutput"
              :disabled="!currentContent && !streamSource"
            >
              清空输出
            </el-button>
          </el-tooltip>
          <el-tooltip content="复制原文和渲染后的 HTML，便于对比排查问题" placement="bottom">
            <el-button
              :icon="CopyDocument"
              @click="copyComparison"
              :disabled="(!inputContent.trim()) || (!currentContent && !streamSource)"
            >
              复制对比
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </el-card>

    <div class="tester-container">
      <!-- 左侧输入栏 -->
      <div v-show="!isInputCollapsed" class="input-panel">
        <InfoCard title="内容输入" class="input-card">
          <!-- 预设内容选择 -->
          <div class="control-section">
            <label class="control-label">预设内容</label>
            <el-select
              v-model="selectedPreset"
              placeholder="选择预设内容"
              clearable
              @change="loadPreset"
              style="width: 100%"
            >
              <el-option
                v-for="preset in presets"
                :key="preset.id"
                :label="preset.name"
                :value="preset.id"
              />
            </el-select>
          </div>

          <!-- 流式输出控制 -->
          <div class="control-section">
            <div class="control-header">
              <label class="control-label">流式输出</label>
              <el-tooltip content="开启后将模拟流式输出效果，逐字符渲染内容" placement="left">
                <el-switch v-model="streamEnabled" />
              </el-tooltip>
            </div>

            <template v-if="streamEnabled">
              <div class="control-item">
                <el-tooltip content="控制流式输出的速度，数值越大输出越快" placement="right">
                  <label>输出速度</label>
                </el-tooltip>
                <div class="slider-wrapper">
                  <el-slider
                    v-model="streamSpeed"
                    :min="1"
                    :max="500"
                    :step="10"
                    show-input
                    :input-size="'small'"
                  />
                  <span class="unit">字符/秒</span>
                </div>
              </div>

              <div class="control-item">
                <el-tooltip content="开始渲染前的等待时间，用于模拟真实场景" placement="right">
                  <label>初始延迟</label>
                </el-tooltip>
                <div class="slider-wrapper">
                  <el-slider
                    v-model="initialDelay"
                    :min="0"
                    :max="3000"
                    :step="100"
                    show-input
                    :input-size="'small'"
                  />
                  <span class="unit">毫秒</span>
                </div>
              </div>

              <!-- 波动模式控制 -->
              <div class="control-item" style="margin-top: 20px">
                <div class="control-header">
                  <el-tooltip
                    content="开启后将随机波动延迟和字符数量，模拟真实流式输出"
                    placement="right"
                  >
                    <label>波动模式</label>
                  </el-tooltip>
                  <el-switch v-model="fluctuationEnabled" />
                </div>
              </div>

              <template v-if="fluctuationEnabled">
                <div class="control-item">
                  <el-tooltip content="每次输出的延迟时间范围" placement="right">
                    <label>延迟波动范围</label>
                  </el-tooltip>
                  <div class="range-inputs">
                    <el-input-number
                      v-model="delayFluctuation.min"
                      :min="10"
                      :max="delayFluctuation.max - 10"
                      :step="10"
                      size="small"
                      controls-position="right"
                    />
                    <span class="range-separator">~</span>
                    <el-input-number
                      v-model="delayFluctuation.max"
                      :min="delayFluctuation.min + 10"
                      :max="1000"
                      :step="10"
                      size="small"
                      controls-position="right"
                    />
                    <span class="unit">毫秒</span>
                  </div>
                </div>

                <div class="control-item">
                  <el-tooltip content="每次输出的字符数量范围" placement="right">
                    <label>字符数波动范围</label>
                  </el-tooltip>
                  <div class="range-inputs">
                    <el-input-number
                      v-model="charsFluctuation.min"
                      :min="1"
                      :max="charsFluctuation.max - 1"
                      :step="1"
                      size="small"
                      controls-position="right"
                    />
                    <span class="range-separator">~</span>
                    <el-input-number
                      v-model="charsFluctuation.max"
                      :min="charsFluctuation.min + 1"
                      :max="50"
                      :step="1"
                      size="small"
                      controls-position="right"
                    />
                    <span class="unit">字符</span>
                  </div>
                </div>
              </template>
            </template>
          </div>

          <!-- 文本输入区 -->
          <div class="control-section text-input-section">
            <label class="control-label">Markdown 内容</label>
            <el-input
              v-model="inputContent"
              type="textarea"
              placeholder="在此输入 Markdown 内容..."
              resize="none"
              class="markdown-input"
            />
          </div>
        </InfoCard>
      </div>

      <!-- 右侧渲染预览区 -->
      <div class="preview-panel">
        <InfoCard title="渲染预览" class="preview-card">
          <template #header-extra>
            <div class="render-stats" v-if="renderStats.totalChars > 0">
              <el-tag size="small" type="info">
                {{ renderStats.renderedChars }}/{{ renderStats.totalChars }} 字符
              </el-tag>
              <el-tag v-if="streamEnabled && isRendering" size="small" type="primary">
                {{ renderStats.speed.toFixed(0) }} 字符/秒
              </el-tag>
            </div>
          </template>

          <div class="render-container" ref="renderContainerRef">
            <RichTextRenderer
              v-if="currentContent || streamSource"
              :key="renderKey"
              :content="currentContent"
              :stream-source="streamSource"
            />
            <div v-else class="empty-placeholder">
              <el-empty description="暂无内容，请输入或选择预设后开始渲染" />
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, shallowRef, onMounted } from "vue";
import {
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
    RefreshRight,
    Loading,
    CopyDocument,
  } from "@element-plus/icons-vue";
  import InfoCard from "@/components/common/InfoCard.vue";
  import RichTextRenderer from "./RichTextRenderer.vue";
  import type { StreamSource } from "./types";
  import { presets } from "./presets";
  import { useRichTextRendererStore } from "./store";
  import { storeToRefs } from "pinia";
  import customMessage from "@/utils/customMessage";
// 使用 store 管理配置状态
const store = useRichTextRendererStore();
const {
  isInputCollapsed,
  selectedPreset,
  inputContent,
  streamEnabled,
  streamSpeed,
  initialDelay,
  fluctuationEnabled,
  delayFluctuation,
  charsFluctuation,
} = storeToRefs(store);

// 渲染状态
const isRendering = ref(false);
const currentContent = ref("");
const streamSource = shallowRef<StreamSource | undefined>(undefined);

// 渲染统计
const renderStats = reactive({
  totalChars: 0,
  renderedChars: 0,
  speed: 0,
  startTime: 0,
});

// 流式渲染控制器
let streamAbortController: AbortController | null = null;

// 渲染 key，用于强制重新挂载组件
const renderKey = ref(0);
const renderContainerRef = ref<HTMLDivElement | null>(null);

// 加载预设内容
const loadPreset = () => {
  const preset = presets.find((p) => p.id === selectedPreset.value);
  if (preset) {
    inputContent.value = preset.content;
  }
};

// 创建流式数据源
const createStreamSource = (content: string): StreamSource => {
  const subscribers: Array<(chunk: string) => void> = [];

  const subscribe = (callback: (chunk: string) => void) => {
    subscribers.push(callback);
    return () => {
      const index = subscribers.indexOf(callback);
      if (index > -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  // 启动流式输出
  const startStreaming = async () => {
    streamAbortController = new AbortController();
    const signal = streamAbortController.signal;

    // 初始延迟
    if (initialDelay.value > 0) {
      await new Promise((resolve) => setTimeout(resolve, initialDelay.value));
      if (signal.aborted) return;
    }

    const chars = content.split("");

    renderStats.totalChars = chars.length;
    renderStats.renderedChars = 0;
    renderStats.startTime = Date.now();

    if (fluctuationEnabled.value) {
      // 波动模式：使用随机延迟和字符数量
      let i = 0;
      while (i < chars.length) {
        if (signal.aborted) break;

        // 随机字符数量
        const randomChars = Math.floor(
          Math.random() * (charsFluctuation.value.max - charsFluctuation.value.min + 1) +
            charsFluctuation.value.min
        );
        const actualChars = Math.min(randomChars, chars.length - i);

        const chunk = chars.slice(i, i + actualChars).join("");
        subscribers.forEach((cb) => cb(chunk));

        i += actualChars;
        renderStats.renderedChars = i;
        const elapsed = (Date.now() - renderStats.startTime) / 1000;
        renderStats.speed = elapsed > 0 ? renderStats.renderedChars / elapsed : 0;

        if (i < chars.length) {
          // 随机延迟
          const randomDelay = Math.floor(
            Math.random() * (delayFluctuation.value.max - delayFluctuation.value.min + 1) +
              delayFluctuation.value.min
          );
          await new Promise((resolve) => setTimeout(resolve, randomDelay));
        }
      }
    } else {
      // 固定模式：使用固定速度
      const charsPerInterval = Math.max(1, Math.floor(streamSpeed.value / 10)); // 每100ms发送的字符数
      const intervalMs = 100;

      for (let i = 0; i < chars.length; i += charsPerInterval) {
        if (signal.aborted) break;

        const chunk = chars.slice(i, i + charsPerInterval).join("");
        subscribers.forEach((cb) => cb(chunk));

        renderStats.renderedChars = Math.min(i + charsPerInterval, chars.length);
        const elapsed = (Date.now() - renderStats.startTime) / 1000;
        renderStats.speed = elapsed > 0 ? renderStats.renderedChars / elapsed : 0;

        if (i + charsPerInterval < chars.length) {
          await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
      }
    }

    isRendering.value = false;
  };

  startStreaming();

  return { subscribe };
};

// 开始渲染
const startRender = () => {
  if (!inputContent.value.trim()) {
    return;
  }

  // 强制重新挂载组件
  renderKey.value++;
  isRendering.value = true;

  if (streamEnabled.value) {
    // 流式模式
    currentContent.value = "";
    streamSource.value = createStreamSource(inputContent.value);
  } else {
    // 立即渲染模式
    streamSource.value = undefined;
    currentContent.value = inputContent.value;
    renderStats.totalChars = inputContent.value.length;
    renderStats.renderedChars = inputContent.value.length;
    renderStats.speed = 0;
    isRendering.value = false;
  }
};

// 停止渲染
const stopRender = () => {
  if (streamAbortController) {
    streamAbortController.abort();
    streamAbortController = null;
  }
  isRendering.value = false;
};

// 清空输出
const clearOutput = () => {
  stopRender();
  currentContent.value = "";
  streamSource.value = undefined;
  renderStats.totalChars = 0;
  renderStats.renderedChars = 0;
  renderStats.speed = 0;
};

// 复制原文和渲染结果的对比
const copyComparison = async () => {
  if (!inputContent.value.trim()) {
    customMessage.warning("没有可复制的原文内容");
    return;
  }
  
  if (!renderContainerRef.value) {
    customMessage.warning("渲染容器不存在");
    return;
  }
  
  const htmlContent = renderContainerRef.value.innerHTML;
  if (!htmlContent.trim() || renderContainerRef.value.querySelector(".empty-placeholder")) {
    customMessage.warning("没有可复制的 HTML 内容");
    return;
  }

  // 提取渲染后的纯文本（去除HTML标签）
  const renderedText = renderContainerRef.value.textContent || "";
  
  // 构建测试配置信息
  let configInfo = `流式输出: ${streamEnabled.value ? '启用' : '禁用'}`;
  
  if (streamEnabled.value) {
    configInfo += `\n输出速度: ${streamSpeed.value} 字符/秒`;
    configInfo += `\n初始延迟: ${initialDelay.value} 毫秒`;
    configInfo += `\n波动模式: ${fluctuationEnabled.value ? '启用' : '禁用'}`;
    
    if (fluctuationEnabled.value) {
      configInfo += `\n延迟波动范围: ${delayFluctuation.value.min}~${delayFluctuation.value.max} 毫秒`;
      configInfo += `\n字符数波动范围: ${charsFluctuation.value.min}~${charsFluctuation.value.max} 字符`;
    }
  }
  
  if (selectedPreset.value) {
    const preset = presets.find(p => p.id === selectedPreset.value);
    if (preset) {
      configInfo += `\n预设内容: ${preset.name}`;
    }
  }
  
  // 构建对比内容
  const comparisonText = `========== 测试配置 ==========
${configInfo}

========== Markdown 原文 ==========
${inputContent.value}

========== 渲染后的 HTML ==========
${htmlContent}

========== 渲染后的纯文本 ==========
${renderedText}

========== 对比信息 ==========
原文字符数: ${inputContent.value.length}
渲染文本字符数: ${renderedText.length}
HTML 完整字符数: ${htmlContent.length}
渲染时间: ${new Date().toLocaleString('zh-CN')}
=============================
`;

  try {
    await navigator.clipboard.writeText(comparisonText);
    customMessage.success("原文和 HTML 对比内容已复制到剪贴板");
  } catch (err) {
    customMessage.error("复制失败，请检查浏览器权限");
    console.error("Failed to copy comparison:", err);
  }
};

// 组件挂载时加载配置
onMounted(async () => {
  await store.loadConfig();
});
</script>

<style scoped>
.rich-text-renderer-tester {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 顶部卡片 */
.header-card {
  margin-bottom: 16px;
  flex-shrink: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
}

.header-card :deep(.el-card__body) {
  padding: 12px 20px;
}

.header-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.page-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
}

/* 主容器 */
.tester-container {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
  min-height: 0;
}

/* 输入面板 */
.input-panel {
  width: 450px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.input-card {
  height: 100%;
}

.input-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

/* 预览面板 */
.preview-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.preview-card {
  height: 100%;
}

.preview-card :deep(.el-card__body) {
  height: calc(100% - 60px);
  padding: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 控制区域 */
.control-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.control-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.control-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.control-item {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.control-item label {
  font-size: 13px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

.slider-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
}

.slider-wrapper :deep(.el-slider) {
  flex: 1;
}

.unit {
  font-size: 12px;
  color: var(--text-color-light);
  white-space: nowrap;
  min-width: 60px;
}

/* 范围输入 */
.range-inputs {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-inputs :deep(.el-input-number) {
  width: 100px;
}

.range-separator {
  font-size: 14px;
  color: var(--text-color-secondary);
  font-weight: 500;
}

/* 文本输入区 */
.text-input-section {
  flex: 1;
  min-height: 200px;
  display: flex;
  flex-direction: column;
}

.markdown-input {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.markdown-input :deep(.el-textarea) {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.markdown-input :deep(.el-textarea__inner) {
  flex: 1;
  height: 100% !important;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  background-color: var(--input-bg);
  color: var(--text-color);
}

/* 渲染统计 */
.render-stats {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 渲染容器 */
.render-container {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-color);
}

.empty-placeholder {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Loading 图标动画 */
.is-loading {
  animation: rotating 2s linear infinite;
}

@keyframes rotating {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 响应式调整 */
@media (max-width: 1200px) {
  .input-panel {
    width: 400px;
  }
}

@media (max-width: 768px) {
  .rich-text-renderer-tester {
    padding: 12px;
  }

  .tester-container {
    flex-direction: column;
  }

  .input-panel {
    width: 100%;
    height: 400px;
    margin-bottom: 16px;
  }
}
</style>
