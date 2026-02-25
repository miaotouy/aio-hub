<script setup lang="ts">
import { ref } from "vue";
import { Play, Search, Trash2, ScanText } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { parseToolRequests } from "../core/parser";

const props = defineProps<{
  protocol: any;
  groups: any[];
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
    customMessage.warning("未发现有效请求块，请检查 tool_name 等关键字段格式");
  }
};

const clearResults = () => {
  parsedRequests.value = [];
};

/**
 * 校验工具是否存在
 */
const validateTool = (toolName: string) => {
  if (!props.groups || props.groups.length === 0) return { exists: true };

  for (const group of props.groups) {
    if (group.toolId === toolName) return { exists: true, isToolOnly: true };
    for (const method of group.methods) {
      if (`${group.toolId}_${method.name}` === toolName) {
        return { exists: true, group, method };
      }
    }
  }
  return { exists: false };
};
</script>

<template>
  <div class="pane parser-pane">
    <!-- 顶部工具栏 -->
    <div class="pane-header">
      <div class="header-left">
        <ScanText :size="16" class="header-icon" />
        <span class="header-title">解析器验证</span>
        <span class="header-desc">将包含 VCP 请求块的混合文本输入左侧，点击运行查看解析结果</span>
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Play" @click="runParserTest"> 运行解析引擎 </el-button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="parser-layout">
      <!-- 左侧输入面板 -->
      <div class="config-panel">
        <div class="section-header">
          <div class="section-label">
            输入 LLM 混合文本
            <span class="protocol-badge">{{ props.protocol?.id ?? "VCP" }}</span>
          </div>
        </div>
        <div class="config-content">
          <div class="editor-wrapper">
            <RichCodeEditor v-model="testText" language="plaintext" height="100%" />
          </div>
        </div>
      </div>

      <!-- 右侧结果面板 -->
      <div class="result-panel">
        <div class="section-header">
          <span class="result-label">
            解析结果
            <el-tag v-if="parsedRequests.length" size="small" type="primary" round>
              {{ parsedRequests.length }}
            </el-tag>
          </span>
          <el-button v-if="parsedRequests.length" link type="danger" size="small" :icon="Trash2" @click="clearResults">
            清空
          </el-button>
        </div>

        <div class="results-list scrollbar-styled">
          <div v-if="!parsedRequests.length" class="empty-results">
            <Search :size="48" />
            <p>等待解析结果...</p>
            <span class="empty-hint">在左侧输入包含 <code>TOOL_REQUEST</code> 块的文本，然后点击运行</span>
          </div>

          <div
            v-for="(req, idx) in parsedRequests"
            :key="idx"
            class="req-card"
            :class="{ 'is-invalid': !validateTool(req.toolName).exists }"
          >
            <div class="req-head">
              <div class="req-head-left">
                <span class="req-num">#{{ idx + 1 }}</span>
                <code class="req-name">{{ req.toolName }}</code>
              </div>
              <div class="req-status">
                <template v-if="validateTool(req.toolName).exists">
                  <el-tag size="small" effect="plain" type="success">已就绪</el-tag>
                </template>
                <template v-else>
                  <el-tooltip content="该工具或方法未在系统中注册，无法执行" placement="top">
                    <el-tag size="small" effect="light" type="danger">工具不存在</el-tag>
                  </el-tooltip>
                </template>
              </div>
            </div>
            <div class="req-body">
              <div class="req-args-label">参数</div>
              <pre class="req-args">{{ JSON.stringify(req.args, null, 2) }}</pre>
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

/* 顶部工具栏 */
.pane-header {
  padding: 10px 20px;
  background-color: rgba(var(--text-color-rgb), 0.02);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  gap: 20px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.header-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.header-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.header-desc {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 主布局 */
.parser-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  overflow: hidden;
}

/* 左侧配置面板 */
.config-panel {
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background-color: var(--bg-color);
}

.config-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.protocol-badge {
  font-size: 11px;
  font-family: var(--el-font-family-mono);
  color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  padding: 2px 8px;
  border-radius: 10px;
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.2);
}

.editor-wrapper {
  flex: 1;
  overflow: hidden;
  background-color: var(--vscode-editor-background);
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* 右侧结果面板 */
.result-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  min-width: 0;
}

.section-header {
  height: 40px;
  padding: 0 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  background-color: rgba(var(--text-color-rgb), 0.02);
}

.section-label,
.result-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.results-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* 空状态 */
.empty-results {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  opacity: 0.4;
  gap: 10px;
  padding: 40px;
  text-align: center;
}

.empty-results p {
  font-size: 14px;
  margin: 0;
}

.empty-hint {
  font-size: 12px;
  line-height: 1.6;
}

.empty-hint code {
  font-family: var(--el-font-family-mono);
  background-color: rgba(var(--text-color-rgb), 0.08);
  padding: 1px 4px;
  border-radius: 3px;
}

/* 结果卡片 */
.req-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  overflow: hidden;
  transition: border-color 0.2s;
}

.req-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.req-card.is-invalid {
  border-color: rgba(var(--el-color-danger-rgb), 0.3);
}

.req-card.is-invalid:hover {
  border-color: var(--el-color-danger);
}

.req-head {
  padding: 8px 12px;
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.08));
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.is-invalid .req-head {
  background-color: rgba(var(--el-color-danger-rgb), calc(var(--card-opacity) * 0.05));
}

.req-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.req-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--el-color-primary);
  font-family: var(--el-font-family-mono);
}

.req-name {
  font-family: var(--el-font-family-mono);
  font-weight: 600;
  font-size: 13px;
  color: var(--text-color);
}

.req-body {
  padding: 10px 12px;
}

.req-args-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
}

.req-args {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-family: var(--el-font-family-mono);
  background-color: var(--vscode-editor-background);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-color);
  line-height: 1.6;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>
