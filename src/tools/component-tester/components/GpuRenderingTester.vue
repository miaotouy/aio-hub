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
  <section class="gpu-rendering-tester" data-testid="gpu-rendering-tester">
    <header class="tester-header">
      <div>
        <h2>GPU 渲染探针</h2>
        <p>
          使用持续 WebGL 绘制产生可归因的 3D
          工作负载，用于确认性能采集器是否能从 WebView2 GPU
          子进程读取到占用数据。
        </p>
      </div>
      <el-tag :type="statusTagType" effect="plain">{{ statusLabel }}</el-tag>
    </header>

    <el-alert type="info" :closable="false" show-icon>
      <template #title>
        开始后保持此标签页可见至少 12 秒，再查看性能 runner 的
        <code>gpu3dAvgPercent</code> /
        <code>gpu3dPeakPercent</code>。这里展示的帧率只证明渲染循环运行，
        不等同于 Windows 的 GPU 占用计数。
      </template>
    </el-alert>

    <div class="control-panel">
      <el-form label-position="top" class="control-form">
        <el-form-item label="负载档位">
          <el-radio-group v-model="selectedProfile" :disabled="isRunning">
            <el-radio-button
              v-for="profile in profiles"
              :key="profile.id"
              :value="profile.id"
            >
              {{ profile.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="持续时间">
          <el-input-number
            v-model="durationSeconds"
            :min="12"
            :max="300"
            :step="6"
            :disabled="isRunning"
          >
            <template #suffix>秒</template>
          </el-input-number>
        </el-form-item>

        <el-form-item label="操作">
          <div class="action-buttons">
            <el-button
              type="primary"
              data-testid="gpu-rendering-start"
              :disabled="isRunning"
              @click="start"
            >
              开始 WebGL 绘制
            </el-button>
            <el-button
              data-testid="gpu-rendering-stop"
              :disabled="!isRunning"
              @click="stop"
            >
              停止
            </el-button>
          </div>
        </el-form-item>
      </el-form>

      <dl class="run-metrics" aria-live="polite">
        <div>
          <dt>绘制帧数</dt>
          <dd data-testid="gpu-rendering-frame-count">
            {{ renderedFrames.toLocaleString() }}
          </dd>
        </div>
        <div>
          <dt>帧率</dt>
          <dd data-testid="gpu-rendering-fps">{{ framesPerSecond }} FPS</dd>
        </div>
        <div>
          <dt>已运行</dt>
          <dd data-testid="gpu-rendering-elapsed">
            {{ elapsedSeconds.toFixed(1) }} / {{ durationSeconds }} 秒
          </dd>
        </div>
        <div>
          <dt>绘制分辨率</dt>
          <dd data-testid="gpu-rendering-resolution">{{ canvasResolution }}</dd>
        </div>
      </dl>
    </div>

    <div class="canvas-shell" :class="{ 'is-running': isRunning }">
      <canvas
        ref="canvasRef"
        class="gpu-canvas"
        aria-label="WebGL GPU 工作负载预览"
        data-testid="gpu-rendering-canvas"
        @webglcontextlost="handleContextLost"
      />
      <div v-if="!isRunning" class="canvas-placeholder">
        <span>{{ statusMessage }}</span>
        <small
          >不会使用 WebGPU，避免因 WebView2 的实验性支持差异干扰 GPU
          计数验证。</small
        >
      </div>
    </div>

    <div class="diagnostic-grid">
      <div class="diagnostic-card">
        <span class="label">图形 API</span>
        <strong>{{ graphicsApi }}</strong>
      </div>
      <div class="diagnostic-card">
        <span class="label">GPU 渲染器</span>
        <strong>{{ rendererName }}</strong>
      </div>
      <div class="diagnostic-card diagnostic-card--wide">
        <span class="label">验证步骤</span>
        <ol>
          <li>在真实 Tauri 窗口打开“组件测试器 → GPU 渲染探针”。</li>
          <li>
            选择“高负载”，运行至少 12 秒，期间不要切换标签页或最小化窗口。
          </li>
          <li>
            并行运行资源采集器，确认 GPU 子进程存在且 3D 引擎指标出现非零样本。
          </li>
        </ol>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("GpuRenderingTester");
const errorHandler = createModuleErrorHandler("GpuRenderingTester");

interface WorkloadProfile {
  id: "balanced" | "high";
  label: string;
  /** 片段着色器中的最大有效迭代次数。 */
  shaderIterations: number;
  /** 限制画布最长边，避免不同显示器导致不可控的负载。 */
  maxCanvasWidth: number;
  maxDevicePixelRatio: number;
}

const profiles: WorkloadProfile[] = [
  {
    id: "balanced",
    label: "均衡",
    shaderIterations: 48,
    maxCanvasWidth: 960,
    maxDevicePixelRatio: 1.25,
  },
  {
    id: "high",
    label: "高负载",
    shaderIterations: 96,
    maxCanvasWidth: 1280,
    maxDevicePixelRatio: 1.5,
  },
];

const canvasRef = ref<HTMLCanvasElement | null>(null);
const selectedProfile = ref<WorkloadProfile["id"]>("high");
const durationSeconds = ref(30);
const isRunning = ref(false);
const renderedFrames = ref(0);
const framesPerSecond = ref(0);
const elapsedSeconds = ref(0);
const canvasResolution = ref("未初始化");
const graphicsApi = ref("等待开始");
const rendererName = ref("等待开始");
const statusMessage = ref("尚未开始 GPU 绘制。");
const lastError = ref<string | null>(null);

let gl: WebGLRenderingContext | WebGL2RenderingContext | null = null;
let program: WebGLProgram | null = null;
let vertexBuffer: WebGLBuffer | null = null;
let animationFrameId: number | null = null;
let startedAt = 0;
let fpsWindowStartedAt = 0;
let framesAtLastFpsSample = 0;

const selectedWorkload = computed(
  () =>
    profiles.find((profile) => profile.id === selectedProfile.value) ??
    profiles[1]
);

const statusLabel = computed(() => {
  if (isRunning.value) return "正在产生 GPU 工作负载";
  if (lastError.value) return "初始化失败";
  if (renderedFrames.value > 0) return "已完成";
  return "等待开始";
});

const statusTagType = computed(() => {
  if (isRunning.value) return "success";
  if (lastError.value) return "danger";
  return "info";
});

const vertexShaderSource = `
  attribute vec2 a_position;
  void main() {
    gl_Position = vec4(a_position, 0.0, 1.0);
  }
`;

/**
 * 该着色器只绘制一个全屏三角形，但会在片段阶段执行固定上限的三角函数循环。
 * 绘制负载留在 GPU，而非用 JavaScript 大循环伪造 CPU 压力。
 */
const fragmentShaderSource = `
  precision highp float;
  uniform vec2 u_resolution;
  uniform float u_time;
  uniform float u_iterations;

  void main() {
    vec2 centered = (gl_FragCoord.xy * 2.0 - u_resolution) / min(u_resolution.x, u_resolution.y);
    float energy = 0.0;

    for (int i = 0; i < 96; i++) {
      float stepIndex = float(i);
      if (stepIndex >= u_iterations) break;
      float phase = u_time * (0.37 + stepIndex * 0.0017);
      vec2 wave = vec2(
        sin(centered.y * (1.4 + stepIndex * 0.019) + phase),
        cos(centered.x * (1.7 + stepIndex * 0.015) - phase * 1.13)
      );
      energy += sin(dot(centered + wave * 0.22, vec2(8.3, 6.1)) + phase);
    }

    float normalized = 0.5 + 0.5 * sin(energy / u_iterations * 2.9);
    vec3 color = vec3(
      0.08 + normalized * 0.24,
      0.10 + normalized * 0.54,
      0.20 + normalized * 0.72
    );
    gl_FragColor = vec4(color, 1.0);
  }
`;

function compileShader(
  context: WebGLRenderingContext | WebGL2RenderingContext,
  type: number,
  source: string
): WebGLShader {
  const shader = context.createShader(type);
  if (!shader) throw new Error("无法创建 WebGL shader。");

  context.shaderSource(shader, source);
  context.compileShader(shader);
  if (context.getShaderParameter(shader, context.COMPILE_STATUS)) return shader;

  const message = context.getShaderInfoLog(shader) || "未知 shader 编译错误";
  context.deleteShader(shader);
  throw new Error(message);
}

function createProgram(
  context: WebGLRenderingContext | WebGL2RenderingContext
): WebGLProgram {
  const nextProgram = context.createProgram();
  if (!nextProgram) throw new Error("无法创建 WebGL program。");

  const vertexShader = compileShader(
    context,
    context.VERTEX_SHADER,
    vertexShaderSource
  );
  const fragmentShader = compileShader(
    context,
    context.FRAGMENT_SHADER,
    fragmentShaderSource
  );
  context.attachShader(nextProgram, vertexShader);
  context.attachShader(nextProgram, fragmentShader);
  context.linkProgram(nextProgram);
  context.deleteShader(vertexShader);
  context.deleteShader(fragmentShader);

  if (context.getProgramParameter(nextProgram, context.LINK_STATUS))
    return nextProgram;

  const message =
    context.getProgramInfoLog(nextProgram) || "未知 program 链接错误";
  context.deleteProgram(nextProgram);
  throw new Error(message);
}

function initializeRenderer(): void {
  const canvas = canvasRef.value;
  if (!canvas) throw new Error("GPU 预览画布尚未挂载。");

  const profile = selectedWorkload.value;
  const contextOptions: WebGLContextAttributes = {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "high-performance",
  };
  const nextContext =
    canvas.getContext("webgl2", contextOptions) ||
    canvas.getContext("webgl", contextOptions);

  if (!nextContext) {
    throw new Error(
      "当前 WebView2 未提供 WebGL；无法产生可验证的 GPU 绘制负载。"
    );
  }

  gl = nextContext;
  const cssWidth = Math.max(
    480,
    Math.min(
      canvas.clientWidth || profile.maxCanvasWidth,
      profile.maxCanvasWidth
    )
  );
  const cssHeight = Math.round((cssWidth * 9) / 16);
  const devicePixelRatio = Math.min(
    window.devicePixelRatio || 1,
    profile.maxDevicePixelRatio
  );
  canvas.width = Math.round(cssWidth * devicePixelRatio);
  canvas.height = Math.round(cssHeight * devicePixelRatio);
  canvasResolution.value = `${canvas.width} × ${canvas.height}`;

  program = createProgram(gl);
  vertexBuffer = gl.createBuffer();
  if (!vertexBuffer) throw new Error("无法创建 WebGL 顶点缓冲区。");

  gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW
  );

  const positionLocation = gl.getAttribLocation(program, "a_position");
  if (positionLocation < 0)
    throw new Error("未找到 WebGL 顶点属性 a_position。");
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  graphicsApi.value =
    typeof WebGL2RenderingContext !== "undefined" &&
    gl instanceof WebGL2RenderingContext
      ? "WebGL 2"
      : "WebGL 1";
  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  rendererName.value = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || "已隐藏"
    : "浏览器未公开渲染器名称";
  logger.info("已初始化 WebGL GPU 渲染探针", {
    graphicsApi: graphicsApi.value,
    renderer: rendererName.value,
    resolution: canvasResolution.value,
    profile: profile.id,
  });
}

function render(now: number): void {
  if (!isRunning.value || !gl || !program) return;

  const context = gl;
  const elapsedMs = now - startedAt;
  if (elapsedMs >= durationSeconds.value * 1000) {
    elapsedSeconds.value = durationSeconds.value;
    stop("已完成设定时长的 WebGL 绘制。");
    return;
  }

  context.viewport(
    0,
    0,
    context.drawingBufferWidth,
    context.drawingBufferHeight
  );
  context.useProgram(program);
  context.uniform2f(
    context.getUniformLocation(program, "u_resolution"),
    context.drawingBufferWidth,
    context.drawingBufferHeight
  );
  context.uniform1f(
    context.getUniformLocation(program, "u_time"),
    elapsedMs / 1000
  );
  context.uniform1f(
    context.getUniformLocation(program, "u_iterations"),
    selectedWorkload.value.shaderIterations
  );
  context.drawArrays(context.TRIANGLES, 0, 3);

  renderedFrames.value += 1;
  elapsedSeconds.value = elapsedMs / 1000;
  const fpsElapsedMs = now - fpsWindowStartedAt;
  if (fpsElapsedMs >= 500) {
    framesPerSecond.value = Math.round(
      ((renderedFrames.value - framesAtLastFpsSample) * 1000) / fpsElapsedMs
    );
    framesAtLastFpsSample = renderedFrames.value;
    fpsWindowStartedAt = now;
  }
  animationFrameId = requestAnimationFrame(render);
}

async function start(): Promise<void> {
  try {
    lastError.value = null;
    statusMessage.value = "正在初始化 WebGL 上下文…";
    await nextTick();
    initializeRenderer();

    renderedFrames.value = 0;
    framesPerSecond.value = 0;
    elapsedSeconds.value = 0;
    isRunning.value = true;
    startedAt = performance.now();
    fpsWindowStartedAt = startedAt;
    framesAtLastFpsSample = 0;
    statusMessage.value = "WebGL 绘制进行中。";
    animationFrameId = requestAnimationFrame(render);
  } catch (error) {
    stop();
    lastError.value = error instanceof Error ? error.message : String(error);
    statusMessage.value = lastError.value;
    errorHandler.error(error, "GPU 渲染探针初始化失败");
  }
}

function disposeRenderer(): void {
  if (!gl) return;
  if (vertexBuffer) gl.deleteBuffer(vertexBuffer);
  if (program) gl.deleteProgram(program);
  vertexBuffer = null;
  program = null;
  gl = null;
}

function stop(message = "GPU 绘制已停止。"): void {
  if (animationFrameId !== null) cancelAnimationFrame(animationFrameId);
  animationFrameId = null;
  isRunning.value = false;
  statusMessage.value = message;
  disposeRenderer();
}

function handleContextLost(event: Event): void {
  event.preventDefault();
  stop();
  lastError.value = "WebGL 上下文已丢失。请重新开始测试。";
  statusMessage.value = lastError.value;
  logger.warn("GPU 渲染探针的 WebGL 上下文已丢失");
}

onBeforeUnmount(() => stop());
</script>

<style scoped>
.gpu-rendering-tester {
  display: grid;
  gap: 16px;
  padding: 20px;
  color: var(--text-color);
}

.tester-header,
.control-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
}

.tester-header h2 {
  margin: 0;
  font-size: 20px;
}

.tester-header p {
  max-width: 760px;
  margin: 8px 0 0;
  color: var(--text-color-secondary);
  line-height: 1.6;
}

.control-panel,
.diagnostic-card {
  padding: 16px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius-base);
}

.control-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0 20px;
}

.control-form :deep(.el-form-item) {
  margin-bottom: 0;
}

.action-buttons {
  display: flex;
  gap: 8px;
}

.run-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(130px, 1fr));
  gap: 12px 24px;
  min-width: 320px;
  margin: 0;
}

.run-metrics div {
  display: grid;
  gap: 3px;
}

.run-metrics dt,
.label {
  color: var(--text-color-secondary);
  font-size: 12px;
}

.run-metrics dd {
  margin: 0;
  font-family: var(--font-family-mono, monospace);
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

.canvas-shell {
  position: relative;
  overflow: hidden;
  min-height: 360px;
  background: var(--bg-color-soft);
  border: var(--border-width) solid var(--border-color);
  border-radius: var(--border-radius-base);
}

.canvas-shell.is-running {
  border-color: var(--primary-color);
}

.gpu-canvas {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  max-height: 560px;
  background: var(--fill-color);
}

.canvas-placeholder {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--text-color-secondary);
}

.canvas-placeholder small {
  max-width: 520px;
  line-height: 1.5;
}

.diagnostic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.diagnostic-card {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.diagnostic-card strong {
  overflow-wrap: anywhere;
}

.diagnostic-card--wide {
  grid-column: 1 / -1;
}

.diagnostic-card ol {
  margin: 0;
  padding-left: 20px;
  color: var(--text-color-secondary);
  line-height: 1.8;
}

@media (max-width: 840px) {
  .tester-header,
  .control-panel {
    flex-direction: column;
  }

  .run-metrics {
    width: 100%;
    min-width: 0;
  }
}

@media (max-width: 560px) {
  .gpu-rendering-tester {
    padding: 12px;
  }

  .diagnostic-grid,
  .run-metrics {
    grid-template-columns: 1fr;
  }

  .canvas-shell {
    min-height: 260px;
  }
}
</style>
