<script setup lang="ts">
import { ref } from "vue";
import { Play, Search } from "lucide-vue-next";
import { customMessage } from "@/utils/customMessage";
import { parseToolRequests } from "../core/parser";

const props = defineProps<{
  protocol: any;
}>();

const testText = ref(`这里模拟 LLM 的回复文本。
你可以尝试包含一个 VCP 请求块：

<<<[TOOL_REQUEST]>>>
tool_name: 「始」directory_tree_list_files「末」
path: 「始」src「末」
recursive: 「始」false「末」
<<<[END_TOOL_REQUEST]>>>

解析器会忽略这些非结构化文字。`);
const parsedRequests = ref<any[]>([]);

const runParserTest = () => {
  parsedRequests.value = parseToolRequests(testText.value, props.protocol);
  if (parsedRequests.value.length > 0) {
    customMessage.success(`成功解析出 ${parsedRequests.value.length} 个请求`);
  } else {
    customMessage.warning("未发现有效请求块");
  }
};
</script>

<template>
  <div class="pane parser-pane">
    <div class="parser-layout">
      <div class="parser-input">
        <div class="label-row">输入 LLM 混合文本</div>
        <div class="editor-wrapper">
          <el-input
            v-model="testText"
            type="textarea"
            :rows="15"
            placeholder="在此贴入包含 <<<[TOOL_REQUEST]>>> 的文本..."
          />
        </div>
        <el-button type="primary" :icon="Play" @click="runParserTest" class="mt-4">
          运行解析引擎
        </el-button>
      </div>

      <div class="parser-output">
        <div class="label-row">解析结果 ({{ parsedRequests.length }})</div>
        <div class="parsed-list scrollbar-styled">
          <div v-if="!parsedRequests.length" class="empty-results">
            <Search :size="40" />
            <p>无解析出的请求</p>
          </div>
          
          <div v-for="(req, idx) in parsedRequests" :key="idx" class="req-item">
            <div class="req-head">
              <span class="req-num">#{{ idx + 1 }}</span>
              <span class="req-name">{{ req.toolName }}</span>
            </div>
            <div class="req-args">
              <pre>{{ JSON.stringify(req.args, null, 2) }}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.pane {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.parser-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  padding: 20px;
  overflow: hidden;
}

.parser-input, .parser-output {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.label-row {
  font-weight: 600;
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.editor-wrapper {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background-color: var(--vscode-editor-background);
  display: flex;
  flex-direction: column;
}

:deep(.el-textarea__inner) {
  height: 100% !important;
  border: none;
  background-color: transparent;
  color: var(--text-color);
  font-family: var(--el-font-family-mono);
  font-size: 13px;
}

.parsed-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.req-item {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  overflow: hidden;
}

.req-head {
  padding: 8px 12px;
  background-color: rgba(var(--el-color-primary-rgb), 0.08);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  gap: 8px;
}

.req-num {
  font-weight: 700;
  color: var(--el-color-primary);
}

.req-name {
  font-family: var(--el-font-family-mono);
  font-weight: 600;
  font-size: 13px;
}

.req-args pre {
  margin: 0;
  padding: 10px;
  font-size: 12px;
  background-color: rgba(var(--text-color-rgb), 0.02);
  white-space: pre-wrap;
  word-break: break-all;
}

.empty-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  opacity: 0.4;
  gap: 8px;
}

.mt-4 { margin-top: 16px; }

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>