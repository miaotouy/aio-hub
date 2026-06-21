<script setup lang="ts">
/**
 * 运行控制面板
 *
 * 启动 / 暂停 / 停止按钮 + 运行日志展示 + 耗时统计。
 */
import { computed, ref, nextTick, watch } from "vue";
import { Play, Pause, Square, Trash2, Terminal } from "lucide-vue-next";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import { useFlowExecutor } from "../composables/useFlowExecutor";
import type { ActionFlow, WindowInfo } from "../types";

const props = defineProps<{
  flow: ActionFlow | null;
  boundWindow: WindowInfo | null;
}>();

const store = useWindowAutomatorStore();
const executor = useFlowExecutor();

const logContainerRef = ref<HTMLElement | null>(null);
const elapsed = ref(0);
let elapsedTimer: number | null = null;

const isPaused = computed(() => store.runtime.status === "paused");
const isIdle = computed(() => store.runtime.status === "idle");
const statusText = computed(() => {
  switch (store.runtime.status) {
    case "idle":
      return "空闲";
    case "running":
      return "运行中";
    case "paused":
      return "已暂停";
    case "stopping":
      return "停止中";
  }
  return "未知";
});

const canStart = computed(
  () =>
    isIdle.value &&
    !!props.flow &&
    props.flow.steps.length > 0 &&
    !!props.boundWindow
);

function start() {
  if (!props.flow) return;
  void executor.start(props.flow, props.boundWindow);
}

function pauseOrResume() {
  if (isPaused.value) executor.resume();
  else executor.pause();
}

function stop() {
  executor.stop();
}

function clearLogs() {
  store.clearLogs();
}

watch(
  () => store.runtime.status,
  (status) => {
    if (status === "running" || status === "paused") {
      if (elapsedTimer === null) {
        const startTime = store.runtime.startTime ?? Date.now();
        const tick = () => {
          if (store.runtime.startTime) {
            elapsed.value = Date.now() - store.runtime.startTime;
          } else {
            elapsed.value = Date.now() - startTime;
          }
        };
        tick();
        elapsedTimer = window.setInterval(tick, 200);
      }
    } else {
      if (elapsedTimer !== null) {
        clearInterval(elapsedTimer);
        elapsedTimer = null;
      }
    }
  }
);

// 自动滚动到底部
watch(
  () => store.runtime.logs.length,
  async () => {
    await nextTick();
    const el = logContainerRef.value;
    if (el) el.scrollTop = el.scrollHeight;
  }
);

const elapsedText = computed(() => {
  const ms = elapsed.value;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}.${Math.floor((ms % 1000) / 100)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${s % 60}s`;
});
</script>

<template>
  <div class="control-panel">
    <div class="panel-header">
      <div class="left">
        <Terminal :size="16" />
        <span class="title">运行控制</span>
        <span class="status" :class="store.runtime.status">{{
          statusText
        }}</span>
      </div>
      <div class="right">
        <span class="metric"
          >已执行:
          <strong>{{ store.runtime.totalStepsExecuted }}</strong> 步</span
        >
        <span class="metric"
          >耗时: <strong>{{ elapsedText }}</strong></span
        >
        <el-button-group>
          <el-button
            v-if="isIdle"
            type="primary"
            :icon="Play"
            :disabled="!canStart"
            @click="start"
          >
            启动
          </el-button>
          <el-button
            v-else-if="isPaused"
            type="primary"
            :icon="Play"
            @click="pauseOrResume"
          >
            恢复
          </el-button>
          <el-button v-else :icon="Pause" @click="pauseOrResume">
            暂停
          </el-button>
          <el-button :icon="Square" :disabled="isIdle" @click="stop">
            停止
          </el-button>
        </el-button-group>
        <el-tooltip content="清空日志" placement="top">
          <el-button :icon="Trash2" link @click="clearLogs" />
        </el-tooltip>
      </div>
    </div>

    <div ref="logContainerRef" class="log-area">
      <div v-if="store.runtime.logs.length === 0" class="log-empty">
        暂无日志
      </div>
      <div
        v-for="(log, i) in store.runtime.logs"
        :key="i"
        class="log-line"
        :class="log.level"
      >
        <span class="time">{{
          new Date(log.timestamp).toLocaleTimeString()
        }}</span>
        <span v-if="log.stepIndex !== null" class="step-no"
          >#{{ log.stepIndex + 1 }}</span
        >
        <span class="level">[{{ log.level.toUpperCase() }}]</span>
        <span class="message">{{ log.message }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.control-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}
.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: var(--header-bg);
  flex-wrap: wrap;
}
.left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.title {
  font-weight: 500;
  font-size: 14px;
}
.status {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 12px;
  font-weight: 500;
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
  color: var(--el-text-color-secondary);
}
.status.running {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-primary);
}
.status.paused {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-warning);
}
.status.stopping {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-danger);
}
.metric {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.metric strong {
  color: var(--el-text-color-primary);
}
.log-area {
  flex: 1;
  overflow-y: auto;
  padding: 8px 14px;
  font-family:
    ui-monospace, "SFMono-Regular", Consolas, "Cascadia Code", monospace;
  font-size: 12px;
  line-height: 1.6;
  background-color: var(--vscode-editor-background, var(--bg-color));
  min-height: 200px;
}
.log-empty {
  color: var(--el-text-color-placeholder);
  text-align: center;
  padding: 24px;
}
.log-line {
  display: flex;
  gap: 8px;
  align-items: baseline;
  flex-wrap: wrap;
  padding: 1px 0;
}
.log-line .time {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}
.log-line .step-no {
  color: var(--el-color-primary);
  font-weight: 500;
}
.log-line .level {
  font-size: 10px;
  padding: 0 4px;
  border-radius: 2px;
}
.log-line .message {
  flex: 1;
  min-width: 0;
  word-break: break-all;
}
.log-line.info .level {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-primary);
}
.log-line.warn .level {
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-warning);
}
.log-line.error .level {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
  color: var(--el-color-danger);
}
.log-line.debug .level {
  background-color: rgba(
    var(--el-text-color-primary-rgb, 128, 128, 128),
    calc(var(--card-opacity, 1) * 0.08)
  );
  color: var(--el-text-color-secondary);
}
.log-line.error .message {
  color: var(--el-color-danger);
}
.log-line.warn .message {
  color: var(--el-color-warning);
}
</style>
