<script setup lang="ts">
import { ref, reactive, computed, watch, nextTick, onUnmounted } from "vue";
import {
  Play,
  Square,
  Trash2,
  Settings,
  FileText,
  Eye,
  Sparkles,
  Code,
  Copy,
} from "lucide-vue-next";
import RichTextRenderer from "../RichTextRenderer.vue";
import { presets } from "../presets/test-cases";
import { marked } from "marked";
import { Snackbar } from "@varlet/ui";
import { useI18n } from "@/i18n";

const { tRaw } = useI18n();

// 标签页状态：edit (编辑), preview (预览), curtain (帘幕), debug (调试)
const activeTab = ref<"edit" | "preview" | "curtain" | "debug">("preview");

// 输入与渲染内容
const selectedPreset = ref("basic");
const inputContent = ref("");
const currentContent = ref("");

// 模拟流式配置
const streamEnabled = ref(true);
const streamSpeed = ref(30); // tokens/s
const initialDelay = ref(200); // ms
const fluctuationEnabled = ref(true);
const delayFluctuation = reactive({ min: 10, max: 100 }); // ms
const charsFluctuation = reactive({ min: 1, max: 3 }); // tokens

// 渲染统计
const isRendering = ref(false);
const renderStats = reactive({
  totalChars: 0,
  totalTokens: 0,
  renderedTokens: 0,
  speed: 0,
  startTime: 0,
  elapsedTime: 0,
});

// 帘幕模式状态
const streamedChars = ref(0);
const curtainFullContent = ref("");

// 调试抽屉状态
const isDebugDrawerOpen = ref(false);

// 计时器与 AbortController
let streamAbortController: AbortController | null = null;
let elapsedTimer: number | null = null;

// 容器引用用于自动滚动
const previewContainerRef = ref<HTMLDivElement | null>(null);
const curtainContainerRef = ref<HTMLDivElement | null>(null);

// 初始化内容为第一个预设
const activePreset = computed(() =>
  presets.find((p) => p.id === selectedPreset.value)
);
if (activePreset.value) {
  inputContent.value = activePreset.value.content;
  currentContent.value = activePreset.value.content;
}

// 监听预设变化
watch(selectedPreset, (newId) => {
  const preset = presets.find((p) => p.id === newId);
  if (preset) {
    inputContent.value = preset.content;
    if (!isRendering.value) {
      currentContent.value = preset.content;
    }
  }
});

// 格式化耗时
const formatElapsedTime = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

// 模拟分词：中文字符按字切分，英文按单词/空格切分
function tokenizeText(text: string): string[] {
  const tokens: string[] = [];
  let currentWord = "";

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const isChinese = /[\u4e00-\u9fa5]|[\u3000-\u303f]|[\uff00-\uffef]/.test(
      char
    );

    if (isChinese) {
      if (currentWord) {
        tokens.push(currentWord);
        currentWord = "";
      }
      tokens.push(char);
    } else {
      currentWord += char;
      if (
        /\s|[\.,\/#!$%\^&\*;:{}=\-_`~()?]/.test(char) ||
        i === text.length - 1
      ) {
        if (currentWord) {
          tokens.push(currentWord);
          currentWord = "";
        }
      }
    }
  }
  return tokens.filter((t) => t !== "");
}

// 开始渲染
const startRender = () => {
  if (!inputContent.value.trim()) return;

  stopRender();
  isRendering.value = true;

  if (streamEnabled.value) {
    currentContent.value = "";
    curtainFullContent.value = inputContent.value;
    streamedChars.value = 0;

    streamAbortController = new AbortController();
    startStreaming(inputContent.value);
  } else {
    currentContent.value = inputContent.value;
    renderStats.totalChars = inputContent.value.length;
    renderStats.totalTokens = 0;
    renderStats.renderedTokens = 0;
    renderStats.speed = 0;
    renderStats.elapsedTime = 0;
    isRendering.value = false;
  }
};

// 模拟流式输出（累计时间债务补偿波动算法）
const startStreaming = async (content: string) => {
  const tokens = tokenizeText(content);
  renderStats.totalTokens = tokens.length;
  renderStats.renderedTokens = 0;
  renderStats.totalChars = content.length;
  renderStats.startTime = Date.now();
  renderStats.elapsedTime = 0;

  elapsedTimer = window.setInterval(() => {
    renderStats.elapsedTime = Date.now() - renderStats.startTime;
  }, 100);

  const signal = streamAbortController!.signal;

  if (initialDelay.value > 0) {
    await new Promise((resolve) => setTimeout(resolve, initialDelay.value));
    if (signal.aborted) return;
  }

  let tokenIndex = 0;
  let accumulatedDebt = 0;

  while (tokenIndex < tokens.length) {
    if (signal.aborted) break;

    const batchSize = fluctuationEnabled.value
      ? Math.min(
          Math.floor(
            Math.random() * (charsFluctuation.max - charsFluctuation.min + 1)
          ) + charsFluctuation.min,
          tokens.length - tokenIndex
        )
      : 1;

    const chunk = tokens.slice(tokenIndex, tokenIndex + batchSize).join("");
    currentContent.value += chunk;
    tokenIndex += batchSize;
    renderStats.renderedTokens = tokenIndex;

    if (activeTab.value === "curtain") {
      streamedChars.value = currentContent.value.length;
    }

    const elapsed = (Date.now() - renderStats.startTime) / 1000;
    renderStats.speed = elapsed > 0 ? renderStats.renderedTokens / elapsed : 0;

    // 自动滚动
    scrollToBottom();

    if (tokenIndex < tokens.length) {
      const idealDelay = (batchSize / streamSpeed.value) * 1000;
      const randomDelay = fluctuationEnabled.value
        ? Math.floor(
            Math.random() * (delayFluctuation.max - delayFluctuation.min + 1)
          ) + delayFluctuation.min
        : 1000 / streamSpeed.value;

      const compensatedDelay = Math.max(1, randomDelay - accumulatedDebt);
      accumulatedDebt += compensatedDelay - idealDelay;

      await new Promise((resolve) => setTimeout(resolve, compensatedDelay));
    }
  }

  if (elapsedTimer !== null) {
    clearInterval(elapsedTimer);
    elapsedTimer = null;
  }
  renderStats.elapsedTime = Date.now() - renderStats.startTime;
  isRendering.value = false;
};

// 停止渲染
const stopRender = () => {
  if (streamAbortController) {
    streamAbortController.abort();
    streamAbortController = null;
  }
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
  curtainFullContent.value = "";
  streamedChars.value = 0;
  renderStats.totalChars = 0;
  renderStats.totalTokens = 0;
  renderStats.renderedTokens = 0;
  renderStats.speed = 0;
  renderStats.elapsedTime = 0;
};

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (activeTab.value === "preview" && previewContainerRef.value) {
      previewContainerRef.value.scrollTop =
        previewContainerRef.value.scrollHeight;
    } else if (activeTab.value === "curtain" && curtainContainerRef.value) {
      const container = curtainContainerRef.value;
      const karaokeEl = container.querySelector(
        ".curtain-karaoke"
      ) as HTMLElement | null;
      if (karaokeEl) {
        const containerHeight = container.clientHeight;
        const targetScrollTop = karaokeEl.offsetTop - containerHeight / 2;
        container.scrollTop = Math.max(0, targetScrollTop);
      } else {
        container.scrollTop = container.scrollHeight;
      }
    }
  });
};

// ===== 帘幕模式计算属性 =====
const curtainLines = computed(() => {
  if (!curtainFullContent.value) return [];
  return curtainFullContent.value.split("\n");
});

const lineOffsets = computed(() => {
  const offsets: number[] = [0];
  for (let i = 0; i < curtainLines.value.length; i++) {
    offsets.push(offsets[i] + curtainLines.value[i].length + 1);
  }
  return offsets;
});

const currentLineIndex = computed(() => {
  const offsets = lineOffsets.value;
  for (let i = 0; i < offsets.length - 1; i++) {
    if (streamedChars.value < offsets[i + 1]) return i;
  }
  return curtainLines.value.length - 1;
});

const currentLineOffset = computed(() => {
  return streamedChars.value - lineOffsets.value[currentLineIndex.value];
});

const currentLineConsumed = computed(() => {
  const line = curtainLines.value[currentLineIndex.value] || "";
  return line.substring(0, currentLineOffset.value);
});

const currentLineRemaining = computed(() => {
  const line = curtainLines.value[currentLineIndex.value] || "";
  return line.substring(currentLineOffset.value);
});

const futureLines = computed(() => {
  return curtainLines.value.slice(currentLineIndex.value + 1);
});

const hasCurtainRemaining = computed(() => {
  return (
    curtainFullContent.value &&
    streamedChars.value < curtainFullContent.value.length
  );
});

// ===== 调试信息捕获与复制 =====

// 净化 Markdown 文本为纯文本
const stripMarkdown = (markdown: string): string => {
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
    .replace(/\r\n/g, "\n")
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .trim();
};

// 复制原文和渲染结果的对比报告
const copyComparison = async () => {
  if (!inputContent.value.trim()) {
    Snackbar.warning(tRaw("tools.rich-text-renderer.tester.无原文可复制"));
    return;
  }

  const rendererEl = previewContainerRef.value?.querySelector(
    ".rich-text-renderer"
  );
  if (!rendererEl) {
    Snackbar.warning(tRaw("tools.rich-text-renderer.tester.无渲染容器"));
    return;
  }

  const htmlContent = rendererEl.innerHTML || "";
  const renderedText = rendererEl.textContent || "";
  const cleanedInput = stripMarkdown(inputContent.value);

  const normalizedInput = normalizeWhitespace(cleanedInput);
  const normalizedRendered = normalizeWhitespace(renderedText);

  const rawDiff = Math.abs(cleanedInput.length - renderedText.length);
  const normalizedDiff = Math.abs(
    normalizedInput.length - normalizedRendered.length
  );
  const isMatched = normalizedDiff === 0;

  // 拼接测试配置信息
  const streamLabel = streamEnabled.value
    ? tRaw("tools.rich-text-renderer.tester.流式输出启用")
    : tRaw("tools.rich-text-renderer.tester.流式输出禁用");
  let configInfo = streamLabel;
  if (streamEnabled.value) {
    configInfo += `\n${tRaw("tools.rich-text-renderer.tester.输出速度配置", { speed: streamSpeed.value })}`;
    configInfo += `\n${tRaw("tools.rich-text-renderer.tester.首包延迟配置", { delay: initialDelay.value })}`;
    const fluctuationLabel = fluctuationEnabled.value
      ? tRaw("tools.rich-text-renderer.tester.波动模式启用")
      : tRaw("tools.rich-text-renderer.tester.波动模式禁用");
    configInfo += `\n${fluctuationLabel}`;
  }
  configInfo += `\n${tRaw("tools.rich-text-renderer.tester.预设用例", { id: selectedPreset.value })}`;

  const matchLabel = isMatched
    ? tRaw("tools.rich-text-renderer.tester.完全匹配")
    : tRaw("tools.rich-text-renderer.tester.不匹配");

  const comparisonText = `========== 测试配置 ==========
${configInfo}

========== Markdown 原文 ==========
${inputContent.value}

========== 渲染后的 HTML ==========
${htmlContent}

========== 对比信息 ==========
原文字符数（带标记）: ${inputContent.value.length}
原文字符数（纯文本）: ${cleanedInput.length}
渲染文本字符数: ${renderedText.length}
字符差异（保留空白）: ${rawDiff}
---
规范化后原文字符数: ${normalizedInput.length}
规范化后渲染字符数: ${normalizedRendered.length}
字符差异（规范化后）: ${normalizedDiff}
文本匹配: ${matchLabel}
---
HTML 完整字符数: ${htmlContent.length}
渲染时间: ${new Date().toLocaleString("zh-CN")}
=============================`;

  try {
    await navigator.clipboard.writeText(comparisonText);
    Snackbar.success(tRaw("tools.rich-text-renderer.tester.对比报告已复制"));
  } catch (err) {
    Snackbar.error(tRaw("tools.rich-text-renderer.tester.复制失败权限"));
    console.error("Failed to copy comparison:", err);
  }
};

// 复制完整 AST JSON
const copyAstJson = async () => {
  if (!currentContent.value) {
    Snackbar.warning(tRaw("tools.rich-text-renderer.tester.无AST数据"));
    return;
  }
  try {
    const jsonStr = JSON.stringify(astJson.value, null, 2);
    await navigator.clipboard.writeText(jsonStr);
    Snackbar.success(tRaw("tools.rich-text-renderer.tester.AST已复制"));
  } catch (err) {
    Snackbar.error(tRaw("tools.rich-text-renderer.tester.复制失败"));
    console.error("Failed to copy AST:", err);
  }
};

// 复制渲染后的 HTML
const copyHtml = async () => {
  const rendererEl = previewContainerRef.value?.querySelector(
    ".rich-text-renderer"
  );
  if (!rendererEl) {
    Snackbar.warning(tRaw("tools.rich-text-renderer.tester.无渲染内容"));
    return;
  }
  try {
    await navigator.clipboard.writeText(rendererEl.innerHTML || "");
    Snackbar.success(tRaw("tools.rich-text-renderer.tester.HTML已复制"));
  } catch (err) {
    Snackbar.error(tRaw("tools.rich-text-renderer.tester.复制失败"));
  }
};

// ===== AST 查看器 =====
const astJson = computed(() => {
  if (!currentContent.value) return [];
  try {
    return marked.lexer(currentContent.value);
  } catch (err) {
    return { error: "Failed to parse AST", details: String(err) };
  }
});

onUnmounted(() => {
  stopRender();
});
</script>

<template>
  <div class="tester-view">
    <!-- 顶部控制栏 -->
    <header class="tester-header">
      <div class="header-row">
        <var-select
          v-model="selectedPreset"
          size="small"
          class="preset-select"
          :hint="false"
        >
          <var-option
            v-for="p in presets"
            :key="p.id"
            :label="p.name"
            :value="p.id"
          />
        </var-select>

        <div class="action-buttons">
          <var-button
            v-if="!isRendering"
            type="primary"
            size="small"
            round
            class="control-btn"
            @click="startRender"
          >
            <Play :size="14" />
            <span>{{ tRaw("tools.rich-text-renderer.tester.渲染") }}</span>
          </var-button>
          <var-button
            v-else
            type="warning"
            size="small"
            round
            class="control-btn"
            @click="stopRender"
          >
            <Square :size="14" />
            <span>{{ tRaw("tools.rich-text-renderer.tester.停止") }}</span>
          </var-button>
          <var-button
            type="success"
            size="small"
            round
            class="control-btn"
            :disabled="!currentContent"
            @click="copyComparison"
          >
            <Copy :size="14" />
            <span>{{ tRaw("tools.rich-text-renderer.tester.对比") }}</span>
          </var-button>
          <var-button
            type="info"
            size="small"
            round
            class="control-btn"
            @click="clearOutput"
          >
            <Trash2 :size="14" />
            <span>{{ tRaw("tools.rich-text-renderer.tester.清空") }}</span>
          </var-button>
        </div>
      </div>

      <!-- 导航 Tab -->
      <div class="tab-nav">
        <button
          class="tab-item"
          :class="{ active: activeTab === 'edit' }"
          @click="activeTab = 'edit'"
        >
          <FileText :size="16" />
          <span>{{ tRaw("tools.rich-text-renderer.tester.编辑") }}</span>
        </button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'preview' }"
          @click="activeTab = 'preview'"
        >
          <Eye :size="16" />
          <span>{{ tRaw("tools.rich-text-renderer.tester.预览") }}</span>
        </button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'curtain' }"
          @click="activeTab = 'curtain'"
        >
          <Sparkles :size="16" />
          <span>{{ tRaw("tools.rich-text-renderer.tester.帘幕") }}</span>
        </button>
        <button
          class="tab-item"
          :class="{ active: activeTab === 'debug' }"
          @click="activeTab = 'debug'"
        >
          <Settings :size="16" />
          <span>{{ tRaw("tools.rich-text-renderer.tester.配置") }}</span>
        </button>
      </div>
    </header>

    <!-- 主工作区 -->
    <main class="tester-workspace">
      <!-- 1. 编辑视图 -->
      <div v-show="activeTab === 'edit'" class="workspace-pane edit-pane">
        <textarea
          v-model="inputContent"
          :placeholder="tRaw('tools.rich-text-renderer.tester.输入提示')"
          class="markdown-textarea"
        ></textarea>
      </div>

      <!-- 2. 预览视图 -->
      <div
        v-show="activeTab === 'preview'"
        ref="previewContainerRef"
        class="workspace-pane preview-pane"
      >
        <div v-if="currentContent" class="render-wrapper">
          <div class="render-header">
            <span class="render-title">{{
              tRaw("tools.rich-text-renderer.tester.渲染结果")
            }}</span>
            <var-button
              type="primary"
              text
              size="mini"
              class="copy-html-btn"
              @click="copyHtml"
            >
              <Copy :size="12" style="margin-right: 2px" />
              <span>{{
                tRaw("tools.rich-text-renderer.tester.复制HTML")
              }}</span>
            </var-button>
          </div>
          <RichTextRenderer
            :content="currentContent"
            :is-streaming="isRendering"
          />
        </div>
        <div v-else class="empty-state">
          <var-button type="primary" text @click="startRender">{{
            tRaw("tools.rich-text-renderer.tester.暂无内容")
          }}</var-button>
        </div>
      </div>

      <!-- 3. 帘幕视图 -->
      <div
        v-show="activeTab === 'curtain'"
        ref="curtainContainerRef"
        class="workspace-pane curtain-pane"
      >
        <div class="curtain-rendered">
          <RichTextRenderer
            :content="currentContent"
            :is-streaming="isRendering"
          />
        </div>

        <!-- 卡拉OK原文区 -->
        <div v-if="hasCurtainRemaining" class="curtain-karaoke">
          <div class="karaoke-line karaoke-current">
            <span class="karaoke-consumed">{{ currentLineConsumed }}</span>
            <span class="karaoke-pending">{{ currentLineRemaining }}</span>
          </div>
          <div
            v-for="(line, idx) in futureLines.slice(0, 5)"
            :key="idx"
            class="karaoke-line karaoke-future"
          >
            {{ line || "\u200B" }}
          </div>
          <div v-if="futureLines.length > 5" class="karaoke-more">
            {{
              tRaw("tools.rich-text-renderer.tester.剩余行", {
                count: futureLines.length - 5,
              })
            }}
          </div>
        </div>
      </div>

      <!-- 4. 配置视图 -->
      <div v-show="activeTab === 'debug'" class="workspace-pane debug-pane">
        <div class="config-group">
          <h3 class="config-title">
            {{ tRaw("tools.rich-text-renderer.tester.流式输出模拟") }}
          </h3>
          <div class="config-item">
            <span class="config-label">{{
              tRaw("tools.rich-text-renderer.tester.启用流式模拟")
            }}</span>
            <var-switch v-model="streamEnabled" size="20" />
          </div>
          <div class="config-item" v-if="streamEnabled">
            <span class="config-label">{{
              tRaw("tools.rich-text-renderer.tester.输出速度", {
                speed: streamSpeed,
              })
            }}</span>
            <var-slider
              v-model="streamSpeed"
              :min="5"
              :max="100"
              class="config-slider"
            />
          </div>
          <div class="config-item" v-if="streamEnabled">
            <span class="config-label">{{
              tRaw("tools.rich-text-renderer.tester.首包延迟", {
                delay: initialDelay,
              })
            }}</span>
            <var-slider
              v-model="initialDelay"
              :min="0"
              :max="2000"
              :step="100"
              class="config-slider"
            />
          </div>
        </div>

        <div class="config-group" v-if="streamEnabled">
          <h3 class="config-title">
            {{ tRaw("tools.rich-text-renderer.tester.时间债务补偿波动模拟") }}
          </h3>
          <div class="config-item">
            <span class="config-label">{{
              tRaw("tools.rich-text-renderer.tester.启用波动模式")
            }}</span>
            <var-switch v-model="fluctuationEnabled" size="20" />
          </div>
          <div class="config-item" v-if="fluctuationEnabled">
            <span class="config-label">{{
              tRaw("tools.rich-text-renderer.tester.延迟波动范围", {
                min: delayFluctuation.min,
                max: delayFluctuation.max,
              })
            }}</span>
            <div class="range-inputs">
              <var-slider
                v-model="delayFluctuation.min"
                :min="5"
                :max="50"
                class="config-slider"
              />
              <var-slider
                v-model="delayFluctuation.max"
                :min="51"
                :max="200"
                class="config-slider"
              />
            </div>
          </div>
        </div>

        <div class="config-group">
          <h3 class="config-title">
            {{ tRaw("tools.rich-text-renderer.tester.AST调试") }}
          </h3>
          <var-button
            type="primary"
            block
            size="small"
            @click="isDebugDrawerOpen = true"
          >
            <Code :size="14" />
            <span>{{ tRaw("tools.rich-text-renderer.tester.查看AST") }}</span>
          </var-button>
        </div>
      </div>
    </main>

    <!-- 底部状态栏 -->
    <footer class="tester-footer">
      <div class="stat-item">
        <span class="stat-val">{{ renderStats.renderedTokens }}</span>
        <span class="stat-lbl">{{
          tRaw("tools.rich-text-renderer.tester.Tokens")
        }}</span>
      </div>
      <div class="stat-item" v-if="streamEnabled && renderStats.speed > 0">
        <span class="stat-val">{{ renderStats.speed.toFixed(1) }}</span>
        <span class="stat-lbl">{{
          tRaw("tools.rich-text-renderer.tester.T_s")
        }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">{{
          formatElapsedTime(renderStats.elapsedTime)
        }}</span>
        <span class="stat-lbl">{{
          tRaw("tools.rich-text-renderer.tester.耗时")
        }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-val">{{ renderStats.totalChars }}</span>
        <span class="stat-lbl">{{
          tRaw("tools.rich-text-renderer.tester.字符")
        }}</span>
      </div>
    </footer>

    <!-- AST 查看器抽屉 -->
    <var-popup
      position="bottom"
      v-model:show="isDebugDrawerOpen"
      class="ast-drawer"
    >
      <div class="drawer-header">
        <h3>{{ tRaw("tools.rich-text-renderer.tester.AST标题") }}</h3>
        <div class="drawer-header-actions">
          <var-button
            type="primary"
            text
            size="small"
            @click="copyAstJson"
            style="margin-right: 8px"
          >
            <Copy :size="14" style="margin-right: 4px" />
            <span>{{ tRaw("tools.rich-text-renderer.tester.复制JSON") }}</span>
          </var-button>
          <var-button
            type="primary"
            text
            size="small"
            @click="isDebugDrawerOpen = false"
            >{{ tRaw("tools.rich-text-renderer.tester.关闭") }}</var-button
          >
        </div>
      </div>
      <div class="drawer-content">
        <pre
          class="ast-json"
        ><code>{{ JSON.stringify(astJson, null, 2) }}</code></pre>
      </div>
    </var-popup>
  </div>
</template>

<style scoped>
.tester-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--color-surface);
  color: var(--color-on-surface);
  font-size: 0.9rem;
}

/* 顶部控制栏 */
.tester-header {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
  z-index: 10;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  gap: 12px;
}

.preset-select {
  flex: 1;
  max-width: 140px;
}

.action-buttons {
  display: flex;
  gap: 6px;
}

.control-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  height: 28px;
}

/* 导航 Tab */
.tab-nav {
  display: flex;
  border-top: var(--border-width) solid var(--border-color);
}

.tab-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 6px 0;
  background: transparent;
  border: none;
  color: var(--text-color-secondary);
  font-size: 0.75rem;
  transition: all 0.2s;
}

.tab-item.active {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb), 0.05);
}

/* 主工作区 */
.tester-workspace {
  flex: 1;
  overflow: hidden;
  position: relative;
}

.workspace-pane {
  width: 100%;
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

/* 编辑视图 */
.edit-pane {
  padding: 12px;
}

.markdown-textarea {
  width: 100%;
  height: 100%;
  border: none;
  resize: none;
  background-color: var(--input-bg);
  color: var(--text-color);
  font-family: monospace;
  font-size: 0.85rem;
  line-height: 1.5;
  padding: 8px;
  border-radius: 6px;
  box-sizing: border-box;
}

.markdown-textarea:focus {
  outline: none;
}

/* 预览视图 */
.preview-pane {
  padding: 16px;
}
.render-wrapper {
  background-color: var(--card-bg);
  border-radius: 8px;
  padding: 16px;
  border: var(--border-width) solid var(--border-color);
}

.render-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  border-bottom: var(--border-width) dashed var(--border-color);
  padding-bottom: 8px;
}

.render-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color-secondary);
}

.copy-html-btn {
  padding: 0 4px;
  height: 20px;
}

.drawer-header-actions {
  display: flex;
  align-items: center;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* 帘幕视图 */
.curtain-pane {
  display: flex;
  flex-direction: column;
}

.curtain-rendered {
  padding: 16px;
  flex-shrink: 0;
}

.curtain-karaoke {
  padding: 12px 16px;
  font-family: monospace;
  font-size: 0.8rem;
  line-height: 1.5;
  border-top: 1px dashed var(--border-color);
  background-color: rgba(var(--color-primary-rgb), 0.02);
  margin-top: auto;
}

.karaoke-line {
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.5em;
}

.karaoke-current {
  color: var(--text-color);
}

.karaoke-consumed {
  color: var(--color-primary);
  background-color: rgba(var(--color-primary-rgb), 0.08);
  border-radius: 2px;
}

.karaoke-pending {
  color: var(--text-color);
}

.karaoke-future {
  color: var(--text-color-secondary);
  opacity: 0.4;
}

.karaoke-more {
  font-size: 0.75rem;
  color: var(--text-color-placeholder);
  text-align: center;
  margin-top: 4px;
}

/* 配置视图 */
.debug-pane {
  padding: 16px;
}

.config-group {
  background-color: var(--card-bg);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
  border: var(--border-width) solid var(--border-color);
}

.config-title {
  margin: 0 0 12px 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
  border-left: 3px solid var(--color-primary);
  padding-left: 6px;
}

.config-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.config-item:last-child {
  margin-bottom: 0;
}

.config-label {
  font-size: 0.8rem;
  color: var(--text-color-secondary);
}

.config-slider {
  width: 120px;
}

.range-inputs {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 120px;
}

/* 底部状态栏 */
.tester-footer {
  display: flex;
  background-color: var(--card-bg);
  border-top: var(--border-width) solid var(--border-color);
  padding: 6px 0;
  flex-shrink: 0;
}

.stat-item {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-right: var(--border-width) solid var(--border-color);
}

.stat-item:last-child {
  border-right: none;
}

.stat-val {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text-color);
}

.stat-lbl {
  font-size: 0.65rem;
  color: var(--text-color-placeholder);
}

/* AST 抽屉 */
.ast-drawer {
  height: 60vh;
  border-radius: 12px 12px 0 0;
  display: flex;
  flex-direction: column;
  background-color: var(--color-surface);
}

.drawer-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: var(--border-width) solid var(--border-color);
}

.drawer-header h3 {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 600;
}

.drawer-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.ast-json {
  margin: 0;
  font-family: monospace;
  font-size: 0.75rem;
  background-color: var(--input-bg);
  padding: 8px;
  border-radius: 6px;
  overflow-x: auto;
}
</style>
