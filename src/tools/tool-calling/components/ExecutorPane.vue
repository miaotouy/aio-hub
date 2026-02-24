<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import { Play, CheckCircle2, XCircle, Clock, Zap, Settings2, FolderOpen, Eye, Code, FileJson } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";
import { open } from "@tauri-apps/plugin-dialog";
import { customMessage } from "@/utils/customMessage";
import { executeToolRequests } from "../core/executor";

const props = defineProps<{
  groups: any[];
}>();

const selectedMethod = ref<any>(null);
const selectedToolKey = ref<string>("");
const testToolName = ref("");
const formArgs = ref<Record<string, any>>({});
const testArgs = ref("{\n  \n}");
const useJsonMode = ref(false);
const executionResults = ref<any[]>([]);
const isExecuting = ref(false);

// 结果查看模式管理
const resultViewModes = reactive<Record<string, "markdown" | "json" | "raw">>({});

const getResultViewMode = (id: string) => resultViewModes[id] || "markdown";
const setResultViewMode = (id: string, mode: "markdown" | "json" | "raw") => {
  resultViewModes[id] = mode;
};

/**
 * 解析联合类型字符串，例如 "'none' | 'gitignore' | 'custom' | 'both'"
 * 也支持 "Array<'statistics' | 'commits'>" 格式
 */
const parseUnionType = (typeStr: string): { options: string[]; isArray: boolean } | null => {
  if (!typeStr) return null;

  let isArray = false;
  let targetStr = typeStr.trim();

  // 检查是否是 Array<...> 格式
  const arrayMatch = targetStr.match(/^Array<(.+)>$/);
  if (arrayMatch) {
    isArray = true;
    targetStr = arrayMatch[1].trim();
  }

  // 匹配类似 'a' | 'b' | "c" 的格式
  const parts = targetStr.split("|").map((s) => s.trim());
  if (parts.length <= 1 && !isArray) return null;

  const options: string[] = [];
  for (const part of parts) {
    // 移除引号
    const match = part.match(/^['"](.+)['"]$/);
    if (match) {
      options.push(match[1]);
    } else {
      // 如果其中一个不是带引号的字符串字面量，可能不是纯字符串联合类型
      // 但如果是 Array<string> 这种，我们也暂时不处理成下拉
      if (!isArray) return null;
    }
  }

  return options.length > 0 ? { options, isArray } : null;
};
/**
 * 判断是否可能是路径参数
 */
const isPathParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "path" || hint === "file" || hint === "directory" || hint === "folder") return true;

  if (p.type?.toLowerCase() !== "string") return false;
  const name = p.name?.toLowerCase() || "";
  const desc = p.description?.toLowerCase() || "";
  return (
    name.includes("path") ||
    name.includes("dir") ||
    name.includes("file") ||
    desc.includes("路径") ||
    desc.includes("目录") ||
    desc.includes("文件")
  );
};

/**
 * 判断是否可能是模型参数
 */
const isModelParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "model") return true;

  if (p.type?.toLowerCase() !== "string") return false;
  const name = p.name?.toLowerCase() || "";
  return name.includes("modelid") || name === "model";
};

/**
 * 判断是否可能是长文本参数
 */
const isLargeTextParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "textarea" || hint === "text") return true;

  if (p.type?.toLowerCase() !== "string") return false;
  const name = p.name?.toLowerCase() || "";
  const desc = p.description?.toLowerCase() || "";
  return (
    name.includes("text") ||
    name.includes("content") ||
    name.includes("prompt") ||
    name.includes("code") ||
    name.includes("body") ||
    desc.includes("内容") ||
    desc.includes("文本") ||
    desc.includes("提示词") ||
    desc.includes("代码")
  );
};

/**
 * 判断是否可能是 JSON 参数
 */
const isJsonParameter = (p: any) => {
  const hint = p.uiHint?.toLowerCase();
  if (hint === "json") return true;

  const type = p.type?.toLowerCase();
  return type === "object" || type === "array";
};

/**
 * 处理 JSON 更新
 */
const handleJsonParamUpdate = (paramName: string, value: string) => {
  try {
    formArgs.value[paramName] = JSON.parse(value);
    syncFormToJson();
  } catch (e) {
    // 忽略解析过程中的错误
  }
};

/**
 * 处理路径选择
 */
const handlePathSelect = async (paramName: string, description: string) => {
  try {
    const isDir = description.includes("目录") || description.includes("folder") || description.includes("dir");
    const selected = await open({
      directory: isDir,
      multiple: false,
      title: `选择${isDir ? "目录" : "文件"} - ${paramName}`,
    });

    if (selected && typeof selected === "string") {
      formArgs.value[paramName] = selected;
      syncFormToJson();
    }
  } catch (e: any) {
    customMessage.error("选择路径失败: " + e.message);
  }
};

// 扁平化所有方法为分组选项
const methodOptions = computed(() =>
  props.groups.map((group) => ({
    label: group.toolName,
    toolId: group.toolId,
    options: group.methods.map((method: any) => ({
      value: `${group.toolId}_${method.name}`,
      label: method.displayName || method.name,
      subLabel: method.displayName ? method.name : undefined,
      method,
      group,
    })),
  }))
);

const applyMethod = (group: any, method: any) => {
  testToolName.value = `${group.toolId}_${method.name}`;
  selectedMethod.value = method;

  const argsObj: Record<string, any> = {};
  method.parameters.forEach((p: any) => {
    if (p.defaultValue !== undefined) {
      argsObj[p.name] = p.defaultValue;
    } else {
      switch (p.type?.toLowerCase()) {
        case "number":
          argsObj[p.name] = 0;
          break;
        case "boolean":
          argsObj[p.name] = false;
          break;
        case "array":
          argsObj[p.name] = [];
          break;
        case "object":
          argsObj[p.name] = {};
          break;
        default:
          argsObj[p.name] = "";
      }
    }
  });

  formArgs.value = argsObj;
  testArgs.value = JSON.stringify(argsObj, null, 2);
  useJsonMode.value = false;
};

// 下拉选择时触发
const onMethodSelect = (key: string) => {
  for (const group of props.groups) {
    for (const method of group.methods) {
      if (`${group.toolId}_${method.name}` === key) {
        applyMethod(group, method);
        return;
      }
    }
  }
};

// 暴露加载方法（供父组件从 DiscoveryPane 跳转调用）
const loadMethod = (group: any, method: any) => {
  selectedToolKey.value = `${group.toolId}_${method.name}`;
  applyMethod(group, method);
};

defineExpose({ loadMethod });

const syncFormToJson = () => {
  testArgs.value = JSON.stringify(formArgs.value, null, 2);
};

const syncJsonToForm = () => {
  try {
    formArgs.value = JSON.parse(testArgs.value);
  } catch (e) {
    // 忽略解析错误
  }
};

const runExecutionTest = async () => {
  if (!testToolName.value) {
    customMessage.warning("请先选择目标方法");
    return;
  }

  isExecuting.value = true;
  try {
    let args = {};
    try {
      args = JSON.parse(testArgs.value);
    } catch (e) {
      customMessage.error("参数 JSON 格式错误");
      isExecuting.value = false;
      return;
    }

    const results = await executeToolRequests(
      [
        {
          requestId: "debug-" + Math.random().toString(36).slice(2, 7),
          toolName: testToolName.value,
          args,
          rawBlock: "",
        },
      ],
      {
        config: { timeout: 60000 } as any,
      }
    );
    executionResults.value = [...results, ...executionResults.value].slice(0, 10);
    customMessage.success("执行完成");
  } catch (e: any) {
    customMessage.error("执行异常: " + e.message);
  } finally {
    isExecuting.value = false;
  }
};

const clearHistory = () => {
  executionResults.value = [];
};
</script>

<template>
  <div class="pane executor-pane">
    <div class="executor-layout">
      <!-- 左侧配置 -->
      <div class="config-panel scrollbar-styled">
        <div class="config-section">
          <div class="section-label-row">
            <label>目标工具方法</label>
            <el-tag v-if="selectedMethod" size="small" type="info">
              {{ selectedMethod.name }}
            </el-tag>
          </div>
          <el-select
            v-model="selectedToolKey"
            filterable
            placeholder="搜索或选择方法..."
            class="w-full"
            @change="onMethodSelect"
          >
            <el-option-group v-for="group in methodOptions" :key="group.toolId" :label="group.label">
              <el-option v-for="opt in group.options" :key="opt.value" :value="opt.value" :label="opt.label">
                <div class="opt-item">
                  <span class="opt-label">{{ opt.label }}</span>
                  <span v-if="opt.subLabel" class="opt-sub">{{ opt.subLabel }}</span>
                </div>
              </el-option>
            </el-option-group>
          </el-select>
        </div>

        <div class="config-section flex-1 overflow-hidden">
          <div class="section-label-row">
            <label>调用参数</label>
            <el-radio-group v-model="useJsonMode" size="small">
              <el-radio-button :value="false">表单</el-radio-button>
              <el-radio-button :value="true">JSON</el-radio-button>
            </el-radio-group>
          </div>

          <div class="editor-wrapper">
            <!-- 表单模式 -->
            <div v-if="!useJsonMode" class="form-container scrollbar-styled">
              <div v-if="!selectedMethod" class="empty-form">
                <Settings2 :size="32" />
                <p>请先选择一个方法</p>
              </div>
              <el-form v-else label-position="top" size="default">
                <el-form-item v-for="p in selectedMethod.parameters" :key="p.name" :label="p.name">
                  <template #label>
                    <div class="form-label">
                      <span class="p-name">{{ p.name }}</span>
                      <span class="p-type">{{ p.type }}</span>
                      <span v-if="p.required" class="p-required">*</span>
                    </div>
                  </template>

                  <!-- 布尔类型 -->
                  <el-switch
                    v-if="p.uiHint === 'switch' || p.type?.toLowerCase() === 'boolean'"
                    v-model="formArgs[p.name]"
                    @change="syncFormToJson"
                  />

                  <!-- 数字类型 -->
                  <el-input-number
                    v-else-if="p.uiHint === 'number' || p.type?.toLowerCase() === 'number'"
                    v-model="formArgs[p.name]"
                    class="w-full"
                    :min="p.min !== undefined ? p.min : p.range?.min"
                    :max="p.max !== undefined ? p.max : p.range?.max"
                    @change="syncFormToJson"
                  />

                  <!-- 枚举或联合类型 -->
                  <el-select
                    v-else-if="p.uiHint === 'select' || p.enumValues || p.options || parseUnionType(p.type)"
                    v-model="formArgs[p.name]"
                    class="w-full"
                    :multiple="parseUnionType(p.type)?.isArray"
                    @change="syncFormToJson"
                  >
                    <el-option
                      v-for="val in p.enumValues || p.options || parseUnionType(p.type)?.options || []"
                      :key="typeof val === 'object' ? val.value : val"
                      :label="typeof val === 'object' ? val.label : val"
                      :value="typeof val === 'object' ? val.value : val"
                    />
                  </el-select>

                  <!-- 模型选择 -->
                  <LlmModelSelector
                    v-else-if="isModelParameter(p)"
                    v-model="formArgs[p.name]"
                    class="w-full"
                    @change="syncFormToJson"
                  />

                  <!-- 路径选择 -->
                  <el-input
                    v-else-if="isPathParameter(p)"
                    v-model="formArgs[p.name]"
                    :placeholder="p.description"
                    @input="syncFormToJson"
                  >
                    <template #append>
                      <el-button :icon="FolderOpen" @click="handlePathSelect(p.name, p.description)" />
                    </template>
                  </el-input>

                  <!-- 复杂对象/数组 (内嵌 JSON 编辑器) -->
                  <div v-else-if="isJsonParameter(p)" class="embedded-editor">
                    <RichCodeEditor
                      :value="JSON.stringify(formArgs[p.name], null, 2)"
                      language="json"
                      height="120px"
                      @change="(val: string) => handleJsonParamUpdate(p.name, val)"
                    />
                  </div>

                  <!-- 长文本 -->
                  <el-input
                    v-else-if="isLargeTextParameter(p)"
                    v-model="formArgs[p.name]"
                    type="textarea"
                    :autosize="{ minRows: 2, maxRows: 6 }"
                    :placeholder="p.description"
                    @input="syncFormToJson"
                  />

                  <!-- 普通输入 -->
                  <el-input v-else v-model="formArgs[p.name]" :placeholder="p.description" @input="syncFormToJson" />

                  <div v-if="p.description" class="p-desc">{{ p.description }}</div>
                </el-form-item>
              </el-form>
            </div>

            <!-- JSON 模式 -->
            <RichCodeEditor v-else v-model:value="testArgs" language="json" height="100%" @change="syncJsonToForm" />
          </div>
        </div>
      </div>

      <!-- 右侧结果 -->
      <div class="result-panel">
        <div class="section-header">
          <div class="header-actions">
            <el-button type="primary" :loading="isExecuting" :icon="Play" @click="runExecutionTest">
              触发调用
            </el-button>
          </div>
          <div class="header-right">
            <span class="result-label">执行反馈 ({{ executionResults.length }}/10)</span>
            <el-button v-if="executionResults.length" link type="primary" size="small" @click="clearHistory"
              >清空</el-button
            >
          </div>
        </div>

        <div class="results-list scrollbar-styled">
          <div v-if="!executionResults.length && !isExecuting" class="empty-results">
            <Zap :size="48" />
            <p>等待指令执行...</p>
          </div>

          <div v-for="res in executionResults" :key="res.requestId" class="res-card">
            <div class="res-head">
              <div class="res-status" :class="res.status">
                <component :is="res.status === 'success' ? CheckCircle2 : XCircle" :size="14" />
                <span>{{ res.status.toUpperCase() }}</span>
              </div>
              <div class="res-id">{{ res.requestId }}</div>
              <div class="res-meta">
                <span class="meta-item"><Clock :size="12" /> {{ res.durationMs }}ms</span>
                <span class="meta-item debug-tag" :title="res.result">Len: {{ res.result?.length || 0 }}</span>
              </div>
              <div class="res-view-switch">
                <el-radio-group
                  :model-value="getResultViewMode(res.requestId)"
                  size="small"
                  @update:model-value="(val: any) => setResultViewMode(res.requestId, val)"
                >
                  <el-radio-button value="markdown"
                    ><el-tooltip content="Markdown 预览"><Eye :size="12" /></el-tooltip
                  ></el-radio-button>
                  <el-radio-button value="json"
                    ><el-tooltip content="JSON 源码"><FileJson :size="12" /></el-tooltip
                  ></el-radio-button>
                  <el-radio-button value="raw"
                    ><el-tooltip content="原始文本"><Code :size="12" /></el-tooltip
                  ></el-radio-button>
                </el-radio-group>
              </div>
            </div>
            <div class="res-body">
              <template v-if="getResultViewMode(res.requestId) === 'markdown'">
                <RichCodeEditor :value="res.result" language="markdown" height="150px" readonly />
              </template>
              <template v-else-if="getResultViewMode(res.requestId) === 'json'">
                <RichCodeEditor :value="res.result" language="json" height="150px" readonly />
              </template>
              <div v-else class="raw-preview scrollbar-styled">
                <div class="raw-content">{{ res.result }}</div>
                <div v-if="!res.result" class="raw-empty">结果为空字符串</div>
              </div>
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

.executor-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 380px 1fr;
  overflow: hidden;
}

.config-panel {
  border-right: 1px solid var(--border-color);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  background-color: rgba(var(--sidebar-bg-rgb), 0.3);
}

.config-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-label-row label {
  font-size: 13px;
  font-weight: 600;
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

.form-container {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  background-color: var(--card-bg);
}

.empty-form {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-secondary);
  opacity: 0.5;
  gap: 12px;
}

.form-label {
  display: flex;
  align-items: center;
  gap: 6px;
}

.p-name {
  font-weight: 600;
  font-family: var(--el-font-family-mono);
}

.p-type {
  font-size: 10px;
  color: var(--el-color-info);
  background: rgba(var(--el-color-info-rgb), 0.1);
  padding: 1px 4px;
  border-radius: 3px;
}

.p-required {
  color: var(--el-color-danger);
}

.p-desc {
  font-size: 11px;
  color: var(--text-color-secondary);
  margin-top: 2px;
  line-height: 1.4;
}

.embedded-editor {
  border: 1px solid var(--border-color);
  border-radius: 4px;
  overflow: hidden;
}

.result-panel {
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  min-width: 0;
}

.section-header {
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.result-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  white-space: nowrap;
}

.results-list {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.res-card {
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  overflow: hidden;
}

.res-head {
  padding: 6px 12px;
  background-color: rgba(var(--text-color-rgb), 0.03);
  border-bottom: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 12px;
}

.res-status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-weight: 700;
  font-size: 11px;
}

.res-status.success {
  color: var(--el-color-success);
}
.res-status.error {
  color: var(--el-color-danger);
}

.res-id {
  font-family: var(--el-font-family-mono);
  font-size: 11px;
  color: var(--text-color-secondary);
  flex: 1;
}

.res-meta {
  font-size: 11px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.debug-tag {
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
  padding: 0 4px;
  border-radius: 2px;
  font-family: var(--el-font-family-mono);
  cursor: help;
}

.res-body {
  padding: 8px;
}

.opt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.opt-sub {
  font-size: 11px;
  color: var(--text-color-secondary);
  font-family: var(--el-font-family-mono);
  opacity: 0.7;
}

.w-full {
  width: 100%;
}
.flex-1 {
  flex: 1;
}
.overflow-hidden {
  overflow: hidden;
}

.scrollbar-styled::-webkit-scrollbar {
  width: 5px;
}

.scrollbar-styled::-webkit-scrollbar-thumb {
  background: rgba(var(--el-color-info-rgb), 0.2);
  border-radius: 10px;
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
</style>
