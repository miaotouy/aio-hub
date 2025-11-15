<template>
  <div class="rich-text-renderer-tester">
    <!-- 顶部操作栏 -->
    <div class="header-bar">
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
          <div class="version-selector">
            <el-tooltip content="选择渲染器版本进行对比测试" placement="bottom">
              <el-select v-model="rendererVersion" style="width: 260px">
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
            </el-tooltip>
          </div>
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
              :disabled="!inputContent.trim() || (!currentContent && !streamSource)"
            >
              复制对比
            </el-button>
          </el-tooltip>
        </div>
      </div>
    </div>

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

          <!-- LLM 思考块规则配置 -->
          <div class="control-section">
            <LlmThinkRulesEditor v-model="llmThinkRules" />
          </div>

          <!-- 文本输入区 -->
          <div class="control-section">
            <label class="control-label">Markdown 内容</label>
            <el-input
              v-model="inputContent"
              type="textarea"
              placeholder="在此输入 Markdown 内容..."
              resize="none"
              :rows="30"
              class="markdown-input"
            />
          </div>
        </InfoCard>
      </div>

      <!-- 右侧渲染预览区 -->
      <div class="preview-panel">
        <InfoCard title="渲染预览" class="preview-card">
          <template #headerExtra>
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
                <el-tag size="small" type="success"> {{ renderStats.totalChars }} 字符 </el-tag>
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
          </template>

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
              :llm-think-rules="llmThinkRules"
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
import { ref, reactive, shallowRef, onMounted, watch, nextTick, computed } from "vue";
import {
  DArrowLeft,
  DArrowRight,
  VideoPlay,
  VideoPause,
  RefreshRight,
  Loading,
  CopyDocument,
} from "@element-plus/icons-vue";
import RichTextRenderer from "./RichTextRenderer.vue";
import type { StreamSource } from "./types";
import { presets } from "./presets";
import { useRichTextRendererStore, availableVersions } from "./store";
import { storeToRefs } from "pinia";
import customMessage from "@/utils/customMessage";
import LlmThinkRulesEditor from "./components/LlmThinkRulesEditor.vue";
import InfoCard from "@/components/common/InfoCard.vue";
import { tokenCalculatorEngine } from "@/tools/token-calculator/composables/useTokenCalculator";

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
  autoScroll,
  visualizeBlockStatus,
  rendererVersion,
  llmThinkRules,
} = storeToRefs(store);

// Token 流式控制
const selectedTokenizer = ref("gpt4o");
const availableTokenizers = tokenCalculatorEngine.getAvailableTokenizers();

// 获取可用的渲染器版本列表（过滤掉未启用的）
const enabledVersions = computed(() => availableVersions.filter((v) => v.enabled));

// 渲染状态
const isRendering = ref(false);
const currentContent = ref("");
const streamSource = shallowRef<StreamSource | undefined>(undefined);

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

// 计时器
let elapsedTimer: number | null = null;

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
    currentContent.value = "";
    streamSource.value = createStreamSource(inputContent.value);
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
  let configInfo = `流式输出: ${streamEnabled.value ? "启用" : "禁用"}`;

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
  const comparisonText = `========== 测试配置 ==========
${configInfo}

========== Markdown 原文 ==========
${inputContent.value}

========== 渲染后的 HTML ==========
${htmlContent}

========== 规范化后的原文 ==========
${normalizedInput}

========== 规范化后的渲染文本 ==========
${normalizedRendered}

========== 对比信息 ==========
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
  if (autoScroll.value && renderContainerRef.value) {
    nextTick(() => {
      if (renderContainerRef.value) {
        renderContainerRef.value.scrollTop = renderContainerRef.value.scrollHeight;
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
  await store.loadConfig();
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

/* 顶部工具栏 */
.header-bar {
  margin-bottom: 16px;
  flex-shrink: 0;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  padding: 12px 20px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
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

.header-left .version-selector {
  display: flex;
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
