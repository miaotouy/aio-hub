<template>
  <div
    ref="containerRef"
    class="rich-text-renderer-tester"
    :class="{ 'is-narrow': isNarrow, 'is-mobile': isMobile }"
  >
    <div class="tester-layout">
      <!-- 左侧配置栏 -->
      <aside v-show="!isConfigCollapsed" class="config-sidebar">
        <InfoCard title="渲染配置" class="config-card">
          <!-- 渲染器版本选择 -->
          <div class="control-section">
            <label class="control-label">渲染器版本</label>
            <el-select v-model="rendererVersion" style="width: 100%">
              <el-option
                v-for="versionMeta in enabledVersions"
                :key="versionMeta.version"
                :label="versionMeta.name"
                :value="versionMeta.version"
                :title="versionMeta.description"
              >
                <div class="version-option">
                  <span>{{ versionMeta.name }}</span>
                  <el-tag
                    v-for="tag in versionMeta.tags"
                    :key="tag"
                    size="small"
                    :type="tag === '基础' ? 'success' : tag === '高级' ? 'warning' : 'info'"
                    style="margin-left: 4px"
                  >
                    {{ tag }}
                  </el-tag>
                </div>
              </el-option>
            </el-select>
          </div>

          <!-- HTML 渲染控制 -->
          <div class="control-section">
            <div class="control-header">
              <label class="control-label">HTML 预览</label>
              <el-tooltip content="开启后，HTML 代码块将默认以预览模式显示" placement="left">
                <el-switch v-model="defaultRenderHtml" />
              </el-tooltip>
            </div>
          </div>

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
                <div class="control-header">
                  <el-tooltip
                    content="开启后，输入框将实时显示流式生成的内容（打字机效果）"
                    placement="right"
                  >
                    <label>同步输入进度</label>
                  </el-tooltip>
                  <el-switch v-model="syncInputProgress" size="small" />
                </div>
              </div>

              <!-- 分词器选择 -->
              <div class="control-item">
                <el-tooltip content="选择用于分词的模型，影响 token 分隔的准确性" placement="right">
                  <label>分词器</label>
                </el-tooltip>
                <el-select v-model="selectedTokenizer" size="small" style="width: 100%">
                  <el-option
                    v-for="tokenizer in availableTokenizers"
                    :key="tokenizer.name"
                    :label="tokenizer.description"
                    :value="tokenizer.name"
                  />
                </el-select>
              </div>

              <div class="control-item">
                <el-tooltip content="控制流式输出的速度，数值越大输出越快" placement="right">
                  <label>输出速度</label>
                </el-tooltip>
                <div class="slider-wrapper">
                  <el-slider
                    v-model="streamSpeed"
                    :min="1"
                    :max="500"
                    :step="5"
                    show-input
                    :input-size="'small'"
                  />
                  <span class="unit">token/秒</span>
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
                    :max="2000"
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
                  <el-tooltip content="每次输出的 token 数量范围" placement="right">
                    <label>Token 数波动范围</label>
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
                    <span class="unit">token</span>
                  </div>
                </div>
              </template>
            </template>
          </div>

          <!-- 元数据模拟 -->
          <div class="control-section">
            <div class="control-header">
              <el-tooltip
                content="模拟生成元数据（如开始时间等），用于测试计时功能"
                placement="right"
              >
                <label class="control-label">元数据模拟</label>
              </el-tooltip>
              <el-switch v-model="simulateMeta" />
            </div>

            <template v-if="simulateMeta">
              <div class="control-item">
                <label>模拟项</label>
                <div style="font-size: 12px; color: var(--text-color-secondary)">
                  将在流式开始时自动注入 requestStartTime，结束时注入 requestEndTime。
                </div>
              </div>
            </template>
          </div>

          <!-- LLM 思考块规则配置 -->
          <div class="control-section">
            <LlmThinkRulesEditor v-model="llmThinkRules" />
          </div>
        </InfoCard>
      </aside>

      <!-- 右侧工作区 -->
      <main class="workspace-container" ref="workspaceRef">
        <!-- 工作区工具栏 -->
        <div class="workspace-toolbar">
          <div class="toolbar-left">
            <!-- 侧边栏折叠按钮 -->
            <el-tooltip
              :content="isConfigCollapsed ? '展开配置栏' : '折叠配置栏'"
              placement="bottom"
            >
              <el-button
                :icon="isConfigCollapsed ? DArrowRight : DArrowLeft"
                @click="isConfigCollapsed = !isConfigCollapsed"
                size="small"
              />
            </el-tooltip>

            <!-- 样式配置按钮 -->
            <el-tooltip content="配置 Markdown 渲染样式" placement="bottom">
              <el-button :icon="Brush" @click="openStyleEditor" size="small" />
            </el-tooltip>

            <!-- 渲染状态标签 -->
            <el-tag v-if="isRendering" type="primary" effect="dark" size="small">
              <el-icon class="is-loading"><Loading /></el-icon>
              渲染中...
            </el-tag>

            <!-- 三状态布局切换 -->
            <el-divider direction="vertical" />
            <el-radio-group v-model="layoutMode" size="small">
              <el-radio-button value="split">分栏</el-radio-button>
              <el-radio-button value="input-only">仅输入</el-radio-button>
              <el-radio-button value="preview-only">仅预览</el-radio-button>
            </el-radio-group>
          </div>

          <div class="toolbar-right">
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
                size="small"
              >
                {{ isRendering ? "停止" : streamEnabled ? "流式渲染" : "立即渲染" }}
              </el-button>
            </el-tooltip>
            <el-tooltip
              :content="
                syncInputProgress && cachedInputContent ? '清空输出并重置输入内容' : '清空渲染输出'
              "
              placement="bottom"
            >
              <el-button
                :icon="RefreshRight"
                @click="clearOutput"
                :disabled="!currentContent && !streamSource && !cachedInputContent"
                size="small"
              >
                {{ syncInputProgress && cachedInputContent ? "重置" : "清空" }}
              </el-button>
            </el-tooltip>
            <el-button-group>
              <el-tooltip content="复制原文和渲染后的 HTML" placement="bottom">
                <el-button
                  :icon="CopyDocument"
                  @click="copyComparison"
                  :disabled="!inputContent.trim() || (!currentContent && !streamSource)"
                  size="small"
                >
                  复制对比
                </el-button>
              </el-tooltip>
              <el-popover placement="bottom" :width="220" trigger="click">
                <template #reference>
                  <el-button :icon="Setting" size="small" />
                </template>
                <div class="copy-options">
                  <div class="option-header">复制内容配置</div>
                  <el-checkbox v-model="copyOptions.includeConfig">测试配置</el-checkbox>
                  <el-checkbox v-model="copyOptions.includeOriginal">Markdown 原文</el-checkbox>
                  <el-checkbox v-model="copyOptions.includeHtml">渲染后的 HTML</el-checkbox>
                  <el-checkbox v-model="copyOptions.includeNormalizedOriginal"
                    >规范化后的原文</el-checkbox
                  >
                  <el-checkbox v-model="copyOptions.includeNormalizedRendered"
                    >规范化后的渲染文本</el-checkbox
                  >
                  <el-checkbox v-model="copyOptions.includeComparison">对比信息</el-checkbox>
                  <el-checkbox v-model="copyOptions.includeStyleConfig">MD 样式配置</el-checkbox>
                </div>
              </el-popover>
            </el-button-group>
          </div>
        </div>

        <!-- 工作区内容 -->
        <div class="workspace-content" :class="[layoutMode, { 'is-compact': isWorkspaceCompact }]">
          <!-- 输入区 -->
          <div v-show="layoutMode === 'split' || layoutMode === 'input-only'" class="input-area">
            <div class="area-header">
              <h4>Markdown 内容</h4>
            </div>
            <el-input
              ref="inputRef"
              v-model="inputContent"
              type="textarea"
              placeholder="在此输入 Markdown 内容..."
              resize="none"
              class="markdown-input"
              :readonly="isRendering && syncInputProgress"
            />
          </div>

          <!-- 预览区 -->
          <div
            v-show="layoutMode === 'split' || layoutMode === 'preview-only'"
            class="preview-area"
          >
            <div class="area-header">
              <h4>渲染预览</h4>
              <div class="preview-header-controls">
                <div class="render-stats" v-if="renderStats.totalTokens > 0">
                  <el-tag size="small" type="info">
                    {{ renderStats.renderedTokens }}/{{ renderStats.totalTokens }} token
                  </el-tag>
                  <el-tag
                    v-if="streamEnabled && renderStats.speed > 0"
                    size="small"
                    :type="isRendering ? 'primary' : 'info'"
                  >
                    {{ renderStats.speed.toFixed(1) }} token/秒
                  </el-tag>
                  <el-tag
                    v-if="renderStats.elapsedTime > 0"
                    size="small"
                    :type="isRendering ? 'warning' : 'info'"
                  >
                    {{ formatElapsedTime(renderStats.elapsedTime) }}
                  </el-tag>
                  <el-tag size="small" type="success">{{ renderStats.totalChars }} 字符 </el-tag>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip content="渲染时自动滚动到底部" placement="top">
                    <el-switch v-model="autoScroll" size="small" />
                  </el-tooltip>
                  <span>自动滚动</span>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip content="可视化稳定区和待定区" placement="top">
                    <el-switch v-model="visualizeBlockStatus" size="small" />
                  </el-tooltip>
                  <span>可视化块状态</span>
                </div>
              </div>
            </div>
            <div
              class="render-container"
              :class="{ 'visualize-block-status': visualizeBlockStatus }"
              ref="renderContainerRef"
            >
              <RichTextRenderer
                v-if="currentContent || streamSource"
                :key="renderKey"
                :content="currentContent"
                :stream-source="streamSource"
                :version="rendererVersion"
                :default-render-html="defaultRenderHtml"
                :llm-think-rules="llmThinkRules"
                :style-options="richTextStyleOptions"
                :generation-meta="simulateMeta ? generationMeta : undefined"
              />
              <div v-else class="empty-placeholder">
                <el-empty description="暂无内容，请输入或选择预设后开始渲染" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 样式配置弹窗 -->
    <BaseDialog v-model="isStyleEditorVisible" title="Markdown 样式配置" width="80vw" height="70vh">
      <MarkdownStyleEditor v-model="richTextStyleOptions" :loading="isStyleLoading" />
      <template #footer>
        <el-button type="primary" @click="isStyleEditorVisible = false">完成</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, shallowRef, onMounted, watch, nextTick, computed } from "vue";
import { useElementSize } from "@vueuse/core";
import {
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
  RefreshRight,
  Loading,
  CopyDocument,
  Brush,
  Setting,
} from "@element-plus/icons-vue";
import RichTextRenderer from "./RichTextRenderer.vue";
import type { StreamSource } from "./types";
import { presets } from "./presets";
import { useRichTextRendererStore, availableVersions } from "./store";
import { storeToRefs } from "pinia";
import customMessage from "@/utils/customMessage";
import LlmThinkRulesEditor from "./components/LlmThinkRulesEditor.vue";
import MarkdownStyleEditor from "./components/style-editor/MarkdownStyleEditor.vue";
import InfoCard from "@/components/common/InfoCard.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";

// 容器尺寸检测
const containerRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<any>(null);
const { width: containerWidth } = useElementSize(containerRef);
const isNarrow = computed(() => containerWidth.value < 1200);
const isMobile = computed(() => containerWidth.value < 768);

// 工作区尺寸检测
const workspaceRef = ref<HTMLElement | null>(null);
const { width: workspaceWidth } = useElementSize(workspaceRef);
// 当工作区宽度小于 800px 时，认为是紧凑模式，强制垂直排列
const isWorkspaceCompact = computed(() => workspaceWidth.value < 800);

// 使用 store 管理配置状态
const store = useRichTextRendererStore();
const {
  selectedPreset,
  inputContent,
  streamEnabled,
  syncInputProgress,
  streamSpeed,
  initialDelay,
  fluctuationEnabled,
  delayFluctuation,
  charsFluctuation,
  autoScroll,
  visualizeBlockStatus,
  rendererVersion,
  defaultRenderHtml,
  llmThinkRules,
  richTextStyleOptions,
  copyOptions,
} = storeToRefs(store);

// 新的布局状态
const isConfigCollapsed = ref(false);
const layoutMode = ref<"split" | "input-only" | "preview-only">("split");

// 样式编辑器显示状态
const isStyleEditorVisible = ref(false);
const isStyleLoading = ref(false);

const openStyleEditor = () => {
  isStyleLoading.value = true;
  isStyleEditorVisible.value = true;
  // 延迟关闭 loading，确保弹窗动画流畅，且骨架屏能展示出来
  setTimeout(() => {
    isStyleLoading.value = false;
  }, 300);
};

// Token 流式控制
const selectedTokenizer = ref("gpt4o");
const availableTokenizers = tokenCalculatorEngine.getAvailableTokenizers();

// 获取可用的渲染器版本列表（过滤掉未启用的）
const enabledVersions = computed(() => availableVersions.filter((v) => v.enabled));

// 渲染状态
const isRendering = ref(false);
const currentContent = ref("");
const streamSource = shallowRef<StreamSource | undefined>(undefined);

// 模拟的元数据
const simulateMeta = ref(false);
const generationMeta = reactive<{
  requestStartTime?: number;
  firstTokenTime?: number;
  reasoningStartTime?: number;
  reasoningEndTime?: number;
  requestEndTime?: number;
  tokensPerSecond?: number;
  modelId?: string;
}>({});

// 渲染统计
const renderStats = reactive({
  totalChars: 0,
  totalTokens: 0,
  renderedTokens: 0,
  speed: 0,
  startTime: 0,
  elapsedTime: 0,
});

// 格式化耗时显示
const formatElapsedTime = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  } else if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    const minutes = Math.floor(ms / 60000);
    const seconds = ((ms % 60000) / 1000).toFixed(0);
    return `${minutes}m ${seconds}s`;
  }
};

// 流式渲染控制器
let streamAbortController: AbortController | null = null;
let inputSyncUnsubscribe: (() => void) | null = null;

// 计时器
let elapsedTimer: number | null = null;

// 渲染 key，用于强制重新挂载组件
const renderKey = ref(0);
const renderContainerRef = ref<HTMLDivElement | null>(null);

// 缓存的输入内容（用于同步模式下的重置）
const cachedInputContent = ref("");

// 加载预设内容
const loadPreset = () => {
  const preset = presets.find((p) => p.id === selectedPreset.value);
  if (preset) {
    inputContent.value = preset.content;
  }
};

// 创建流式数据源（基于 token）
const createStreamSource = (content: string): StreamSource => {
  const subscribers: Array<(chunk: string) => void> = [];
  const completeSubscribers: Array<() => void> = [];

  const subscribe = (callback: (chunk: string) => void) => {
    subscribers.push(callback);
    return () => {
      const index = subscribers.indexOf(callback);
      if (index > -1) {
        subscribers.splice(index, 1);
      }
    };
  };

  const onComplete = (callback: () => void) => {
    completeSubscribers.push(callback);
    return () => {
      const index = completeSubscribers.indexOf(callback);
      if (index > -1) {
        completeSubscribers.splice(index, 1);
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

    renderStats.totalChars = content.length;
    renderStats.startTime = Date.now();
    renderStats.elapsedTime = 0;

    // 初始化元数据
    if (simulateMeta.value) {
      generationMeta.requestStartTime = renderStats.startTime;
      generationMeta.modelId = "test-model-v1";
      // 清理旧的结束时间
      generationMeta.requestEndTime = undefined;
      generationMeta.reasoningEndTime = undefined;
      generationMeta.firstTokenTime = undefined;
    } else {
      // 如果不模拟，清空 meta
      Object.keys(generationMeta).forEach((key) => {
        delete (generationMeta as any)[key];
      });
    }

    // 启动计时器，每100ms更新一次耗时
    elapsedTimer = window.setInterval(() => {
      renderStats.elapsedTime = Date.now() - renderStats.startTime;
    }, 100);

    try {
      // 使用分词器获取 token 列表
      const tokenized = await tokenCalculatorEngine.getTokenizedText(
        content,
        selectedTokenizer.value,
        true // 使用分词器名称
      );

      if (!tokenized || !tokenized.tokens.length) {
        // 如果分词失败，降级为字符流
        console.warn("Token分词失败，降级为字符流");
        const chars = content.split("");
        renderStats.totalTokens = chars.length;
        renderStats.renderedTokens = 0;

        for (let i = 0; i < chars.length; i++) {
          if (signal.aborted) break;

          // 模拟 firstTokenTime
          if (simulateMeta.value && i === 0) {
            generationMeta.firstTokenTime = Date.now();
          }

          subscribers.forEach((cb) => cb(chars[i]));
          renderStats.renderedTokens = i + 1;

          const elapsed = (Date.now() - renderStats.startTime) / 1000;
          renderStats.speed = elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

          // 固定延迟
          const delay = 1000 / streamSpeed.value;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } else {
        // 使用 token 流式输出（基于字符索引而不是直接拼接token字符串）
        const tokens = tokenized.tokens;
        renderStats.totalTokens = tokens.length;
        renderStats.renderedTokens = 0;

        // 计算每个token对应的字符位置
        let charIndex = 0;
        const tokenCharPositions: number[] = [0]; // 每个token开始的字符位置

        for (let i = 0; i < tokens.length; i++) {
          charIndex += tokens[i].length;
          tokenCharPositions.push(charIndex);
        }

        if (fluctuationEnabled.value) {
          // 波动模式：保持目标速度，但让发包节奏和大小产生波动
          let tokenIndex = 0;
          let lastCharIndex = 0;
          let accumulatedDebt = 0; // 累计的时间偏差（用于速度补偿）

          while (tokenIndex < tokens.length) {
            if (signal.aborted) break;

            // 模拟 firstTokenTime
            if (simulateMeta.value && tokenIndex === 0) {
              generationMeta.firstTokenTime = Date.now();
            }

            // 随机 token 数量（在设定范围内波动）
            const randomTokens = Math.floor(
              Math.random() * (charsFluctuation.value.max - charsFluctuation.value.min + 1) +
                charsFluctuation.value.min
            );
            const actualTokens = Math.min(randomTokens, tokens.length - tokenIndex);

            // 根据token边界从原文中截取字符
            const endCharIndex = tokenCharPositions[tokenIndex + actualTokens];
            const chunk = content.substring(lastCharIndex, endCharIndex);
            subscribers.forEach((cb) => cb(chunk));

            tokenIndex += actualTokens;
            lastCharIndex = endCharIndex;
            renderStats.renderedTokens = tokenIndex;

            const elapsed = (Date.now() - renderStats.startTime) / 1000;
            renderStats.speed = elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

            if (tokenIndex < tokens.length) {
              // 理论上应该花费的时间（基于目标速度）
              const idealDelay = (actualTokens / streamSpeed.value) * 1000;

              // 随机延迟（在波动范围内）
              const randomDelay = Math.floor(
                Math.random() * (delayFluctuation.value.max - delayFluctuation.value.min + 1) +
                  delayFluctuation.value.min
              );

              // 计算本次实际应该延迟的时间（考虑累计偏差进行补偿）
              // 如果之前延迟过长，这次就缩短；如果之前过短，这次就延长
              const compensatedDelay = Math.max(1, randomDelay - accumulatedDebt);

              // 更新累计偏差：实际延迟 - 理想延迟
              accumulatedDebt += compensatedDelay - idealDelay;

              await new Promise((resolve) => setTimeout(resolve, compensatedDelay));
            }
          }
        } else {
          // 固定模式：使用固定的 token 速度
          const tokensPerInterval = Math.max(1, Math.floor(streamSpeed.value / 10)); // 每100ms发送的token数
          const intervalMs = 100;

          let lastCharIndex = 0;
          for (let tokenIndex = 0; tokenIndex < tokens.length; tokenIndex += tokensPerInterval) {
            if (signal.aborted) break;

            // 模拟 firstTokenTime
            if (simulateMeta.value && tokenIndex === 0) {
              generationMeta.firstTokenTime = Date.now();
            }

            const actualTokens = Math.min(tokensPerInterval, tokens.length - tokenIndex);
            const endCharIndex = tokenCharPositions[tokenIndex + actualTokens];
            const chunk = content.substring(lastCharIndex, endCharIndex);
            subscribers.forEach((cb) => cb(chunk));

            lastCharIndex = endCharIndex;
            renderStats.renderedTokens = Math.min(tokenIndex + tokensPerInterval, tokens.length);

            const elapsed = (Date.now() - renderStats.startTime) / 1000;
            renderStats.speed = elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

            if (tokenIndex + tokensPerInterval < tokens.length) {
              await new Promise((resolve) => setTimeout(resolve, intervalMs));
            }
          }
        }
      }
    } catch (error) {
      console.error("流式输出错误:", error);
    }

    // 停止计时器
    if (elapsedTimer !== null) {
      clearInterval(elapsedTimer);
      elapsedTimer = null;
    }
    // 最后更新一次耗时
    renderStats.elapsedTime = Date.now() - renderStats.startTime;

    // 模拟结束时间
    if (simulateMeta.value) {
      generationMeta.requestEndTime = Date.now();
      // 计算 TPS
      if (generationMeta.requestStartTime) {
        const durationSeconds =
          (generationMeta.requestEndTime - generationMeta.requestStartTime) / 1000;
        if (durationSeconds > 0) {
          generationMeta.tokensPerSecond = renderStats.totalTokens / durationSeconds;
        }
      }
    }

    isRendering.value = false;
    // 通知订阅者流已完成
    completeSubscribers.forEach((cb) => cb());
  };

  startStreaming();

  return { subscribe, onComplete };
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
    const fullContent = inputContent.value;
    currentContent.value = "";

    if (syncInputProgress.value) {
      cachedInputContent.value = fullContent;
      inputContent.value = "";
    }

    const source = createStreamSource(fullContent);
    streamSource.value = source;

    if (syncInputProgress.value) {
      inputSyncUnsubscribe = source.subscribe((chunk) => {
        inputContent.value += chunk;
      });
    }
  } else {
    // 立即渲染模式
    streamSource.value = undefined;
    currentContent.value = inputContent.value;
    renderStats.totalChars = inputContent.value.length;
    renderStats.totalTokens = 0;
    renderStats.renderedTokens = 0;
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
  if (inputSyncUnsubscribe) {
    inputSyncUnsubscribe();
    inputSyncUnsubscribe = null;
  }
  // 停止计时器
  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  isRendering.value = false;
};

// 清空输出
const clearOutput = () => {
  stopRender();

  // 如果有缓存的内容，恢复输入
  if (syncInputProgress.value && cachedInputContent.value) {
    inputContent.value = cachedInputContent.value;
    cachedInputContent.value = "";
  }

  currentContent.value = "";
  streamSource.value = undefined;
  renderStats.totalChars = 0;
  renderStats.totalTokens = 0;
  renderStats.renderedTokens = 0;
  renderStats.speed = 0;
  renderStats.elapsedTime = 0;
};

// 净化 Markdown 文本为纯文本
const stripMarkdown = (markdown: string): string => {
  // 创建一个临时 div 元素用于处理 HTML 实体
  const tempDiv = document.createElement("div");

  let text = markdown;

  // 移除代码块
  text = text.replace(/```[\s\S]*?```/g, "");

  // 移除行内代码
  text = text.replace(/`[^`]+`/g, (match) => match.slice(1, -1));

  // 移除标题标记
  text = text.replace(/^#{1,6}\s+/gm, "");

  // 移除粗体和斜体
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");

  // 移除删除线
  text = text.replace(/~~(.*?)~~/g, "$1");

  // 移除链接，保留文本
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // 移除图片
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");

  // 移除引用标记
  text = text.replace(/^>\s+/gm, "");

  // 移除列表标记
  text = text.replace(/^[\*\-\+]\s+/gm, "");
  text = text.replace(/^\d+\.\s+/gm, "");

  // 移除水平线
  text = text.replace(/^(\*{3,}|-{3,}|_{3,})$/gm, "");

  // 移除可能存在的 HTML 标签
  tempDiv.innerHTML = text;
  text = tempDiv.textContent || tempDiv.innerText || "";

  return text.trim();
};

// 规范化空白字符（用于对比）
const normalizeWhitespace = (text: string): string => {
  return text
    .replace(/\r\n/g, "\n") // 统一换行符
    .replace(/\s+/g, " ") // 将所有连续空白字符（包括换行）合并为一个空格
    .replace(/^\s+|\s+$/g, "") // 移除首尾空白
    .trim();
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

  // 净化原文为纯文本
  const cleanedInput = stripMarkdown(inputContent.value);

  // 规范化后的文本（用于准确对比）
  const normalizedInput = normalizeWhitespace(cleanedInput);
  const normalizedRendered = normalizeWhitespace(renderedText);

  // 构建测试配置信息
  let configInfo = `渲染器版本: ${rendererVersion.value}`;
  configInfo += `\n流式输出: ${streamEnabled.value ? "启用" : "禁用"}`;

  if (streamEnabled.value) {
    configInfo += `\n分词器: ${selectedTokenizer.value}`;
    configInfo += `\n输出速度: ${streamSpeed.value} token/秒`;
    configInfo += `\n初始延迟: ${initialDelay.value} 毫秒`;
    configInfo += `\n波动模式: ${fluctuationEnabled.value ? "启用" : "禁用"}`;

    if (fluctuationEnabled.value) {
      configInfo += `\n延迟波动范围: ${delayFluctuation.value.min}~${delayFluctuation.value.max} 毫秒`;
      configInfo += `\nToken 数波动范围: ${charsFluctuation.value.min}~${charsFluctuation.value.max} token`;
    }
  }

  if (selectedPreset.value) {
    const preset = presets.find((p) => p.id === selectedPreset.value);
    if (preset) {
      configInfo += `\n预设内容: ${preset.name}`;
    }
  }

  // 计算差异
  const rawDiff = Math.abs(cleanedInput.length - renderedText.length);
  const normalizedDiff = Math.abs(normalizedInput.length - normalizedRendered.length);
  const isMatched = normalizedDiff === 0;

  // 构建对比内容
  let comparisonText = "";

  if (copyOptions.value.includeConfig) {
    comparisonText += `========== 测试配置 ==========
${configInfo}

`;
  }

  if (copyOptions.value.includeStyleConfig) {
    const styles = richTextStyleOptions.value;
    const enabledStyles: Record<string, unknown> = {};

    // 首先检查并包含总开关的状态
    if (typeof styles.globalEnabled === "boolean") {
      enabledStyles.globalEnabled = styles.globalEnabled;
    }

    // 只有在总开关启用时，才检查并包含其他启用的样式项
    // 如果 globalEnabled 未定义，则默认为启用
    if (styles.globalEnabled !== false) {
      for (const [key, value] of Object.entries(styles)) {
        if (key === "globalEnabled") continue; // 跳过已处理的总开关

        // 检查是否为带有 enabled: true 的样式对象
        if (typeof value === "object" && value !== null && "enabled" in value && value.enabled) {
          enabledStyles[key] = value;
        }
      }
    }

    comparisonText += `========== Markdown 样式配置 ==========
${JSON.stringify(enabledStyles, null, 2)}

`;
  }

  if (copyOptions.value.includeOriginal) {
    comparisonText += `========== Markdown 原文 ==========
${inputContent.value}

`;
  }

  if (copyOptions.value.includeHtml) {
    comparisonText += `========== 渲染后的 HTML ==========
${htmlContent}

`;
  }

  if (copyOptions.value.includeNormalizedOriginal) {
    comparisonText += `========== 规范化后的原文 ==========
${normalizedInput}

`;
  }

  if (copyOptions.value.includeNormalizedRendered) {
    comparisonText += `========== 规范化后的渲染文本 ==========
${normalizedRendered}

`;
  }

  if (copyOptions.value.includeComparison) {
    comparisonText += `========== 对比信息 ==========
原文字符数（带标记）: ${inputContent.value.length}
原文字符数（纯文本）: ${cleanedInput.length}
渲染文本字符数: ${renderedText.length}
字符差异（保留空白）: ${rawDiff}
---
规范化后原文字符数: ${normalizedInput.length}
规范化后渲染字符数: ${normalizedRendered.length}
字符差异（规范化后）: ${normalizedDiff}
文本匹配: ${isMatched ? "✅ 完全匹配" : "❌ 不匹配"}
---
HTML 完整字符数: ${htmlContent.length}
渲染时间: ${new Date().toLocaleString("zh-CN")}
=============================
`;
  }

  try {
    await navigator.clipboard.writeText(comparisonText);
    customMessage.success("原文和 HTML 对比内容已复制到剪贴板");
  } catch (err) {
    customMessage.error("复制失败，请检查浏览器权限");
    console.error("Failed to copy comparison:", err);
  }
};

// 自动滚动到底部
const scrollToBottom = () => {
  if (autoScroll.value) {
    nextTick(() => {
      // 预览区滚动
      if (renderContainerRef.value) {
        renderContainerRef.value.scrollTop = renderContainerRef.value.scrollHeight;
      }

      // 输入区滚动 (仅在同步输入进度开启时)
      if (syncInputProgress.value && inputRef.value) {
        const textarea = inputRef.value.textarea;
        if (textarea) {
          textarea.scrollTop = textarea.scrollHeight;
        }
      }
    });
  }
};

// 监听渲染进度，自动滚动
watch(
  () => renderStats.renderedTokens,
  () => {
    if (isRendering.value) {
      scrollToBottom();
    }
  }
);

// 组件挂载时加载配置
onMounted(async () => {
  isStyleLoading.value = true;
  try {
    await store.loadConfig();
  } finally {
    // 稍微延迟一点，让骨架屏展示一下，避免闪烁
    setTimeout(() => {
      isStyleLoading.value = false;
    }, 500);
  }
});
</script>

<style scoped>
/* 可视化样式 */
.preview-header-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

.visualizer-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.render-container.visualize-block-status :deep([data-node-status]) {
  position: relative;
}

.render-container.visualize-block-status :deep([data-node-status]::before) {
  content: attr(data-node-status);
  position: absolute;
  top: -12px;
  left: 0;
  padding: 1px 4px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: bold;
  text-transform: uppercase;
  z-index: 10;
  opacity: 0.7;
}

.render-container.visualize-block-status :deep([data-node-status="stable"]::before) {
  background-color: #67c23a; /* Element Plus Success color */
  color: white;
}

.render-container.visualize-block-status :deep([data-node-status="pending"]::before) {
  background-color: #e6a23c; /* Element Plus Warning color */
  color: white;
}

.rich-text-renderer-tester {
  padding: 20px;
  height: 100%;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 新布局系统 */
.tester-layout {
  flex: 1;
  display: flex;
  gap: 16px;
  overflow: hidden;
  min-height: 0;
}

/* 配置侧边栏 */
.config-sidebar {
  width: 400px;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
}

.config-card {
  height: 100%;
}

.config-card :deep(.info-card-body) {
  height: calc(100% - 50px);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}

/* 工作区 */
.workspace-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

/* 工作区工具栏 */
.workspace-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* 工作区内容 */
.workspace-content {
  flex: 1;
  display: flex;
  overflow: hidden;
  min-height: 0;
}

/* Split 模式 */
.workspace-content.split {
  gap: 0;
  padding: 0;
}

.workspace-content.split .input-area,
.workspace-content.split .preview-area {
  flex: 1;
  min-width: 0;
}

/* Split 模式下的分割线 */
.workspace-content.split .input-area {
  border-right: 1px solid var(--border-color);
}

/* 工作区紧凑模式（宽度不足时自动垂直排列） */
.workspace-content.split.is-compact {
  flex-direction: column;
}

.workspace-content.split.is-compact .input-area {
  border-right: none;
  border-bottom: 1px solid var(--border-color);
}

/* 单一视图模式 */
.workspace-content.input-only,
.workspace-content.preview-only {
  padding: 0;
}

.workspace-content.input-only .input-area,
.workspace-content.preview-only .preview-area {
  flex: 1;
  width: 100%;
}

/* 输入区和预览区 */
.input-area,
.preview-area {
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  /* 移除独立边框和圆角，实现无缝融合 */
  border: none;
  border-radius: 0;
  overflow: hidden;
}

.area-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px; /*稍微减小一点高度，更紧凑 */
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  flex-shrink: 0;
}

.area-header h4 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
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
.markdown-input {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.markdown-input :deep(.el-textarea) {
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.markdown-input :deep(.el-textarea__inner) {
  flex: 1;
  height: 100% !important;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  background-color: var(--input-bg);
  color: var(--text-color);
  border: none;
}

/* 渲染统计 */
.render-stats {
  display: flex;
  gap: 8px;
  align-items: center;
}

.version-option {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
}

.version-option span:first-child {
  flex: 1;
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

.copy-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.option-header {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
}

.copy-options :deep(.el-checkbox) {
  margin-right: 0;
  height: 24px;
}

/* 容器查询式响应式调整 */
.rich-text-renderer-tester.is-narrow .config-sidebar {
  width: 350px;
}

.rich-text-renderer-tester.is-mobile {
  padding: 12px;
}

.rich-text-renderer-tester.is-mobile .tester-layout {
  flex-direction: column;
}

.rich-text-renderer-tester.is-mobile .config-sidebar {
  width: 100%;
  height: 400px;
}

.rich-text-renderer-tester.is-mobile .workspace-content.split {
  flex-direction: column;
}
</style>
