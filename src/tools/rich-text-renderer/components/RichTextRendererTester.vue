<template>
  <div
    ref="containerRef"
    class="rich-text-renderer-tester"
    :class="{ 'is-narrow': isNarrow, 'is-mobile': isMobile }"
  >
    <div class="tester-layout">
      <!-- 左侧配置栏 -->
      <TesterConfigSidebar
        v-show="!isConfigCollapsed"
        v-model:selectedTokenizer="selectedTokenizer"
        v-model:simulateMeta="simulateMeta"
      />

      <!-- 右侧工作区 -->
      <main class="workspace-container" ref="workspaceRef">
        <!-- 工作区工具栏 -->
        <TesterToolbar
          v-model:isConfigCollapsed="isConfigCollapsed"
          v-model:layoutMode="layoutMode"
          :is-rendering="isRendering"
          :current-content="currentContent"
          :stream-source="streamSource"
          :cached-input-content="cachedInputContent"
          @openStyleEditor="openStyleEditor"
          @openRegexConfig="openRegexConfig"
          @openAstViewer="openAstViewer"
          @startRender="startRender"
          @stopRender="stopRender"
          @clearOutput="clearOutput"
          @copyComparison="copyComparison"
        />

        <!-- 工作区内容 -->
        <div class="workspace-content" :class="[layoutMode, { 'is-compact': isWorkspaceCompact }]">
          <!-- 输入区 -->
          <div v-show="layoutMode === 'split' || layoutMode === 'input-only'" class="input-area">
            <div class="area-header">
              <h4>Markdown 内容</h4>
              <div class="header-actions">
                <el-popconfirm
                  title="确定要重置为当前预设的内容吗？"
                  confirm-button-text="确定"
                  cancel-button-text="取消"
                  @confirm="resetToPresetContent"
                >
                  <template #reference>
                    <el-button size="small" :disabled="!selectedPreset"> 重置 </el-button>
                  </template>
                </el-popconfirm>
              </div>
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
            <div class="area-header" ref="previewHeaderRef">
              <h4 style="min-width: 80px">渲染预览</h4>
              <div class="preview-header-controls" :class="{ 'is-compact': isHeaderCompact }">
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
                  <el-tooltip content="渲染时自动滚动到底部" placement="top" :show-after="300">
                    <el-switch v-model="autoScroll" size="small" />
                  </el-tooltip>
                  <span>自动滚动</span>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip content="可视化稳定区和待定区" placement="top" :show-after="300">
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
                ref="rendererRef"
                :key="renderKey"
                :content="currentContent"
                :stream-source="streamSource"
                :version="rendererVersion"
                :default-render-html="defaultRenderHtml"
                :default-code-block-expanded="defaultCodeBlockExpanded"
                :default-tool-call-collapsed="defaultToolCallCollapsed"
                :allow-dangerous-html="allowDangerousHtml"
                :enable-cdn-localizer="enableCdnLocalizer"
                :enable-enter-animation="enableEnterAnimation"
                :llm-think-rules="llmThinkRules"
                :style-options="richTextStyleOptions"
                :regex-rules="activeRegexRules"
                :resolve-asset="resolveAsset"
                :generation-meta="simulateMeta ? generationMeta : undefined"
                :throttle-ms="throttleMs"
                :seamless-mode="seamlessMode"
              />
              <div v-else class="empty-placeholder">
                <el-empty description="暂无内容，请输入或选择预设后开始渲染" />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>

    <!-- 样式配置悬浮窗 -->
    <DraggablePanel
      ref="styleEditorPanelRef"
      v-model="isStyleEditorVisible"
      title="Markdown 样式配置"
      width="600px"
      height="600px"
      :initial-x="100"
      :initial-y="100"
      :destroy-on-close="false"
      persistence-key="markdown-style-editor-panel"
    >
      <MarkdownStyleEditor v-model="richTextStyleOptions" :loading="isStyleLoading" />
    </DraggablePanel>

    <!-- 正则配置悬浮窗 -->
    <DraggablePanel
      ref="regexConfigPanelRef"
      v-model="isRegexConfigVisible"
      title="富文本渲染器正则配置"
      width="800px"
      height="700px"
      :initial-x="200"
      :initial-y="100"
      :destroy-on-close="false"
      persistence-key="rich-text-regex-config-panel"
    >
      <!-- 强制类型转换，因为 storeToRefs 导出的 ref 丢失了类型信息 -->
      <div class="regex-editor-container">
        <ChatRegexEditor v-model="typedRegexConfig" />
      </div>
    </DraggablePanel>

    <!-- AST 查看器悬浮窗 -->
    <AstViewer ref="astViewerPanelRef" v-model="isAstViewerVisible" :data="rendererRef?.ast" />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, shallowRef, onMounted, watch, nextTick, computed, provide } from "vue";
import { useElementSize } from "@vueuse/core";
import RichTextRenderer from "../RichTextRenderer.vue";
import type { StreamSource } from "../types";
import { presets } from "../config/presets";
import { useRichTextRendererStore } from "../stores/store";
import { storeToRefs } from "pinia";
import { llmChatRegistry } from "@/tools/llm-chat/llmChat.registry";
import { useAgentPresets } from "@/composables/useAgentPresets";
import {
  processMessageAssetsSync,
  initAgentAssetCache,
} from "@/tools/llm-chat/utils/agentAssetUtils";
import type { ChatAgent } from "@/tools/llm-chat/types";
import customMessage from "@/utils/customMessage";
import MarkdownStyleEditor from "./style-editor/MarkdownStyleEditor.vue";
import DraggablePanel from "@/components/common/DraggablePanel.vue";
import type { DraggablePanelInstance } from "@/components/common/DraggablePanel.vue";
import AstViewer from "./ast-viewer/AstViewer.vue";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";
import TesterConfigSidebar from "./tester/TesterConfigSidebar.vue";
import TesterToolbar from "./tester/TesterToolbar.vue";
import ChatRegexEditor from "@/tools/llm-chat/components/common/ChatRegexEditor.vue";
import type { ChatRegexConfig } from "@/tools/llm-chat/types/chatRegex";

// 容器尺寸检测
const containerRef = ref<HTMLDivElement | null>(null);
const inputRef = ref<any>(null);
const { width: containerWidth } = useElementSize(containerRef);
const isNarrow = computed(() => containerWidth.value < 1200);
const isMobile = computed(() => containerWidth.value < 768);

// 工作区尺寸检测
const workspaceRef = ref<HTMLElement | null>(null);
const { width: workspaceWidth } = useElementSize(workspaceRef);
// 当工作区宽度小于 900px 时，认为是紧凑模式，强制垂直排列
const isWorkspaceCompact = computed(() => workspaceWidth.value < 900);

// 预览区头部尺寸检测（用于控制 header controls 的布局）
const previewHeaderRef = ref<HTMLElement | null>(null);
const { width: headerWidth } = useElementSize(previewHeaderRef);
// 当 header 宽度小于 750px 时，将 tags 换行显示
const isHeaderCompact = computed(() => headerWidth.value < 750);

// 使用 store 管理配置状态
const store = useRichTextRendererStore();
const {
  isConfigCollapsed,
  layoutMode,
  selectedPreset,
  inputContent,
  streamEnabled,
  syncInputProgress,
  streamSpeed,
  initialDelay,
  throttleMs,
  fluctuationEnabled,
  delayFluctuation,
  charsFluctuation,
  autoScroll,
  visualizeBlockStatus,
  rendererVersion,
  defaultRenderHtml,
  defaultCodeBlockExpanded,
  defaultToolCallCollapsed,
  allowDangerousHtml,
  enableCdnLocalizer,
  enableEnterAnimation,
  simulateMeta,
  selectedTokenizer,
  llmThinkRules,
  richTextStyleOptions,
  regexConfig: storeRegexConfig,
  copyOptions,
  seamlessMode,
  profileType,
  selectedProfileId,
} = storeToRefs(store);

const activeRegexRules = computed(() => store.getActiveRegexRules());
// Agent Presets 用于资产解析
const { getPresetById } = useAgentPresets();
const currentAgent = computed(() => {
  if (profileType.value === "agent" && selectedProfileId.value) {
    // 优先从 llmChatRegistry 获取，它包含完整的运行时数据（如 assets）
    const agents = llmChatRegistry.getAgents();
    const found = agents.find((a) => a.id === selectedProfileId.value);
    if (found) return found;

    // 回退到预设
    return getPresetById(selectedProfileId.value);
  }
  return null;
});

// 提供当前 Agent 给后代组件（用于解析 agent-asset:// URL）
// 这与 MessageContent.vue 的行为保持一致
provide("currentAgent", currentAgent);

// 监听当前角色变化，强制重新渲染以刷新资产解析
watch(currentAgent, () => {
  renderKey.value++;
});

/**
 * 资产路径解析钩子
 * 支持解析 agent-asset:// 协议，指向当前选中的 Agent 资产
 */
const resolveAsset = (content: string): string => {
  if (!content) return content;

  // 兼容 agent:// 前缀（测试器特有，自动转换为标准的 agent-asset://）
  let processedContent = content.replace(/agent:\/\/([^"'\s<>\)]+)/g, "agent-asset://$1");

  // 使用标准的资产解析逻辑
  // 注意：processMessageAssetsSync 需要 ChatAgent 类型，这里进行适配
  return processMessageAssetsSync(processedContent, currentAgent.value as unknown as ChatAgent);
};
// 修复 v-model 类型转换导致的构建错误
const typedRegexConfig = computed({
  get: () => storeRegexConfig.value as ChatRegexConfig,
  set: (val: ChatRegexConfig) => {
    storeRegexConfig.value = val;
  },
});

// 样式编辑器显示状态
const isStyleEditorVisible = ref(false);
const isStyleLoading = ref(false);
const styleEditorPanelRef = ref<DraggablePanelInstance | null>(null);
// 标记是否已经初始化过编辑器（配合 destroyOnClose=false 使用）
const hasInitializedEditor = ref(false);

// 正则配置状态
const isRegexConfigVisible = ref(false);
const regexConfigPanelRef = ref<DraggablePanelInstance | null>(null);

// AST 查看器状态
const isAstViewerVisible = ref(false);
const astViewerPanelRef = ref<InstanceType<typeof AstViewer> | null>(null);
const rendererRef = ref<InstanceType<typeof RichTextRenderer> | null>(null);

const openAstViewer = () => {
  isAstViewerVisible.value = true;
  nextTick(() => {
    astViewerPanelRef.value?.activate();
  });
};

const openRegexConfig = () => {
  isRegexConfigVisible.value = true;
  nextTick(() => {
    regexConfigPanelRef.value?.activate();
  });
};

const openStyleEditor = () => {
  // 总是确保面板可见
  isStyleEditorVisible.value = true;

  // 显式调用 activate。这能处理两种情况：
  // 1. 面板首次打开时，确保其状态正确。
  // 2. 面板已打开时，再次点击按钮，可以强制执行位置和状态检查，将其带回视野。
  nextTick(() => {
    styleEditorPanelRef.value?.activate();
  });

  // 只有在第一次打开，且配置已加载的情况下，才通过骨架屏延迟渲染
  // 这样可以让悬浮窗先"弹"出来，避免重型组件渲染阻塞 UI 导致点击无反应
  if (!hasInitializedEditor.value) {
    // 只有当配置已经加载完毕时，我们才需要人为制造延迟
    // 如果配置没加载完，loading 状态本来就是 true，不需要我们要干预
    if (store.isConfigLoaded) {
      isStyleLoading.value = true;
      setTimeout(() => {
        isStyleLoading.value = false;
      }, 200);
    }
    hasInitializedEditor.value = true;
  }
};

// 渲染状态
const isRendering = ref(false);
const currentContent = ref("");
const streamSource = shallowRef<StreamSource | undefined>(undefined);

// 模拟的元数据
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

  let htmlContent = renderContainerRef.value.innerHTML;
  if (!htmlContent.trim() || renderContainerRef.value.querySelector(".empty-placeholder")) {
    customMessage.warning("没有可复制的 HTML 内容");
    return;
  }

  // 根据选项决定是否移除块信息属性
  if (!copyOptions.value.includeBlockInfo) {
    // 使用正则表达式移除 data-node-id 和 data-node-status 属性
    htmlContent = htmlContent.replace(/\s*data-node-id="[^"]*"/g, "");
    htmlContent = htmlContent.replace(/\s*data-node-status="[^"]*"/g, "");
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
    configInfo += `\nAST 节流: ${throttleMs.value} 毫秒`;
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

// 重置到当前预设的内容
const resetToPresetContent = () => {
  if (!selectedPreset.value) {
    return;
  }
  const preset = presets.find((p) => p.id === selectedPreset.value);
  if (preset) {
    inputContent.value = preset.content;
    customMessage.success(`已重置为预设 "${preset.name}" 的内容`);
  } else {
    customMessage.warning("未找到对应的预设内容");
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
  // 初始化 Agent 资产缓存，以支持同步路径解析
  initAgentAssetCache().catch((err) => {
    console.error("Failed to init agent asset cache:", err);
  });

  if (!store.isConfigLoaded) {
    isStyleLoading.value = true;
    try {
      await store.loadConfig();
    } finally {
      isStyleLoading.value = false;
    }
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

/* 紧凑模式下的 header controls */
.preview-header-controls.is-compact {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px 16px; /* 行间距 8px，列间距 16px */
}

.preview-header-controls.is-compact .render-stats {
  order: 2; /* 放到第二行 */
  width: 100%; /* 独占一行 */
  justify-content: flex-end; /* 内容靠右 */
  margin-top: 4px;
}

.preview-header-controls.is-compact .visualizer-toggle {
  order: 1; /* 开关保持在第一行 */
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
  padding: 12px;
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

/* 容器查询式响应式调整 */
.rich-text-renderer-tester.is-narrow .config-sidebar {
  width: 300px;
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

.regex-editor-container {
  flex: 1;
  overflow: auto;
  padding: 16px;
}
</style>
