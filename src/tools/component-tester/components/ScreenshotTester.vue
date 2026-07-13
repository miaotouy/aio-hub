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
  <div class="screenshot-tester">
    <div class="test-header">
      <h3>截图方案验证测试</h3>
      <p class="test-desc">
        验证 modern-screenshot 在 Tauri WebView2 中的表现，以及 Canvas
        裁剪拼接算法
      </p>
    </div>

    <div class="test-grid">
      <!-- 左侧：测试内容区域 -->
      <div class="test-left">
        <div class="test-section">
          <h4>1. DOM 转图片测试 (modern-screenshot)</h4>
          <div class="test-controls">
            <el-button
              type="primary"
              size="small"
              @click="captureDomScreenshot()"
              :loading="capturing"
            >
              截取下方区域
            </el-button>
            <el-button size="small" @click="captureDomScreenshot(2)">
              2x 高清截图
            </el-button>
            <el-button size="small" @click="captureDomScreenshot(dpr)">
              设备像素比截图 ({{ dpr }}x)
            </el-button>
          </div>
        </div>

        <!-- 截图目标区域 -->
        <div ref="captureTarget" class="capture-target">
          <!-- 测试项 A: 毛玻璃效果 -->
          <div class="test-card glass-card">
            <div class="card-label">A. 毛玻璃效果 (backdrop-filter)</div>
            <div class="glass-content">
              <div class="glass-blob blob-1"></div>
              <div class="glass-blob blob-2"></div>
              <div class="glass-text">
                <p>这段文字应该在毛玻璃背景上</p>
                <p>如果截图后背景变透明，说明毛玻璃丢失</p>
              </div>
            </div>
          </div>

          <!-- 测试项 B: CSS 变量 -->
          <div class="test-card css-var-card">
            <div class="card-label">B. CSS 变量 & 主题色</div>
            <div class="css-var-content">
              <div
                class="var-swatch"
                style="background: var(--el-color-primary)"
              >
                --el-color-primary
              </div>
              <div
                class="var-swatch"
                style="background: var(--el-color-success)"
              >
                --el-color-success
              </div>
              <div
                class="var-swatch"
                style="background: var(--el-color-warning)"
              >
                --el-color-warning
              </div>
              <div
                class="var-swatch"
                style="background: var(--el-color-danger)"
              >
                --el-color-danger
              </div>
              <div class="var-swatch" style="background: var(--card-bg)">
                --card-bg
              </div>
              <div
                class="var-swatch"
                style="background: var(--text-color); color: var(--card-bg)"
              >
                --text-color
              </div>
            </div>
          </div>

          <!-- 测试项 C: SVG 图标 -->
          <div class="test-card icon-card">
            <div class="card-label">C. SVG 图标 (lucide-vue-next)</div>
            <div class="icon-row">
              <MessageSquare :size="24" />
              <Bot :size="24" />
              <UserIcon :size="24" />
              <Settings :size="24" />
              <ImageIcon :size="24" />
              <Code :size="24" />
              <FileText :size="24" />
              <Zap :size="24" />
            </div>
          </div>

          <!-- 测试项 D: 渐变 & 阴影 -->
          <div class="test-card gradient-card">
            <div class="card-label">D. 渐变 & 阴影</div>
            <div class="gradient-row">
              <div class="gradient-box g1"></div>
              <div class="gradient-box g2"></div>
              <div class="gradient-box g3"></div>
            </div>
            <div class="shadow-row">
              <div class="shadow-box s1">轻阴影</div>
              <div class="shadow-box s2">中阴影</div>
              <div class="shadow-box s3">重阴影</div>
            </div>
          </div>

          <!-- 测试项 E: content-visibility -->
          <div class="test-card cv-card">
            <div class="card-label">E. content-visibility: auto 测试</div>
            <el-switch
              v-model="contentVisibilityEnabled"
              active-text="启用"
              inactive-text="禁用"
            />
            <div
              class="cv-container"
              :class="{ 'cv-enabled': contentVisibilityEnabled }"
            >
              <div v-for="i in 20" :key="i" class="cv-item">
                消息 #{{ i }}：这是第 {{ i }} 条模拟消息内容，用于测试
                content-visibility 对截图的影响。
              </div>
            </div>
          </div>

          <!-- 测试项 F: iframe 内容渲染 -->
          <div class="test-card iframe-card">
            <div class="card-label">
              F. iframe 内容渲染 (modern-screenshot 限制验证)
            </div>
            <p class="iframe-desc">
              验证 modern-screenshot 对 iframe 的渲染能力。
              <br />
              <strong>原理说明：</strong>
              <br />
              1. <strong>同源/未受限 iframe：</strong>如果 iframe
              与父页面同源（或使用 srcdoc 且允许同源），modern-screenshot
              可以通过 <code>contentDocument</code> 访问并克隆其 DOM
              树，因此<strong>可以</strong>被捕获。
              <br />
              2. <strong>跨域/沙箱受限 iframe：</strong>如果 iframe
              跨域或被沙箱限制（未启用
              <code>allow-same-origin</code>），浏览器会阻止跨域 DOM
              访问，导致截图时该区域显示为<strong>空白</strong>。
            </p>
            <div class="iframe-test-row">
              <div class="iframe-wrapper">
                <div class="iframe-label">1. 同源 iframe (预期可捕获)</div>
                <iframe
                  class="test-iframe"
                  srcdoc="<!DOCTYPE html><html><head><style>body{margin:0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#28a745,#1e7e34);color:white;font-size:13px;}</style></head><body><div>✅ 同源 iframe (可捕获)</div></body></html>"
                  sandbox="allow-same-origin"
                ></iframe>
              </div>
              <div class="iframe-wrapper">
                <div class="iframe-label">2. 沙箱受限 iframe (预期空白)</div>
                <iframe
                  class="test-iframe"
                  srcdoc="<!DOCTYPE html><html><head><style>body{margin:0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#dc3545,#bd2130);color:white;font-size:13px;}</style></head><body><div>❌ 沙箱受限 iframe (空白)</div></body></html>"
                  sandbox=""
                ></iframe>
              </div>
              <div class="iframe-wrapper">
                <div class="iframe-label">
                  3. onCloneNode 替换
                  <el-tag
                    v-if="iframeUsePlaceholder"
                    type="warning"
                    size="small"
                    style="margin-left: 4px"
                    >截图时替换</el-tag
                  >
                </div>
                <iframe
                  class="test-iframe"
                  srcdoc="<!DOCTYPE html><html><head><style>body{margin:0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:linear-gradient(135deg,#667eea,#764ba2);color:white;font-size:13px;}</style></head><body><div>🔄 可替换 iframe</div></body></html>"
                  sandbox="allow-same-origin"
                ></iframe>
              </div>
            </div>
            <div class="iframe-test-controls">
              <el-switch
                v-model="iframeUsePlaceholder"
                active-text="截图时：替换 iframe 为占位图"
                inactive-text="截图时：保留原始 iframe"
              />
              <el-button size="small" @click="captureIframeTest">
                单独截取 iframe 区域
              </el-button>
            </div>
          </div>

          <!-- 测试项 G: 模拟聊天气泡 -->
          <div class="test-card chat-card">
            <div class="card-label">G. 模拟聊天气泡布局</div>
            <div class="chat-simulation">
              <div class="chat-msg msg-user">
                <div class="chat-avatar user-avatar">U</div>
                <div class="chat-bubble">你好，请帮我写一段代码</div>
              </div>
              <div class="chat-msg msg-assistant">
                <div class="chat-avatar assistant-avatar">A</div>
                <div class="chat-bubble">
                  当然可以！请问你需要什么语言的代码？
                </div>
              </div>
              <div class="chat-msg msg-user">
                <div class="chat-avatar user-avatar">U</div>
                <div class="chat-bubble">TypeScript</div>
              </div>
              <div class="chat-msg msg-assistant">
                <div class="chat-avatar assistant-avatar">A</div>
                <div class="chat-bubble code-bubble">
                  <pre><code>function greet(name: string): string {
  return `Hello, ${name}!`;
}</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 测试项 H: onCloneNode 钩子替换测试 -->
        <div class="test-card clone-node-card">
          <div class="card-label">
            H. onCloneNode 钩子替换 (截图时 DOM 替换策略)
          </div>
          <p class="clone-node-desc">
            验证 modern-screenshot 的
            <code>onCloneNode</code> 钩子能否在截图时将 iframe
            替换为静态占位图。
          </p>
          <div class="clone-node-test-row">
            <div ref="cloneNodeTarget" class="clone-node-target">
              <div class="clone-node-label">此区域包含 iframe + 毛玻璃</div>
              <div class="glass-content" style="margin-bottom: 12px">
                <div class="glass-blob blob-1"></div>
                <div class="glass-blob blob-2"></div>
                <div class="glass-text">
                  <p>毛玻璃 + iframe 混合区域</p>
                  <p>验证截图时 onCloneNode 能否正确替换 iframe</p>
                </div>
              </div>
              <iframe
                class="test-iframe small-iframe"
                srcdoc="<!DOCTYPE html><html><head><style>body{margin:0;font-family:sans-serif;padding:16px;background:linear-gradient(135deg,#667eea,#764ba2);color:white;font-size:14px;line-height:1.6;}</style></head><body><div style='font-size:18px;margin-bottom:8px'>📊 数据面板</div><div>项目 A: 1,234 次</div><div>项目 B: 567 次</div><div>项目 C: 890 次</div></body></html>"
                sandbox="allow-same-origin"
              ></iframe>
            </div>
          </div>
          <div class="test-controls" style="margin-top: 8px">
            <el-button
              type="primary"
              size="small"
              @click="captureWithCloneNode()"
            >
              截图 (onCloneNode 替换 iframe)
            </el-button>
            <el-button size="small" @click="captureWithoutCloneNode()">
              截图 (不替换 iframe，对照)
            </el-button>
          </div>
        </div>

        <!-- 消息分组截图测试区域 -->
        <div class="test-section" style="margin-top: 16px">
          <h4>2. 消息分组截图 + Canvas 拼接测试（高度分组 & 间隙控制）</h4>
          <p class="test-desc" style="margin-bottom: 8px">
            模拟 LLM Chat
            截图场景：支持按消息数量或内容高度分组，每组独立截图后拼接成长图。
            不依赖 scrollTop，组间间隙可配置以匹配实际消息间距。
          </p>
          <div class="test-controls">
            <el-button
              type="success"
              size="small"
              @click="testScrollScreenshot"
              :loading="scrollCapturing"
            >
              执行分组截图
            </el-button>
            <label style="margin-left: 12px; font-size: 13px">
              分组方式:
              <el-select v-model="groupMode" size="small" style="width: 120px">
                <el-option label="按消息数" value="count" />
                <el-option label="按内容高度" value="height" />
              </el-select>
            </label>
            <label v-if="groupMode === 'count'" style="font-size: 13px">
              每组消息数:
              <el-input-number
                v-model="messagesPerGroup"
                :min="2"
                :max="20"
                :step="2"
                size="small"
                style="width: 120px"
              />
            </label>
            <label v-if="groupMode === 'height'" style="font-size: 13px">
              每组最大高度:
              <el-input-number
                v-model="maxGroupHeight"
                :min="500"
                :max="5000"
                :step="100"
                size="small"
                style="width: 140px"
              />
              px
            </label>
            <label style="font-size: 13px">
              组间间隙:
              <el-input-number
                v-model="groupGap"
                :min="0"
                :max="20"
                :step="1"
                size="small"
                style="width: 100px"
              />
              px
            </label>
          </div>
          <div class="scroll-target">
            <div ref="scrollContent" class="scroll-content">
              <div
                v-for="i in 50"
                :key="i"
                class="scroll-item"
                :class="i % 2 === 0 ? 'even' : 'odd'"
              >
                <div class="scroll-item-avatar">
                  {{ i % 2 === 0 ? "🤖" : "👤" }}
                </div>
                <div class="scroll-item-content">
                  <div class="scroll-item-role">
                    {{ i % 2 === 0 ? "Assistant" : "User" }}
                  </div>
                  <div class="scroll-item-text">
                    {{ getScrollMessageContent(i) }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Canvas 裁剪拼接测试 -->
        <div class="test-section" style="margin-top: 16px">
          <h4>3. Canvas 裁剪拼接算法测试</h4>
          <div class="test-controls">
            <el-button type="warning" size="small" @click="testCanvasStitch">
              测试 Canvas 拼接
            </el-button>
          </div>
        </div>
      </div>

      <!-- 右侧：截图结果 -->
      <div class="test-right">
        <div class="result-header">
          <h4>截图结果</h4>
          <el-button v-if="resultImage" size="small" @click="saveResult"
            >保存图片</el-button
          >
        </div>
        <div class="result-area">
          <img
            v-if="resultImage"
            :src="resultImage"
            class="result-img"
            @click="imageViewer.show(resultImage)"
          />
          <div v-else class="result-placeholder">点击左侧按钮进行截图测试</div>
        </div>
        <div v-if="resultInfo" class="result-info">
          <p v-for="(val, key) in resultInfo" :key="key">
            <strong>{{ key }}:</strong> {{ val }}
          </p>
        </div>
        <div v-if="testLog.length" class="test-log">
          <h5>测试日志</h5>
          <div
            v-for="(log, i) in testLog"
            :key="i"
            class="log-entry"
            :class="log.type"
          >
            {{ log.time }} - {{ log.msg }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { domToPng, domToBlob } from "modern-screenshot";
import type { Options } from "modern-screenshot";
import {
  MessageSquare,
  Bot,
  User as UserIcon,
  Settings,
  Image as ImageIcon,
  Code,
  FileText,
  Zap,
} from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { useImageViewer } from "@/composables/useImageViewer";

const dpr = window.devicePixelRatio;

const captureTarget = ref<HTMLElement>();
const scrollContent = ref<HTMLElement>();

const capturing = ref(false);
const scrollCapturing = ref(false);
const resultImage = ref<string>();
const resultInfo = ref<Record<string, string>>();
const contentVisibilityEnabled = ref(false);
const messagesPerGroup = ref(10);
const groupMode = ref<"count" | "height">("height");
const maxGroupHeight = ref(2000);
const groupGap = ref(4);
const iframeUsePlaceholder = ref(true);

const cloneNodeTarget = ref<HTMLElement>();

const imageViewer = useImageViewer();

const testLog = reactive<
  { type: "info" | "warn" | "error" | "success"; time: string; msg: string }[]
>([]);

function addLog(type: (typeof testLog)[number]["type"], msg: string) {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}.${now.getMilliseconds().toString().padStart(3, "0")}`;
  testLog.unshift({ type, time, msg });
}

/** 滚动截图测试用的消息内容生成 */
function getScrollMessageContent(i: number): string {
  const templates = [
    `这是第 ${i} 条消息。请帮我分析一下这段代码的性能瓶颈，特别是在处理大规模数据集时的内存使用情况和时间复杂度分析。`,
    `第 ${i} 条：好的，我来详细解释一下这个算法的工作原理。首先，我们需要理解时间复杂度和空间复杂度的概念，然后分析具体的实现细节和优化策略。`,
    `消息 ${i}：根据你的需求，我建议使用虚拟滚动技术来优化长列表的渲染性能。这样可以只渲染可见区域内的元素，大大减少 DOM 节点数量，提升页面响应速度。`,
    `第 ${i} 条消息。短消息。`,
    `消息 ${i}：在滚动截图的场景中，消息内容的长度和分布对拼接质量有重要影响。较长的消息更容易跨越视口边界，需要拼接算法正确处理重叠区域，避免文字断裂或重复。`,
    `第 ${i} 条：可以考虑使用 IntersectionObserver 来监听元素的可见性变化，结合 requestAnimationFrame 进行节流，以实现更高效的滚动截取方案。`,
  ];
  return templates[i % templates.length];
}

/** DOM 转图片测试 */
async function captureDomScreenshot(scale: number = 1) {
  if (!captureTarget.value) return;
  capturing.value = true;
  resultInfo.value = undefined;
  const startTime = performance.now();

  try {
    addLog("info", `开始截图, scale=${scale}`);

    const dataUrl = await domToPng(captureTarget.value, {
      scale,
      features: {
        removeControlCharacter: true,
      },
    });

    const elapsed = Math.round(performance.now() - startTime);
    addLog("success", `截图完成, 耗时 ${elapsed}ms`);

    resultImage.value = dataUrl;

    // 计算图片尺寸
    const img = document.createElement("img");
    img.onload = () => {
      resultInfo.value = {
        图片宽度: `${img.naturalWidth}px`,
        图片高度: `${img.naturalHeight}px`,
        截图耗时: `${elapsed}ms`,
        缩放比例: `${scale}x`,
        数据大小: `${(dataUrl.length / 1024).toFixed(1)} KB (Base64)`,
      };
    };
    img.src = dataUrl;
  } catch (err) {
    addLog("error", `截图失败: ${err}`);
    customMessage.error(`截图失败: ${err}`);
  } finally {
    capturing.value = false;
  }
}

/** 消息分组截图测试 - 支持按消息数量或内容高度分组，组间间隙可配置 */
async function testScrollScreenshot() {
  if (!scrollContent.value) return;
  scrollCapturing.value = true;
  resultInfo.value = undefined;
  testLog.length = 0;

  const content = scrollContent.value;
  const items = Array.from(
    content.querySelectorAll(".scroll-item")
  ) as HTMLElement[];

  // 根据分组模式构建分组
  const groups: HTMLElement[][] = [];

  if (groupMode.value === "count") {
    // 按消息数量分组
    const groupSize = messagesPerGroup.value;
    for (let i = 0; i < items.length; i += groupSize) {
      groups.push(items.slice(i, i + groupSize));
    }
  } else {
    // 按内容高度分组：每组总高度不超过 maxGroupHeight
    const maxHeight = maxGroupHeight.value;
    let currentGroup: HTMLElement[] = [];
    let currentHeight = 0;

    for (const item of items) {
      const style = getComputedStyle(item);
      const itemHeight = item.offsetHeight;
      const marginBottom = parseFloat(style.marginBottom) || 0;
      const totalItemHeight = itemHeight + marginBottom;

      if (
        currentGroup.length > 0 &&
        currentHeight + totalItemHeight > maxHeight
      ) {
        groups.push(currentGroup);
        currentGroup = [item];
        currentHeight = totalItemHeight;
      } else {
        currentGroup.push(item);
        currentHeight += totalItemHeight;
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
  }

  // 自动检测消息间的自然间隙（用于日志对比）
  const naturalGap =
    items.length > 0
      ? parseFloat(getComputedStyle(items[0]).marginBottom) || 0
      : 0;

  addLog(
    "info",
    `共 ${items.length} 条消息, 分 ${groups.length} 组, 分组方式: ${groupMode.value === "count" ? `每组 ${messagesPerGroup.value} 条` : `最大高度 ${maxGroupHeight.value}px`}`
  );
  addLog(
    "info",
    `检测到消息自然间隙: ${naturalGap}px, 组间间隙设置: ${groupGap.value}px`
  );

  const captures: HTMLCanvasElement[] = [];
  const totalStart = performance.now();

  try {
    // 先隐藏所有消息
    items.forEach((item) => (item.style.display = "none"));

    for (let g = 0; g < groups.length; g++) {
      // 显示当前组的消息
      groups[g].forEach((item) => (item.style.display = ""));

      // 等待渲染
      await new Promise((resolve) => requestAnimationFrame(resolve));
      await new Promise((resolve) => requestAnimationFrame(resolve));

      try {
        // 截取 scroll-content 容器（只包含当前组的消息）
        const blob = await domToBlob(content, {
          scale: 1,
          features: {
            removeControlCharacter: true,
          },
          onCloneNode: (clonedNode: Node) => {
            const el = clonedNode as HTMLElement;
            // 移除容器边框和内边距，使截图只包含纯消息内容
            el.style.border = "none";
            el.style.borderRadius = "0";
            el.style.padding = "0";

            // 移除最后一个子元素的 margin-bottom，避免截图底部多余空白
            // 拼接时通过 groupGap 显式控制组间间隙，使其与消息自然间隙一致
            const children = el.querySelectorAll(".scroll-item");
            if (children.length > 0) {
              const lastChild = children[children.length - 1] as HTMLElement;
              lastChild.style.marginBottom = "0";
            }
          },
        } as Options);

        if (!blob) {
          addLog("error", `第 ${g} 组截图失败: blob 为空`);
          break;
        }

        // blob → canvas
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();

        captures.push(canvas);

        const groupStartIdx = items.indexOf(groups[g][0]) + 1;
        const groupEndIdx = items.indexOf(groups[g][groups[g].length - 1]) + 1;
        addLog(
          "success",
          `第 ${g} 组截图成功: 消息 ${groupStartIdx}-${groupEndIdx} (${groups[g].length} 条, ${canvas.width}x${canvas.height})`
        );
      } catch (err) {
        addLog("error", `第 ${g} 组截图失败: ${err}`);
        break;
      }

      // 隐藏当前组的消息（为下一组准备）
      groups[g].forEach((item) => (item.style.display = "none"));
    }

    // 恢复所有消息显示
    items.forEach((item) => (item.style.display = ""));

    // 拼接所有组（带组间间隙）
    if (captures.length > 0) {
      addLog(
        "info",
        `开始拼接 ${captures.length} 组截图, 组间间隙: ${groupGap.value}px...`
      );
      const stitchStart = performance.now();

      const width = captures[0].width;
      const gap = groupGap.value; // CSS pixels，scale:1 时与 canvas 像素一致
      let totalHeight = 0;
      for (let i = 0; i < captures.length; i++) {
        totalHeight += captures[i].height;
        if (i < captures.length - 1) {
          totalHeight += gap;
        }
      }

      const stitchCanvas = document.createElement("canvas");
      stitchCanvas.width = width;
      stitchCanvas.height = totalHeight;
      const stitchCtx = stitchCanvas.getContext("2d")!;

      let yOffset = 0;
      for (let i = 0; i < captures.length; i++) {
        stitchCtx.drawImage(captures[i], 0, yOffset);
        addLog(
          "info",
          `拼接第 ${i} 组, y偏移: ${yOffset}px, 高度: ${captures[i].height}px`
        );
        yOffset += captures[i].height;
        if (i < captures.length - 1) {
          yOffset += gap;
        }
      }

      const stitchElapsed = Math.round(performance.now() - stitchStart);
      const totalElapsed = Math.round(performance.now() - totalStart);
      addLog(
        "success",
        `拼接完成, 拼接耗时 ${stitchElapsed}ms, 总耗时 ${totalElapsed}ms, 最终尺寸: ${stitchCanvas.width}x${stitchCanvas.height}`
      );

      resultImage.value = stitchCanvas.toDataURL("image/png");
      resultInfo.value = {
        截图方案: "按消息分组截图",
        分组方式: groupMode.value === "count" ? "按消息数" : "按内容高度",
        消息总数: `${items.length}`,
        分组数量: `${captures.length}`,
        ...(groupMode.value === "count"
          ? { 每组消息数: `${messagesPerGroup.value}` }
          : { 每组最大高度: `${maxGroupHeight.value}px` }),
        组间间隙: `${groupGap.value}px (自然间隙: ${naturalGap}px)`,
        最终宽度: `${stitchCanvas.width}px`,
        最终高度: `${stitchCanvas.height}px`,
        总耗时: `${totalElapsed}ms`,
      };
    }
  } catch (err) {
    // 确保恢复所有消息显示
    items.forEach((item) => (item.style.display = ""));
    addLog("error", `分组截图失败: ${err}`);
    customMessage.error(`分组截图失败: ${err}`);
  } finally {
    scrollCapturing.value = false;
  }
}

/** Canvas 裁剪拼接算法测试 */
function testCanvasStitch() {
  addLog("info", "开始 Canvas 裁剪拼接算法测试...");

  const width = 400;
  const height = 200;
  const colors = ["#667eea", "#764ba2", "#f093fb"];
  const labels = ["截图 A", "截图 B", "截图 C"];

  const canvases: HTMLCanvasElement[] = [];

  for (let i = 0; i < 3; i++) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;

    // 渐变背景
    const gradient = ctx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, colors[i]);
    gradient.addColorStop(1, colors[(i + 1) % 3]);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    // 标签
    ctx.fillStyle = "white";
    ctx.font = "bold 24px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(labels[i], width / 2, height / 2);

    // 网格线（用于验证拼接对齐）
    ctx.strokeStyle = "rgba(255,255,255,0.3)";
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 50) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 50) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    canvases.push(canvas);
    addLog("info", `创建模拟截图 ${labels[i]} (${width}x${height})`);
  }

  // 拼接
  const stitchCanvas = document.createElement("canvas");
  stitchCanvas.width = width;
  stitchCanvas.height = height * 3;
  const stitchCtx = stitchCanvas.getContext("2d")!;

  for (let i = 0; i < canvases.length; i++) {
    stitchCtx.drawImage(canvases[i], 0, i * height);
    addLog("info", `拼接 ${labels[i]} 到 y=${i * height}`);
  }

  // 添加拼接线标记
  stitchCtx.strokeStyle = "#ff0000";
  stitchCtx.lineWidth = 2;
  stitchCtx.setLineDash([5, 5]);
  for (let i = 1; i < 3; i++) {
    stitchCtx.beginPath();
    stitchCtx.moveTo(0, i * height);
    stitchCtx.lineTo(width, i * height);
    stitchCtx.stroke();
  }

  resultImage.value = stitchCanvas.toDataURL("image/png");
  resultInfo.value = {
    测试类型: "Canvas 裁剪拼接算法",
    截图数量: "3",
    单张尺寸: `${width}x${height}`,
    拼接尺寸: `${stitchCanvas.width}x${stitchCanvas.height}`,
  };

  addLog("success", "Canvas 拼接测试完成");
}

/** 单独截取 iframe 区域测试 - 根据开关决定是否使用 onCloneNode 替换 */
async function captureIframeTest() {
  if (!captureTarget.value) return;
  capturing.value = true;
  const startTime = performance.now();

  try {
    const usePlaceholder = iframeUsePlaceholder.value;
    addLog(
      "info",
      `开始截取 iframe 区域, onCloneNode 替换: ${usePlaceholder ? "开启" : "关闭"}`
    );

    // 找到 iframe-card 区域
    const iframeCard = captureTarget.value.querySelector(".iframe-card");
    if (!iframeCard) {
      addLog("error", "未找到 iframe-card 元素");
      return;
    }

    const options: Options = {
      scale: 1,
      features: {
        removeControlCharacter: true,
      },
    };

    if (usePlaceholder) {
      // 开启占位图模式：截图时将所有 iframe 替换为静态占位图
      options.onCloneNode = (clonedNode: Node) => {
        const clonedEl = clonedNode as HTMLElement;
        const iframes = clonedEl.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          const placeholder = document.createElement("div");
          placeholder.className = "iframe-placeholder";
          placeholder.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: ${iframe.offsetWidth || 200}px;
            height: ${iframe.offsetHeight || 120}px;
            border: 2px dashed var(--border-color);
            border-radius: 8px;
            background: repeating-linear-gradient(
              45deg,
              transparent,
              transparent 8px,
              rgba(102, 126, 234, 0.06) 8px,
              rgba(102, 126, 234, 0.06) 16px
            );
            color: var(--text-color-secondary);
            font-family: sans-serif;
            gap: 4px;
          `;
          placeholder.innerHTML = `
            <div style="font-size: 20px; margin-bottom: 2px;">📷</div>
            <div style="font-size: 13px; font-weight: 600;">iframe 内容 (截图占位)</div>
            <div style="font-size: 11px; opacity: 0.6;">原始内容在截图时被替换</div>
          `;
          iframe.replaceWith(placeholder);
        });
      };
    }

    const dataUrl = await domToPng(iframeCard as HTMLElement, options);

    const elapsed = Math.round(performance.now() - startTime);
    addLog(
      "success",
      `iframe 区域截图完成, 耗时 ${elapsed}ms, 替换模式: ${usePlaceholder ? "是" : "否"}`
    );

    resultImage.value = dataUrl;

    const img = document.createElement("img");
    img.onload = () => {
      resultInfo.value = {
        测试类型: "iframe 区域截图",
        图片宽度: `${img.naturalWidth}px`,
        图片高度: `${img.naturalHeight}px`,
        截图耗时: `${elapsed}ms`,
        onCloneNode替换: usePlaceholder
          ? "已替换 iframe 为占位图"
          : "未替换 (保留原始)",
        备注: usePlaceholder
          ? "所有 iframe 在截图时被替换为静态占位图"
          : "同源 iframe 内容可被捕获，沙箱受限 iframe 为空白",
      };
    };
    img.src = dataUrl;
  } catch (err) {
    addLog("error", `iframe 截图失败: ${err}`);
    customMessage.error(`iframe 截图失败: ${err}`);
  } finally {
    capturing.value = false;
  }
}

/** 使用 onCloneNode 钩子截图（替换 iframe 为占位图） */
async function captureWithCloneNode() {
  if (!cloneNodeTarget.value) return;
  capturing.value = true;
  const startTime = performance.now();

  try {
    addLog("info", "开始截图 (onCloneNode 替换 iframe)...");

    const dataUrl = await domToPng(cloneNodeTarget.value, {
      scale: 1,
      features: {
        removeControlCharacter: true,
      },
      onCloneNode: (clonedNode: Node) => {
        const clonedEl = clonedNode as HTMLElement;
        // 在克隆的 DOM 中，将 iframe 替换为静态占位图
        const iframes = clonedEl.querySelectorAll("iframe");
        iframes.forEach((iframe) => {
          const placeholder = document.createElement("div");
          placeholder.style.cssText = `
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: ${iframe.offsetWidth || 200}px;
            height: ${iframe.offsetHeight || 100}px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 8px;
            color: white;
            font-family: sans-serif;
            font-size: 14px;
          `;
          placeholder.innerHTML = `
            <div style="font-size: 24px; margin-bottom: 4px;">📄</div>
            <div>iframe 内容 (截图占位)</div>
          `;
          iframe.replaceWith(placeholder);
        });

        // 同时将毛玻璃替换为实色背景
        const glassContents = clonedEl.querySelectorAll(".glass-content");
        glassContents.forEach((el) => {
          const htmlEl = el as HTMLElement;
          htmlEl.style.backdropFilter = "none";
          htmlEl.style.backgroundColor = "rgba(102, 126, 234, 0.85)";
          // 移除装饰性 blob（它们在截图时可能不显示）
          const blobs = htmlEl.querySelectorAll(".glass-blob");
          blobs.forEach((blob) => blob.remove());
        });
      },
    } as Options);

    const elapsed = Math.round(performance.now() - startTime);
    addLog("success", `onCloneNode 截图完成, 耗时 ${elapsed}ms`);

    resultImage.value = dataUrl;

    const img = document.createElement("img");
    img.onload = () => {
      resultInfo.value = {
        测试类型: "onCloneNode 替换截图",
        图片宽度: `${img.naturalWidth}px`,
        图片高度: `${img.naturalHeight}px`,
        截图耗时: `${elapsed}ms`,
        替换策略: "iframe → 静态占位图, 毛玻璃 → 实色背景",
      };
    };
    img.src = dataUrl;
  } catch (err) {
    addLog("error", `onCloneNode 截图失败: ${err}`);
    customMessage.error(`onCloneNode 截图失败: ${err}`);
  } finally {
    capturing.value = false;
  }
}

/** 不使用 onCloneNode 钩子截图（对照） */
async function captureWithoutCloneNode() {
  if (!cloneNodeTarget.value) return;
  capturing.value = true;
  const startTime = performance.now();

  try {
    addLog("info", "开始截图 (不替换 iframe，对照)...");

    const dataUrl = await domToPng(cloneNodeTarget.value, {
      scale: 1,
      features: {
        removeControlCharacter: true,
      },
    });

    const elapsed = Math.round(performance.now() - startTime);
    addLog("success", `对照截图完成, 耗时 ${elapsed}ms`);

    resultImage.value = dataUrl;

    const img = document.createElement("img");
    img.onload = () => {
      resultInfo.value = {
        测试类型: "对照截图 (不替换)",
        图片宽度: `${img.naturalWidth}px`,
        图片高度: `${img.naturalHeight}px`,
        截图耗时: `${elapsed}ms`,
        备注: "iframe 内部预期为空白区域",
      };
    };
    img.src = dataUrl;
  } catch (err) {
    addLog("error", `对照截图失败: ${err}`);
    customMessage.error(`对照截图失败: ${err}`);
  } finally {
    capturing.value = false;
  }
}

/** 保存结果图片 */
async function saveResult() {
  if (!resultImage.value) return;

  try {
    // Base64 → Uint8Array
    const base64Data = resultImage.value.split(",")[1];
    const binaryStr = atob(base64Data);
    const buffer = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      buffer[i] = binaryStr.charCodeAt(i);
    }

    const { save } = await import("@tauri-apps/plugin-dialog");
    const { writeFile } = await import("@tauri-apps/plugin-fs");

    const filePath = await save({
      defaultPath: `screenshot-test-${Date.now()}.png`,
      filters: [{ name: "PNG", extensions: ["png"] }],
    });

    if (filePath) {
      await writeFile(filePath, buffer);
      customMessage.success("图片已保存");
    }
  } catch {
    // Fallback: 浏览器下载
    const link = document.createElement("a");
    link.download = `screenshot-test-${Date.now()}.png`;
    link.href = resultImage.value;
    link.click();
    customMessage.success("图片已下载（浏览器方式）");
  }
}
</script>

<style scoped>
.screenshot-tester {
  padding: 16px;
  height: 100%;
  overflow: auto;
  box-sizing: border-box;
}

.test-header {
  margin-bottom: 16px;
}

.test-header h3 {
  margin: 0 0 4px 0;
  font-size: 16px;
  color: var(--text-color);
}

.test-desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.test-grid {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.test-left {
  flex: 1;
  min-width: 0;
}

.test-right {
  width: 400px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
}

.test-section h4 {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--text-color);
}

.test-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

/* 截图目标区域 */
.capture-target {
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background-color: var(--container-bg);
}

.test-card {
  border-radius: 8px;
  padding: 12px;
  border: var(--border-width) solid var(--border-color);
}

.card-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

/* A. 毛玻璃 */
.glass-card {
  position: relative;
  overflow: hidden;
  background-color: transparent;
}

.glass-content {
  position: relative;
  padding: 16px;
  border-radius: 8px;
  backdrop-filter: blur(12px);
  background-color: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.2);
  overflow: hidden;
}

.glass-blob {
  position: absolute;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  filter: blur(40px);
}

.blob-1 {
  background: #667eea;
  top: -20px;
  left: -20px;
}

.blob-2 {
  background: #f093fb;
  bottom: -20px;
  right: -20px;
}

.glass-text {
  position: relative;
  z-index: 1;
  color: white;
  font-size: 14px;
}

.glass-text p {
  margin: 4px 0;
}

/* B. CSS 变量 */
.css-var-card {
  background-color: var(--card-bg);
}

.css-var-content {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.var-swatch {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 11px;
  color: white;
  font-family: monospace;
}

/* C. 图标 */
.icon-card {
  background-color: var(--card-bg);
}

.icon-row {
  display: flex;
  gap: 16px;
  color: var(--text-color);
}

/* D. 渐变 & 阴影 */
.gradient-card {
  background-color: var(--card-bg);
}

.gradient-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.gradient-box {
  width: 80px;
  height: 50px;
  border-radius: 6px;
}

.g1 {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.g2 {
  background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
}

.g3 {
  background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
}

.shadow-row {
  display: flex;
  gap: 8px;
}

.shadow-box {
  padding: 8px 12px;
  border-radius: 6px;
  background-color: var(--card-bg);
  font-size: 12px;
  color: var(--text-color);
}

.s1 {
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.s2 {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.s3 {
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

/* E. content-visibility */
.cv-card {
  background-color: var(--card-bg);
}

.cv-container {
  max-height: 200px;
  overflow-y: auto;
  margin-top: 8px;
}

.cv-item {
  padding: 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  color: var(--text-color);
}

.cv-enabled .cv-item {
  content-visibility: auto;
  contain-intrinsic-size: auto 40px;
}

/* F. iframe 测试 */
.iframe-card {
  background-color: var(--card-bg);
}

.iframe-desc {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.iframe-test-row {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.iframe-wrapper {
  flex: 1;
  min-width: 0;
}

.iframe-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-bottom: 4px;
  font-weight: 600;
}

.test-iframe {
  width: 100%;
  height: 120px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--input-bg);
  display: block;
}
.iframe-placeholder {
  width: 100%;
  height: 120px;
  border: 2px dashed var(--border-color);
  border-radius: 8px;
  background: repeating-linear-gradient(
    45deg,
    transparent,
    transparent 8px,
    rgba(var(--el-color-primary-rgb), 0.04) 8px,
    rgba(var(--el-color-primary-rgb), 0.04) 16px
  );
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  font-family: sans-serif;
  gap: 4px;
  position: relative;
}

.placeholder-cross {
  width: 32px;
  height: 32px;
  position: relative;
  margin-bottom: 4px;
}

.placeholder-cross::before,
.placeholder-cross::after {
  content: "";
  position: absolute;
  top: 50%;
  left: 50%;
  width: 24px;
  height: 2px;
  background-color: var(--text-color-secondary);
  opacity: 0.5;
}

.placeholder-cross::before {
  transform: translate(-50%, -50%) rotate(45deg);
}

.placeholder-cross::after {
  transform: translate(-50%, -50%) rotate(-45deg);
}

.placeholder-text {
  font-size: 13px;
  font-weight: 600;
}

.placeholder-hint {
  font-size: 11px;
  opacity: 0.6;
}

.iframe-test-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

/* H. onCloneNode 测试 */
.clone-node-card {
  background-color: var(--card-bg);
}

.clone-node-desc {
  margin: 0 0 8px 0;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.5;
}

.clone-node-desc code {
  background-color: var(--input-bg);
  padding: 1px 4px;
  border-radius: 3px;
  font-size: 11px;
}

.clone-node-test-row {
  margin-bottom: 4px;
}

.clone-node-target {
  border: 2px dashed var(--el-color-warning);
  border-radius: 8px;
  padding: 12px;
  padding-bottom: 16px;
  background-color: var(--container-bg);
}

.clone-node-label {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-bottom: 8px;
  font-weight: 600;
}

.small-iframe {
  height: 120px;
}

/* G. 模拟聊天气泡 */
.chat-card {
  background-color: var(--container-bg);
}

.chat-simulation {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.msg-user {
  flex-direction: row-reverse;
}

.chat-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  flex-shrink: 0;
}

.user-avatar {
  background: var(--el-color-primary);
  color: white;
}

.assistant-avatar {
  background: var(--el-color-success);
  color: white;
}

.chat-bubble {
  padding: 8px 12px;
  border-radius: 12px;
  font-size: 13px;
  max-width: 70%;
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--text-color);
}

.msg-user .chat-bubble {
  background-color: var(--el-color-primary);
  color: white;
  border: none;
}

.code-bubble {
  font-family: monospace;
  font-size: 12px;
  background-color: var(--input-bg);
  border: var(--border-width) solid var(--border-color);
  color: var(--text-color);
}

.code-bubble pre {
  margin: 0;
}

.code-bubble code {
  font-size: 12px;
}

/* 消息分组截图区域 */
.scroll-target {
  border: 2px solid var(--el-color-primary);
  border-radius: 8px;
  overflow-y: auto;
  position: relative;
  max-height: 400px;
}

.scroll-content {
  padding: 8px;
}

.scroll-item {
  display: flex;
  gap: 8px;
  padding: 8px;
  border-radius: 8px;
  margin-bottom: 4px;
  align-items: flex-start;
}

.scroll-item.odd {
  background-color: var(--card-bg);
}

.scroll-item.even {
  background-color: var(--input-bg);
}

.scroll-item-avatar {
  font-size: 20px;
  flex-shrink: 0;
}

.scroll-item-content {
  flex: 1;
  min-width: 0;
}

.scroll-item-role {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  margin-bottom: 2px;
}

.scroll-item-text {
  font-size: 13px;
  color: var(--text-color);
}

/* 结果区域 */
.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-header h4 {
  margin: 0;
  font-size: 14px;
  color: var(--text-color);
}

.result-area {
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: auto;
  max-height: 400px;
  background-color: var(--input-bg);
}

.result-img {
  width: 100%;
  display: block;
  cursor: pointer;
  transition: opacity 0.15s;
}

.result-img:hover {
  opacity: 0.85;
}

.result-placeholder {
  padding: 40px;
  text-align: center;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.result-info {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--card-bg);
  border-radius: 6px;
  font-size: 12px;
  color: var(--text-color);
}

.result-info p {
  margin: 2px 0;
}

.test-log {
  margin-top: 12px;
  max-height: 200px;
  overflow-y: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
  background-color: var(--card-bg);
}

.test-log h5 {
  margin: 0 0 6px 0;
  font-size: 12px;
  color: var(--text-color-secondary);
}

.log-entry {
  font-size: 11px;
  font-family: monospace;
  padding: 2px 0;
  border-bottom: 1px solid var(--border-color);
}

.log-entry.info {
  color: var(--text-color-secondary);
}

.log-entry.success {
  color: var(--el-color-success);
}

.log-entry.warn {
  color: var(--el-color-warning);
}

.log-entry.error {
  color: var(--el-color-danger);
}
</style>
