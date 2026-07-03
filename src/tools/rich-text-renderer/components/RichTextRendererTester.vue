<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

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
        <div
          class="workspace-content"
          :class="[layoutMode, { 'is-compact': isWorkspaceCompact }]"
        >
          <!-- 输入区 -->
          <div
            v-show="layoutMode === 'split' || layoutMode === 'input-only'"
            class="input-area"
          >
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
                    <el-button size="small" :disabled="!selectedPreset">
                      重置
                    </el-button>
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
              <div
                class="preview-header-controls"
                :class="{ 'is-compact': isHeaderCompact }"
              >
                <div class="render-stats" v-if="renderStats.totalTokens > 0">
                  <el-tag size="small" type="info">
                    {{ renderStats.renderedTokens }}/{{
                      renderStats.totalTokens
                    }}
                    token
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
                  <el-tag size="small" type="success"
                    >{{ renderStats.totalChars }} 字符
                  </el-tag>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip
                    content="渲染时自动滚动到底部"
                    placement="top"
                    :show-after="300"
                  >
                    <el-switch v-model="autoScroll" size="small" />
                  </el-tooltip>
                  <span>自动滚动</span>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip
                    content="可视化稳定区和待定区"
                    placement="top"
                    :show-after="300"
                  >
                    <el-switch v-model="visualizeBlockStatus" size="small" />
                  </el-tooltip>
                  <span>可视化块状态</span>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip
                    content="切换样式逃逸检测器"
                    placement="top"
                    :show-after="300"
                  >
                    <el-button
                      circle
                      size="small"
                      :type="showEscapeDetector ? 'danger' : ''"
                      @click="showEscapeDetector = !showEscapeDetector"
                    >
                      <el-icon :size="14"><ShieldAlert /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip
                    content="截取当前渲染预览区域"
                    placement="top"
                    :show-after="300"
                  >
                    <el-button
                      circle
                      size="small"
                      type="primary"
                      :loading="isCapturing"
                      @click="capturePreview"
                    >
                      <el-icon v-if="!isCapturing" :size="14"
                        ><Camera
                      /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </div>
            <div class="escape-detection-bar" v-if="showEscapeDetector">
              <div class="detection-label">外部逃逸检测区：</div>
              <div class="test-escape-detector">
                <span
                  >🛡️
                  我只是普通文本，如果我具有非一般的样式，说明样式逃逸了！</span
                >
              </div>
              <div class="detection-hint">
                (此容器在渲染器组件外部，不应受其内部 style 影响)
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
                :smoothing-enabled="smoothingEnabled"
                :throttle-enabled="throttleEnabled"
                :verbose-logging="verboseLogging"
                :safety-guard-enabled="safetyGuardEnabled"
                :seamless-mode="seamlessMode"
              />
              <div v-else class="empty-placeholder">
                <el-empty description="暂无内容，请输入或选择预设后开始渲染" />
              </div>
            </div>
          </div>

          <!-- 帘幕模式 -->
          <div v-show="layoutMode === 'curtain'" class="curtain-area">
            <div class="area-header">
              <h4>帘幕预览</h4>
              <div
                class="preview-header-controls"
                :class="{ 'is-compact': isHeaderCompact }"
              >
                <div class="render-stats" v-if="renderStats.totalTokens > 0">
                  <el-tag size="small" type="info">
                    {{ renderStats.renderedTokens }}/{{
                      renderStats.totalTokens
                    }}
                    token
                  </el-tag>
                  <el-tag
                    v-if="streamEnabled && renderStats.speed > 0"
                    size="small"
                    :type="isRendering ? 'primary' : 'info'"
                  >
                    {{ renderStats.speed.toFixed(1) }} token/秒
                  </el-tag>
                  <el-tag size="small" type="success"
                    >{{ renderStats.totalChars }} 字符</el-tag
                  >
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip
                    content="渲染时自动滚动到底部"
                    placement="top"
                    :show-after="300"
                  >
                    <el-switch v-model="autoScroll" size="small" />
                  </el-tooltip>
                  <span>自动滚动</span>
                </div>
                <div class="visualizer-toggle">
                  <el-tooltip
                    content="截取当前渲染预览区域"
                    placement="top"
                    :show-after="300"
                  >
                    <el-button
                      circle
                      size="small"
                      type="primary"
                      :loading="isCapturing"
                      @click="capturePreview"
                    >
                      <el-icon v-if="!isCapturing" :size="14"
                        ><Camera
                      /></el-icon>
                    </el-button>
                  </el-tooltip>
                </div>
              </div>
            </div>
            <div class="curtain-container" ref="curtainContainerRef">
              <!-- 上层：渲染结果 -->
              <div class="curtain-rendered">
                <RichTextRenderer
                  v-if="currentContent || streamSource"
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
                  :smoothing-enabled="smoothingEnabled"
                  :throttle-enabled="throttleEnabled"
                  :verbose-logging="verboseLogging"
                  :safety-guard-enabled="safetyGuardEnabled"
                  :seamless-mode="seamlessMode"
                />
                <div v-else class="empty-placeholder">
                  <el-empty
                    description="暂无内容，请输入或选择预设后开始渲染"
                  />
                </div>
              </div>

              <!-- 卡拉OK原文区 -->
              <div v-if="hasCurtainRemaining" class="curtain-karaoke">
                <!-- 当前行（卡拉OK效果） -->
                <div class="karaoke-line karaoke-current">
                  <span class="karaoke-consumed">{{
                    currentLineConsumed
                  }}</span>
                  <span class="karaoke-pending">{{
                    currentLineRemaining
                  }}</span>
                </div>
                <!-- 未来行（淡色） -->
                <div
                  v-for="(line, idx) in futureLines"
                  :key="idx"
                  class="karaoke-line karaoke-future"
                >
                  {{ line || "\u200B" }}
                </div>
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
      <MarkdownStyleEditor
        v-model="richTextStyleOptions"
        :loading="isStyleLoading"
      />
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
    <AstViewer
      ref="astViewerPanelRef"
      v-model="isAstViewerVisible"
      :data="rendererRef?.ast"
    />

    <!-- 截图预览弹窗 -->
    <BaseDialog
      v-model="screenshotDialogVisible"
      title="渲染预览截图"
      width="70%"
      height="80vh"
      content-class="screenshot-dialog-body"
      :close-on-backdrop-click="true"
      :show-close-button="true"
    >
      <div class="screenshot-preview-content">
        <img
          v-if="screenshotDataUrl"
          :src="screenshotDataUrl"
          class="screenshot-preview-img"
          @click="imageViewer.show(screenshotDataUrl)"
        />
        <div v-else class="screenshot-preview-placeholder">截图生成中...</div>
      </div>
      <template #footer>
        <div class="screenshot-preview-actions">
          <el-button
            type="primary"
            size="small"
            :disabled="!screenshotDataUrl"
            @click="copyScreenshot"
          >
            <el-icon><CopyDocument /></el-icon>
            复制到剪贴板
          </el-button>
          <el-button
            type="success"
            size="small"
            :disabled="!screenshotDataUrl"
            @click="saveScreenshot"
          >
            <el-icon><Download /></el-icon>
            保存图片
          </el-button>
        </div>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import {
  ref,
  reactive,
  shallowRef,
  onMounted,
  watch,
  nextTick,
  computed,
  provide,
} from "vue";
import { useElementSize } from "@vueuse/core";
import { ShieldAlert, Camera } from "lucide-vue-next";
import { CopyDocument, Download } from "@element-plus/icons-vue";
import RichTextRenderer from "../RichTextRenderer.vue";
import type { StreamSource } from "../types";
import { presets } from "../config/presets";
import { useRichTextRendererStore } from "../stores/store";
import { storeToRefs } from "pinia";
import { llmChatRegistry } from "@/tools/llm-chat/llm-chat.registry";
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
import { domToPng } from "modern-screenshot";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useImageViewer } from "@/composables/useImageViewer";

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
  smoothingEnabled,
  throttleEnabled,
  verboseLogging,
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
  safetyGuardEnabled,
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
  let processedContent = content.replace(
    /agent:\/\/([^"'\s<>\)]+)/g,
    "agent-asset://$1"
  );

  // 使用标准的资产解析逻辑
  // 注意：processMessageAssetsSync 需要 ChatAgent 类型，这里进行适配
  return processMessageAssetsSync(
    processedContent,
    currentAgent.value as unknown as ChatAgent
  );
};
// 修复 v-model 类型转换导致的构建错误
const typedRegexConfig = computed({
  get: () => storeRegexConfig.value as ChatRegexConfig,
  set: (val: ChatRegexConfig) => {
    storeRegexConfig.value = val;
  },
});

// 样式逃逸检测器显示状态
const showEscapeDetector = ref(false);

// 截图相关状态
const isCapturing = ref(false);
const screenshotDialogVisible = ref(false);
const screenshotDataUrl = ref<string | null>(null);

// 图片查看器
const imageViewer = useImageViewer();

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
const curtainContainerRef = ref<HTMLDivElement | null>(null);

// 缓存的输入内容（用于同步模式下的重置）
const cachedInputContent = ref("");

// ===== 帘幕模式状态 =====
const streamedChars = ref(0);
const curtainFullContent = ref("");
let curtainUnsubscribe: (() => void) | null = null;

// 将原文按行分割
const curtainLines = computed(() => {
  if (!curtainFullContent.value) return [];
  return curtainFullContent.value.split("\n");
});

// 每行的起始字符偏移
const lineOffsets = computed(() => {
  const offsets: number[] = [0];
  for (let i = 0; i < curtainLines.value.length; i++) {
    offsets.push(offsets[i] + curtainLines.value[i].length + 1); // +1 for \n
  }
  return offsets;
});

// 当前正在被"吃"的行索引
const currentLineIndex = computed(() => {
  const offsets = lineOffsets.value;
  for (let i = 0; i < offsets.length - 1; i++) {
    if (streamedChars.value < offsets[i + 1]) return i;
  }
  return curtainLines.value.length - 1;
});

// 当前行内已消费的字符偏移
const currentLineOffset = computed(() => {
  return streamedChars.value - lineOffsets.value[currentLineIndex.value];
});

// 当前行的已消费部分（高亮）
const currentLineConsumed = computed(() => {
  const line = curtainLines.value[currentLineIndex.value] || "";
  return line.substring(0, currentLineOffset.value);
});

// 当前行的未消费部分（正常浓度）
const currentLineRemaining = computed(() => {
  const line = curtainLines.value[currentLineIndex.value] || "";
  return line.substring(currentLineOffset.value);
});

// 未来行（当前行之后的所有行）
const futureLines = computed(() => {
  return curtainLines.value.slice(currentLineIndex.value + 1);
});

// 是否还有剩余原文未被消费
const hasCurtainRemaining = computed(() => {
  return (
    curtainFullContent.value &&
    streamedChars.value < curtainFullContent.value.length
  );
});

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
          renderStats.speed =
            elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

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
          charIndex += tokens[i].text.length;
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
              Math.random() *
                (charsFluctuation.value.max - charsFluctuation.value.min + 1) +
                charsFluctuation.value.min
            );
            const actualTokens = Math.min(
              randomTokens,
              tokens.length - tokenIndex
            );

            // 根据token边界从原文中截取字符
            const endCharIndex = tokenCharPositions[tokenIndex + actualTokens];
            const chunk = content.substring(lastCharIndex, endCharIndex);
            subscribers.forEach((cb) => cb(chunk));

            tokenIndex += actualTokens;
            lastCharIndex = endCharIndex;
            renderStats.renderedTokens = tokenIndex;

            const elapsed = (Date.now() - renderStats.startTime) / 1000;
            renderStats.speed =
              elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

            if (tokenIndex < tokens.length) {
              // 理论上应该花费的时间（基于目标速度）
              const idealDelay = (actualTokens / streamSpeed.value) * 1000;

              // 随机延迟（在波动范围内）
              const randomDelay = Math.floor(
                Math.random() *
                  (delayFluctuation.value.max -
                    delayFluctuation.value.min +
                    1) +
                  delayFluctuation.value.min
              );

              // 计算本次实际应该延迟的时间（考虑累计偏差进行补偿）
              // 如果之前延迟过长，这次就缩短；如果之前过短，这次就延长
              const compensatedDelay = Math.max(
                1,
                randomDelay - accumulatedDebt
              );

              // 更新累计偏差：实际延迟 - 理想延迟
              accumulatedDebt += compensatedDelay - idealDelay;

              await new Promise((resolve) =>
                setTimeout(resolve, compensatedDelay)
              );
            }
          }
        } else {
          // 固定模式：使用固定的 token 速度
          const tokensPerInterval = Math.max(
            1,
            Math.floor(streamSpeed.value / 10)
          ); // 每100ms发送的token数
          const intervalMs = 100;

          let lastCharIndex = 0;
          for (
            let tokenIndex = 0;
            tokenIndex < tokens.length;
            tokenIndex += tokensPerInterval
          ) {
            if (signal.aborted) break;

            // 模拟 firstTokenTime
            if (simulateMeta.value && tokenIndex === 0) {
              generationMeta.firstTokenTime = Date.now();
            }

            const actualTokens = Math.min(
              tokensPerInterval,
              tokens.length - tokenIndex
            );
            const endCharIndex = tokenCharPositions[tokenIndex + actualTokens];
            const chunk = content.substring(lastCharIndex, endCharIndex);
            subscribers.forEach((cb) => cb(chunk));

            lastCharIndex = endCharIndex;
            renderStats.renderedTokens = Math.min(
              tokenIndex + tokensPerInterval,
              tokens.length
            );

            const elapsed = (Date.now() - renderStats.startTime) / 1000;
            renderStats.speed =
              elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

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
          (generationMeta.requestEndTime - generationMeta.requestStartTime) /
          1000;
        if (durationSeconds > 0) {
          generationMeta.tokensPerSecond =
            renderStats.totalTokens / durationSeconds;
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

    // 帘幕模式：缓存完整原文并重置进度
    curtainFullContent.value = fullContent;
    streamedChars.value = 0;

    if (syncInputProgress.value) {
      cachedInputContent.value = fullContent;
      inputContent.value = "";
    }

    const source = createStreamSource(fullContent);
    streamSource.value = source;

    // 帘幕模式：追踪字符进度
    if (layoutMode.value === "curtain") {
      curtainUnsubscribe = source.subscribe((chunk) => {
        streamedChars.value += chunk.length;
      });
    }

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
  if (curtainUnsubscribe) {
    curtainUnsubscribe();
    curtainUnsubscribe = null;
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

  // 重置帘幕状态
  curtainFullContent.value = "";
  streamedChars.value = 0;
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
  if (
    !htmlContent.trim() ||
    renderContainerRef.value.querySelector(".empty-placeholder")
  ) {
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
  const normalizedDiff = Math.abs(
    normalizedInput.length - normalizedRendered.length
  );
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
        if (
          typeof value === "object" &&
          value !== null &&
          "enabled" in value &&
          value.enabled
        ) {
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
        renderContainerRef.value.scrollTop =
          renderContainerRef.value.scrollHeight;
      }

      // 帘幕模式容器滚动：让分界点（卡拉OK区顶部）保持在可视区域中间
      if (curtainContainerRef.value && layoutMode.value === "curtain") {
        const container = curtainContainerRef.value;
        const karaokeEl = container.querySelector(
          ".curtain-karaoke"
        ) as HTMLElement | null;
        if (karaokeEl) {
          // 让分界点位于容器可视区域的垂直中心
          const containerHeight = container.clientHeight;
          const targetScrollTop = karaokeEl.offsetTop - containerHeight / 2;
          container.scrollTop = Math.max(0, targetScrollTop);
        } else {
          // 没有卡拉OK区（渲染完毕），回退到滚到底部
          container.scrollTop = container.scrollHeight;
        }
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

// 截图预览区域
// 截图预览区域
const capturePreview = async () => {
  const container =
    layoutMode.value === "curtain"
      ? curtainContainerRef.value?.querySelector(".curtain-rendered")
      : renderContainerRef.value;

  if (!container) {
    customMessage.warning("没有可截图的渲染内容");
    return;
  }

  // 找到实际渲染富文本的根元素（它没有滚动条限制，高度由内容完全撑开，且宽度受父级约束排版完全正确）
  const targetEl = container.querySelector(
    ".rich-text-renderer"
  ) as HTMLElement | null;
  if (!targetEl) {
    customMessage.warning("没有可截图的渲染内容");
    return;
  }

  isCapturing.value = true;
  screenshotDialogVisible.value = true;
  screenshotDataUrl.value = null;

  try {
    const startTime = performance.now();

    // 精确获取被截图元素（.rich-text-renderer）的实际渲染尺寸，而不是父容器的尺寸！
    // 这样能确保截图时的排版宽度与页面上看到的完全一致，彻底解决奇怪的折行问题
    const rect = targetEl.getBoundingClientRect();
    const actualWidth = Math.ceil(rect.width);
    const actualHeight = Math.ceil(rect.height);

    // 直接对页面上已经渲染好的、排版完全正确的 DOM 元素进行截图
    // 显式指定 width 和 height 确保 SVG 离屏渲染时排版尺寸与实际完全一致，防止宽度失控导致奇怪的折行
    const dataUrl = await domToPng(targetEl, {
      width: actualWidth,
      height: actualHeight,
      scale: 2,
      features: {
        removeControlCharacter: true,
      },
      onCloneNode: (clonedNode: Node) => {
        const el = clonedNode as HTMLElement;

        // 强制克隆根节点的宽度和高度与实际一致，并允许溢出可见
        el.style.width = `${actualWidth}px`;
        el.style.minWidth = `${actualWidth}px`;
        el.style.maxWidth = `${actualWidth}px`;
        el.style.height = `${actualHeight}px`;
        el.style.boxSizing = "border-box";
        el.style.overflow = "visible";

        // 1. 核心修复：将 html 根元素上的所有 CSS 变量复制到克隆节点上
        // 因为 SVG foreignObject 截图是独立文档上下文，无法继承父级/全局的 CSS 变量，导致颜色和排版崩溃
        const htmlStyles = window.getComputedStyle(document.documentElement);
        for (let i = 0; i < htmlStyles.length; i++) {
          const prop = htmlStyles[i];
          if (prop.startsWith("--")) {
            el.style.setProperty(prop, htmlStyles.getPropertyValue(prop));
          }
        }

        // 2. 同时也复制父容器上的 CSS 变量（如果有的话）
        const parentStyles = window.getComputedStyle(container);
        for (let i = 0; i < parentStyles.length; i++) {
          const prop = parentStyles[i];
          if (prop.startsWith("--")) {
            el.style.setProperty(prop, parentStyles.getPropertyValue(prop));
          }
        }

        // 强制 content-visibility 为 visible，防止视口外内容空白
        el.style.setProperty("content-visibility", "visible", "important");
        el.style.setProperty("contain-intrinsic-size", "auto 0px", "important");

        // 递归处理子元素，只做必要的修复，避免破坏原本精细的 CSS 布局
        const allElements = el.querySelectorAll("*");
        allElements.forEach((child) => {
          const childEl = child as HTMLElement;
          if (childEl.style) {
            childEl.style.setProperty(
              "content-visibility",
              "visible",
              "important"
            );
            childEl.style.setProperty(
              "contain-intrinsic-size",
              "auto 0px",
              "important"
            );
          }

          // 修复毛玻璃效果：替换为实色背景（因为 SVG foreignObject 不支持 backdrop-filter）
          const childStyle = window.getComputedStyle(childEl);
          if (
            childStyle.backdropFilter &&
            childStyle.backdropFilter !== "none"
          ) {
            childEl.style.backdropFilter = "none";
            const bgColor = childStyle.backgroundColor;
            if (
              !bgColor ||
              bgColor === "rgba(0, 0, 0, 0)" ||
              bgColor === "transparent"
            ) {
              childEl.style.backgroundColor = "var(--card-bg)";
            }
          }
        });

        // 3. 注入临时样式：彻底隐藏所有滚动条，防止过渡动画干扰，并进行智能排版保护
        const style = document.createElement("style");
        style.textContent = `
          /* 隐藏所有滚动条，防止微小排版偏差产生滚动条视觉污染 */
          * {
            scrollbar-width: none !important;
          }
          *::-webkit-scrollbar {
            display: none !important;
          }
          
          /* 强制所有可能产生滚动条的容器 overflow 为 visible，防止截断和滚动条 */
          .markdown-table-wrapper,
          .html-preview-container,
          .code-preview-block,
          .cm-editor-inner,
          pre, code {
            overflow: visible !important;
            overflow-x: visible !important;
            overflow-y: visible !important;
          }
          
          /* 智能排版保护：防止 flex 布局下的直接子元素在离屏渲染时因为微小的字体/行高偏差而被压缩折行 */
          [style*="display: flex"] > *,
          [style*="display:flex"] > *,
          .flex-container > * {
            flex-shrink: 0 !important;
          }
          
          /* 强制所有徽章、药丸标签、summary 折叠标题等单行文本容器不折行 */
          summary,
          .el-tag,
          .el-button,
          [style*="border-radius: 100px"],
          [style*="border-radius: 50px"],
          [style*="border-radius:100px"],
          [style*="border-radius:50px"] {
            white-space: nowrap !important;
          }
          
          /* 确保 details 保持原本的展开状态，不要有奇怪的过渡动画干扰截图 */
          details {
            transition: none !important;
          }
        `;
        el.appendChild(style);
      },
    });

    const elapsed = Math.round(performance.now() - startTime);
    customMessage.success(`截图完成，耗时 ${elapsed}ms`);

    screenshotDataUrl.value = dataUrl;
  } catch (err) {
    customMessage.error(`截图失败: ${err}`);
    console.error("Screenshot capture failed:", err);
    screenshotDialogVisible.value = false;
  } finally {
    isCapturing.value = false;
  }
};
// 复制截图到剪贴板
const copyScreenshot = async () => {
  if (!screenshotDataUrl.value) return;

  try {
    const base64Data = screenshotDataUrl.value.split(",")[1];
    const binaryStr = atob(base64Data);
    const buffer = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      buffer[i] = binaryStr.charCodeAt(i);
    }

    const blob = new Blob([buffer], { type: "image/png" });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    customMessage.success("图片已复制到剪贴板");
  } catch (err) {
    customMessage.error("复制失败，请检查浏览器权限");
    console.error("Failed to copy screenshot:", err);
  }
};

// 保存截图到本地
const saveScreenshot = async () => {
  if (!screenshotDataUrl.value) return;

  try {
    const base64Data = screenshotDataUrl.value.split(",")[1];
    const binaryStr = atob(base64Data);
    const buffer = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      buffer[i] = binaryStr.charCodeAt(i);
    }

    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: `rich-text-screenshot-${Date.now()}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });

    if (filePath) {
      await writeFile(filePath, buffer);
      customMessage.success("图片已保存");
    }
  } catch {
    // Fallback: 浏览器下载
    const link = document.createElement("a");
    link.download = `rich-text-screenshot-${Date.now()}.png`;
    link.href = screenshotDataUrl.value;
    link.click();
    customMessage.success("图片已下载（浏览器方式）");
  }
};

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

.render-container.visualize-block-status
  :deep([data-node-status="stable"]::before) {
  background-color: #67c23a; /* Element Plus Success color */
  color: white;
}

.render-container.visualize-block-status
  :deep([data-node-status="pending"]::before) {
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
  border: var(--border-width) solid var(--border-color);
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
  border-right: var(--border-width) solid var(--border-color);
}

/* 工作区紧凑模式（宽度不足时自动垂直排列） */
.workspace-content.split.is-compact {
  flex-direction: column;
}

.workspace-content.split.is-compact .input-area {
  border-right: none;
  border-bottom: var(--border-width) solid var(--border-color);
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
  border-bottom: var(--border-width) solid var(--border-color);
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

/* 逃逸检测工具栏 */
.escape-detection-bar {
  padding: 10px 20px;
  background: var(--bg-color-page);
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
}

.detection-label {
  font-weight: bold;
  color: var(--text-color-secondary);
}

.detection-hint {
  color: var(--text-color-placeholder);
  font-style: italic;
}

/* 逃逸检测器默认样式（未被污染时） */
.test-escape-detector {
  padding: 4px 12px;
  background: var(--fill-color-light);
  border: 1px dashed var(--border-color);
  border-radius: 4px;
  color: var(--text-color-regular);
  transition: all 0.3s ease;
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

/* ===== 帘幕模式 ===== */
.curtain-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  border: none;
  border-radius: 0;
  overflow: hidden;
  width: 100%;
}

.workspace-content.curtain {
  padding: 0;
}

.workspace-content.curtain .curtain-area {
  flex: 1;
  width: 100%;
}

.curtain-container {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.curtain-rendered {
  padding: 20px;
  background: var(--bg-color);
}

/* 卡拉OK原文区 */
.curtain-karaoke {
  padding: 16px 20px;
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  line-height: 1.6;
  border-top: 1px dashed var(--border-color);
  background: rgba(var(--el-color-info-rgb), calc(var(--card-opacity) * 0.03));
}

.karaoke-line {
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.6em;
}

/* 当前行：正常浓度 */
.karaoke-current {
  color: var(--text-color);
  opacity: 1;
}

/* 已消费部分：高亮扫过效果 */
.karaoke-consumed {
  color: var(--el-color-primary);
  background: linear-gradient(
    to right,
    rgba(var(--el-color-primary-rgb), 0.08),
    rgba(var(--el-color-primary-rgb), 0.15)
  );
  border-radius: 2px;
}

/* 未消费部分：正常文字 */
.karaoke-pending {
  color: var(--text-color);
}

/* 未来行：淡色 */
.karaoke-future {
  color: var(--text-color-secondary);
  opacity: 0.4;
}

/* 覆盖弹窗 body 的 padding，让截图能完全贴边撑满 */
:deep(.screenshot-dialog-body) {
  padding: 0 !important;
}

/* 截图预览弹窗样式 */
.screenshot-preview-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  min-height: 200px;
  width: 100%;
}

.screenshot-preview-img {
  width: 100%;
  height: auto;
  display: block;
  cursor: pointer;
  transition: opacity 0.15s;
  border-radius: 0;
  box-shadow: none;
}

.screenshot-preview-img:hover {
  opacity: 0.9;
}

.screenshot-preview-placeholder {
  color: var(--text-color-secondary);
  font-size: 14px;
}

.screenshot-preview-actions {
  display: flex;
  gap: 12px;
  justify-content: flex-end;
}
</style>
