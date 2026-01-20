<template>
  <div class="ffmpeg-console">
    <div class="console-header">
      <div class="header-left">
        <el-icon><Terminal /></el-icon>
        <span>实时控制台</span>
      </div>
      <div class="header-right">
        <el-button link @click="clearLogs">
          <template #icon
            ><el-icon><Trash /></el-icon
          ></template>
          清空
        </el-button>
        <el-button link :icon="autoScroll ? 'Check' : 'Close'" @click="autoScroll = !autoScroll">
          自动滚动
        </el-button>
      </div>
    </div>
    <div class="console-body" ref="bodyRef">
      <div v-if="!logs.length" class="empty-state">等待任务执行日志...</div>
      <div v-for="(log, idx) in logs" :key="idx" class="log-line" :class="getLogClass(log)">
        <span class="line-num">{{ idx + 1 }}</span>
        <span class="line-content">{{ log }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, nextTick } from "vue";
import { Terminal, Trash } from "lucide-vue-next";

const props = defineProps<{
  logs: string[];
}>();

const emit = defineEmits(["clear"]);

const bodyRef = ref<HTMLElement | null>(null);
const autoScroll = ref(true);

const clearLogs = () => {
  emit("clear");
};

const getLogClass = (log: string) => {
  const lower = log.toLowerCase();
  if (lower.includes("error") || lower.includes("failed")) return "log-error";
  if (lower.includes("warning")) return "log-warn";
  if (lower.includes("duration:") || lower.includes("video:") || lower.includes("audio:"))
    return "log-info";
  return "";
};

const scrollToBottom = () => {
  if (!bodyRef.value || !autoScroll.value) return;
  bodyRef.value.scrollTop = bodyRef.value.scrollHeight;
};

watch(
  () => props.logs.length,
  () => {
    nextTick(scrollToBottom);
  }
);

onMounted(scrollToBottom);
</script>

<style scoped>
.ffmpeg-console {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #1e1e1e;
  border-radius: 8px;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.console-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  background: #2d2d2d;
  border-bottom: 1px solid #3d3d3d;
  color: #ccc;
  font-size: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.console-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  color: #d4d4d4;
  font-size: 13px;
  line-height: 1.5;
}

.log-line {
  display: flex;
  gap: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  border-bottom: 1px solid #252525;
  padding: 2px 0;
}

.line-num {
  color: #5a5a5a;
  min-width: 30px;
  text-align: right;
  user-select: none;
}

.line-content {
  flex: 1;
}

.log-error {
  color: #f44336;
}
.log-warn {
  color: #ff9800;
}
.log-info {
  color: #2196f3;
  font-weight: bold;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #555;
  font-style: italic;
}

/* 滚动条 */
.console-body::-webkit-scrollbar {
  width: 8px;
}
.console-body::-webkit-scrollbar-thumb {
  background: #3e3e3e;
  border-radius: 4px;
}
.console-body::-webkit-scrollbar-thumb:hover {
  background: #4e4e4e;
}
</style>
