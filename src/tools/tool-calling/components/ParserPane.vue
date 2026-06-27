<script setup lang="ts">
import { ref } from "vue";
import {
  Play,
  Search,
  Trash2,
  ScanText,
  Copy,
  ClipboardList,
  FileJson,
} from "lucide-vue-next";
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
tool_name:「始」directory-tree「末」,
command:「始」generateTree「末」,
path:「始」E:\\rc20\\allinweb\\all-in-one-tools\\src\\components「末」,
showFiles:「始」true「末」,
showHidden:「始」false「末」,
showSize:「始」true「末」,
showDirSize:「始」false「末」,
maxDepth:「始」5「末」,
filterMode:「始」none「末」,
customPattern:「始」「末」,
includeMetadata:「始」true「末」
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

/**
 * 模拟 executor 的类型转换逻辑，生成适配后的参数预览
 */
interface AdaptedParam {
  name: string;
  rawValue: string;
  expectedType: string;
  adaptedValue: any;
  required: boolean;
  status: "ok" | "missing" | "type_error" | "optional_ok";
  statusMessage: string;
}

interface AdaptedArgsResult {
  adapted: AdaptedParam[];
  adaptedJson: Record<string, any>;
  hasErrors: boolean;
}

const getAdaptedArgs = (req: any): AdaptedArgsResult => {
  const validation = validateTool(req.toolName);
  const method = validation?.method;
  const params = method?.parameters ?? [];
  const adapted: AdaptedParam[] = [];
  const adaptedJson: Record<string, any> = {};
  let hasErrors = false;

  // 遍历方法定义的参数
  for (const param of params) {
    const rawValue = req.args[param.name];
    const isRequired = param.required !== false;
    const expectedType = param.type || "string";

    if (rawValue === undefined || rawValue === null || rawValue === "") {
      if (isRequired) {
        adapted.push({
          name: param.name,
          rawValue: "",
          expectedType,
          adaptedValue: undefined,
          required: true,
          status: "missing",
          statusMessage: "缺失必填参数",
        });
        hasErrors = true;
      } else {
        adapted.push({
          name: param.name,
          rawValue: "",
          expectedType,
          adaptedValue: param.defaultValue,
          required: false,
          status: "optional_ok",
          statusMessage: "可选，未提供",
        });
      }
      continue;
    }

    // 模拟 executor 的类型转换逻辑
    let adaptedValue: any = rawValue;
    let status: AdaptedParam["status"] = "ok";
    let statusMessage = "转换成功";

    if (expectedType === "boolean") {
      adaptedValue =
        String(rawValue).toLowerCase() === "true" || rawValue === true;
    } else if (expectedType === "number") {
      const num = Number(rawValue);
      if (!isNaN(num)) {
        adaptedValue = num;
      } else {
        status = "type_error";
        statusMessage = `无法转换为 number: "${rawValue}"`;
        hasErrors = true;
      }
    } else if (expectedType === "object" || expectedType === "array") {
      try {
        adaptedValue = JSON.parse(rawValue);
      } catch {
        // 保持字符串，可能是复杂对象类型
        adaptedValue = rawValue;
      }
    }

    adaptedJson[param.name] = adaptedValue;
    adapted.push({
      name: param.name,
      rawValue,
      expectedType,
      adaptedValue,
      required: isRequired,
      status,
      statusMessage,
    });
  }

  // 检查是否有额外参数（不在方法定义中但被 LLM 传入了）
  const definedNames = new Set(params.map((p: any) => p.name));
  for (const [key, value] of Object.entries(req.args)) {
    if (!definedNames.has(key)) {
      adapted.push({
        name: key,
        rawValue: String(value),
        expectedType: "unknown",
        adaptedValue: value,
        required: false,
        status: "ok",
        statusMessage: "未在方法定义中声明",
      });
      adaptedJson[key] = value;
    }
  }

  return { adapted, adaptedJson, hasErrors };
};

/** 一键复制 */
const copyToClipboard = async (text: string, label: string) => {
  try {
    await navigator.clipboard.writeText(text);
    customMessage.success(`已复制 ${label}`);
  } catch {
    customMessage.error("复制失败，请手动选择文本复制");
  }
};
</script>

<template>
  <div class="pane parser-pane">
    <!-- 顶部工具栏 -->
    <div class="pane-header">
      <div class="header-left">
        <ScanText :size="16" class="header-icon" />
        <span class="header-title">解析器验证</span>
        <span class="header-desc"
          >将包含 VCP 请求块的混合文本输入左侧，点击运行查看解析结果</span
        >
      </div>
      <div class="header-actions">
        <el-button type="primary" :icon="Play" @click="runParserTest">
          运行解析引擎
        </el-button>
      </div>
    </div>

    <!-- 主内容区 -->
    <div class="parser-layout">
      <!-- 左侧输入面板 -->
      <div class="config-panel">
        <div class="section-header">
          <div class="section-label">
            输入 LLM 混合文本
            <span class="protocol-badge">{{
              props.protocol?.id ?? "VCP"
            }}</span>
          </div>
          <el-button
            v-if="testText"
            link
            size="small"
            :icon="Copy"
            @click="copyToClipboard(testText, '输入文本')"
          >
            复制输入
          </el-button>
        </div>
        <div class="config-content">
          <div class="editor-wrapper">
            <RichCodeEditor
              v-model="testText"
              language="plaintext"
              height="100%"
            />
          </div>
        </div>
      </div>

      <!-- 右侧结果面板 -->
      <div class="result-panel">
        <div class="section-header">
          <span class="result-label">
            解析结果
            <el-tag
              v-if="parsedRequests.length"
              size="small"
              type="primary"
              round
            >
              {{ parsedRequests.length }}
            </el-tag>
          </span>
          <el-button
            v-if="parsedRequests.length"
            link
            type="danger"
            size="small"
            :icon="Trash2"
            @click="clearResults"
          >
            清空
          </el-button>
        </div>

        <div class="results-list scrollbar-styled">
          <div v-if="!parsedRequests.length" class="empty-results">
            <Search :size="48" />
            <p>等待解析结果...</p>
            <span class="empty-hint"
              >在左侧输入包含
              <code>TOOL_REQUEST</code> 块的文本，然后点击运行</span
            >
          </div>

          <div
            v-for="(req, idx) in parsedRequests"
            :key="idx"
            class="req-card"
            :class="{
              'is-invalid':
                !req.validation?.isValid || !validateTool(req.toolName).exists,
              'has-format-error': !req.validation?.isValid,
            }"
          >
            <div class="req-head">
              <div class="req-head-left">
                <span class="req-num">#{{ idx + 1 }}</span>
                <code class="req-name">{{ req.toolName }}</code>
              </div>
              <div class="req-head-actions">
                <div class="req-status">
                  <template v-if="!req.validation?.isValid">
                    <el-tooltip placement="top">
                      <template #content>
                        <div class="error-tooltip-content">
                          <strong>格式解析错误:</strong>
                          <ul>
                            <li
                              v-for="(err, eIdx) in req.validation?.errors"
                              :key="eIdx"
                            >
                              {{ err }}
                            </li>
                          </ul>
                        </div>
                      </template>
                      <el-tag size="small" effect="dark" type="danger"
                        >格式错误</el-tag
                      >
                    </el-tooltip>
                  </template>
                  <template v-else-if="validateTool(req.toolName).exists">
                    <el-tag size="small" effect="plain" type="success"
                      >已就绪</el-tag
                    >
                  </template>
                  <template v-else>
                    <el-tooltip
                      content="该工具或方法未在系统中注册，无法执行"
                      placement="top"
                    >
                      <el-tag size="small" effect="light" type="danger"
                        >工具不存在</el-tag
                      >
                    </el-tooltip>
                  </template>
                </div>
                <el-button
                  link
                  size="small"
                  :icon="ClipboardList"
                  @click="copyToClipboard(req.rawBlock, '原始 VCP 块')"
                >
                  复制块
                </el-button>
              </div>
            </div>
            <div class="req-body">
              <div v-if="req.validation?.errors?.length" class="req-errors">
                <div
                  class="error-item"
                  v-for="(err, eIdx) in req.validation.errors"
                  :key="eIdx"
                >
                  <span class="error-bullet">•</span> {{ err }}
                </div>
              </div>

              <!-- 参数详情表格 -->
              <template v-if="validateTool(req.toolName).method">
                <div class="req-args-label">
                  参数详情
                  <el-button
                    link
                    size="small"
                    :icon="FileJson"
                    @click="
                      copyToClipboard(
                        JSON.stringify(
                          getAdaptedArgs(req).adaptedJson,
                          null,
                          2
                        ),
                        '转换后 JSON'
                      )
                    "
                  >
                    复制 JSON
                  </el-button>
                </div>
                <div class="param-table-wrapper">
                  <table class="param-table">
                    <thead>
                      <tr>
                        <th>参数名</th>
                        <th>原始值</th>
                        <th>预期类型</th>
                        <th>转换后</th>
                        <th>状态</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr
                        v-for="param in getAdaptedArgs(req).adapted"
                        :key="param.name"
                        :class="{
                          'param-missing': param.status === 'missing',
                          'param-type-error': param.status === 'type_error',
                          'param-optional': param.status === 'optional_ok',
                          'param-unknown': param.expectedType === 'unknown',
                        }"
                      >
                        <td class="param-name">{{ param.name }}</td>
                        <td class="param-raw">
                          <code>{{ param.rawValue || "—" }}</code>
                        </td>
                        <td class="param-type">
                          <el-tag
                            size="small"
                            :type="
                              param.expectedType === 'unknown'
                                ? 'warning'
                                : 'info'
                            "
                            effect="plain"
                          >
                            {{ param.expectedType }}
                          </el-tag>
                        </td>
                        <td class="param-adapted">
                          <code
                            v-if="
                              param.status === 'ok' ||
                              param.status === 'type_error'
                            "
                            >{{
                              typeof param.adaptedValue === "object"
                                ? JSON.stringify(param.adaptedValue)
                                : String(param.adaptedValue)
                            }}</code
                          >
                          <span v-else class="param-empty">—</span>
                        </td>
                        <td class="param-status">
                          <el-tag
                            v-if="param.status === 'ok'"
                            size="small"
                            type="success"
                            effect="plain"
                          >
                            ✅
                          </el-tag>
                          <el-tag
                            v-else-if="param.status === 'missing'"
                            size="small"
                            type="danger"
                            effect="dark"
                          >
                            缺失
                          </el-tag>
                          <el-tag
                            v-else-if="param.status === 'type_error'"
                            size="small"
                            type="warning"
                            effect="dark"
                          >
                            类型错误
                          </el-tag>
                          <el-tag
                            v-else-if="param.status === 'optional_ok'"
                            size="small"
                            type="info"
                            effect="plain"
                          >
                            可选
                          </el-tag>
                          <el-tag
                            v-else
                            size="small"
                            type="warning"
                            effect="plain"
                          >
                            未知
                          </el-tag>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>

              <!-- 无方法元数据时，回退到纯 JSON 展示 -->
              <template v-else>
                <div class="req-args-label">
                  提取参数
                  <el-button
                    link
                    size="small"
                    :icon="FileJson"
                    @click="
                      copyToClipboard(
                        JSON.stringify(req.args, null, 2),
                        '解析 JSON'
                      )
                    "
                  >
                    复制 JSON
                  </el-button>
                </div>
                <pre class="req-args">{{
                  JSON.stringify(req.args, null, 2)
                }}</pre>
              </template>
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
  border-bottom: var(--border-width) solid var(--border-color);
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
  border-right: var(--border-width) solid var(--border-color);
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
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
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
  border-bottom: var(--border-width) solid var(--border-color);
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
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  overflow: hidden;
  transition: border-color 0.2s;
}

.req-card:hover {
  border-color: var(--el-color-primary-light-5);
}

.req-card.is-invalid {
  border-color: rgba(var(--el-color-danger-rgb), 0.2);
}

.req-card.has-format-error {
  border-color: rgba(var(--el-color-danger-rgb), 0.4);
}

.req-card.is-invalid:hover {
  border-color: var(--el-color-danger);
}

.req-head {
  padding: 8px 12px;
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.is-invalid .req-head {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.05)
  );
}

.req-head-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.req-head-actions {
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

.req-errors {
  margin-bottom: 12px;
  padding: 8px 10px;
  background-color: rgba(var(--el-color-danger-rgb), 0.05);
  border-radius: 6px;
  border-left: 3px solid var(--el-color-danger);
}

.error-item {
  font-size: 12px;
  color: var(--el-color-danger);
  line-height: 1.5;
}

.error-bullet {
  font-weight: bold;
  margin-right: 4px;
}

.error-tooltip-content ul {
  margin: 5px 0 0 0;
  padding-left: 15px;
}

.req-args-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.req-args {
  margin: 0;
  padding: 8px 10px;
  font-size: 12px;
  font-family: var(--el-font-family-mono);
  background-color: var(--vscode-editor-background);
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-color);
  line-height: 1.6;
}

/* 参数详情表格 */
.param-table-wrapper {
  overflow-x: auto;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: var(--vscode-editor-background);
}

.param-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
  font-family: var(--el-font-family-mono);
}

.param-table th {
  padding: 6px 10px;
  text-align: left;
  font-weight: 600;
  color: var(--text-color-secondary);
  background-color: rgba(var(--text-color-rgb), 0.03);
  border-bottom: var(--border-width) solid var(--border-color);
  white-space: nowrap;
}

.param-table td {
  padding: 5px 10px;
  border-bottom: 1px solid rgba(var(--border-color-rgb), 0.3);
  vertical-align: middle;
}

.param-table tr:last-child td {
  border-bottom: none;
}

.param-table tr:hover {
  background-color: rgba(var(--el-color-primary-rgb), 0.03);
}

.param-table .param-name {
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
}

.param-table .param-raw code {
  color: var(--text-color-secondary);
  word-break: break-all;
}

.param-table .param-adapted code {
  color: var(--el-color-primary);
  word-break: break-all;
}

.param-table .param-empty {
  color: var(--text-color-disabled);
}

.param-table .param-type {
  white-space: nowrap;
}

.param-table .param-status {
  white-space: nowrap;
}

/* 参数状态行高亮 */
.param-missing {
  background-color: rgba(var(--el-color-danger-rgb), 0.04) !important;
}

.param-type-error {
  background-color: rgba(var(--el-color-warning-rgb), 0.04) !important;
}

.param-optional {
  opacity: 0.6;
}

.param-unknown {
  opacity: 0.7;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
}
</style>
