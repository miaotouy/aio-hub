<template>
  <div class="json-viewer">
    <div class="json-header">
      <el-button-group>
        <el-button size="small" @click="copyJson"> 复制 </el-button>
        <el-button size="small" @click="formatJson"> 格式化 </el-button>
      </el-button-group>
      <span v-if="message" class="json-type" :class="message.type.toLowerCase()">
        {{ message.type }}
      </span>
    </div>

    <el-scrollbar class="json-content">
      <pre class="json-code">{{ formattedJson }}</pre>
    </el-scrollbar>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { ElMessage } from "element-plus";
import type { VcpMessage } from "../../types/protocol";

const props = defineProps<{
  message: VcpMessage | null;
}>();

const isFormatted = ref(true);

const formattedJson = computed(() => {
  if (!props.message) return "";
  return JSON.stringify(props.message.raw || props.message, null, 2);
});

function copyJson() {
  if (!props.message) return;

  try {
    const text = JSON.stringify(props.message.raw || props.message, null, 2);
    navigator.clipboard.writeText(text);
    ElMessage.success("已复制到剪贴板");
  } catch (e) {
    ElMessage.error("复制失败");
  }
}

function formatJson() {
  isFormatted.value = !isFormatted.value;
}
</script>

<style scoped lang="css">
.json-viewer {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--el-bg-color-page);
  border-radius: 6px;
  overflow: hidden;
}

.json-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color);
  background: var(--el-bg-color);
}

.json-type {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 3px;
  text-transform: uppercase;
}

.json-type.rag_retrieval_details {
  background: rgba(52, 152, 219, 0.15);
  color: #3498db;
}

.json-type.meta_thinking_chain {
  background: rgba(155, 89, 182, 0.15);
  color: #9b59b6;
}

.json-type.agent_private_chat_preview {
  background: rgba(241, 196, 15, 0.15);
  color: #f1c40f;
}

.json-type.ai_memo_retrieval {
  background: rgba(26, 188, 156, 0.15);
  color: #1abc9c;
}

.json-type.plugin_step_status {
  background: rgba(52, 73, 94, 0.15);
  color: #34495e;
}

.json-content {
  flex: 1;
  overflow: hidden;
}

.json-code {
  margin: 0;
  padding: 12px;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 12px;
  line-height: 1.5;
  color: var(--el-text-color-primary);
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
