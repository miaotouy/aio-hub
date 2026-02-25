<script setup lang="ts">
import { ref, computed, onMounted, watch } from "vue";
import { useStorage } from "@vueuse/core";
import { Play, Zap, RotateCcw } from "lucide-vue-next";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { customMessage } from "@/utils/customMessage";
import { executeToolRequests } from "../core/executor";

// 导入拆分后的子组件
import ParameterForm from "./executor/ParameterForm.vue";
import ExecutionResultCard from "./executor/ExecutionResultCard.vue";

const props = defineProps<{
  groups: any[];
}>();

const selectedMethod = ref<any>(null);
const selectedToolKey = useStorage<string>("tool-calling-tester-selected-key", "");
const testToolName = useStorage<string>("tool-calling-tester-tool-name", "");
const formArgs = ref<Record<string, any>>({});
const testArgs = useStorage<string>("tool-calling-tester-args", "{\n  \n}");
const useJsonMode = useStorage<boolean>("tool-calling-tester-json-mode", false);
const executionResults = ref<any[]>([]);
const isExecuting = ref(false);

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
    // 优先从 settingsSchema 中寻找默认值
    const schemaItem = group.settingsSchema?.find((s: any) => s.modelPath === p.name);

    if (p.defaultValue !== undefined) {
      argsObj[p.name] = p.defaultValue;
    } else if (schemaItem?.defaultValue !== undefined) {
      argsObj[p.name] = schemaItem.defaultValue;
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
  if (!key) {
    selectedMethod.value = null;
    testToolName.value = "";
    return;
  }
  for (const group of props.groups) {
    for (const method of group.methods) {
      if (`${group.toolId}_${method.name}` === key) {
        applyMethod(group, method);
        return;
      }
    }
  }
};

// 页面加载或 groups 变化时，根据持久化的 key 恢复 selectedMethod
const restoreSelectedMethod = () => {
  if (selectedToolKey.value) {
    for (const group of props.groups) {
      for (const method of group.methods) {
        if (`${group.toolId}_${method.name}` === selectedToolKey.value) {
          selectedMethod.value = method;
          // 如果是 JSON 模式，需要同步回表单
          if (useJsonMode.value) {
            syncJsonToForm();
          } else {
            // 如果是表单模式，需要同步回 JSON
            try {
              formArgs.value = JSON.parse(testArgs.value);
            } catch (e) {
              // 忽略
            }
          }
          return;
        }
      }
    }
  }
};

onMounted(() => {
  restoreSelectedMethod();
});

// 监听 groups 变化，防止异步加载导致恢复失败
watch(
  () => props.groups,
  () => {
    if (!selectedMethod.value && selectedToolKey.value) {
      restoreSelectedMethod();
    }
  },
  { deep: true }
);

// 暴露加载方法（供父组件从 DiscoveryPane 跳转调用）
const loadMethod = (group: any, method: any) => {
  selectedToolKey.value = `${group.toolId}_${method.name}`;
  applyMethod(group, method);
};

defineExpose({ loadMethod });

const resetConfig = () => {
  selectedToolKey.value = "";
  testToolName.value = "";
  selectedMethod.value = null;
  testArgs.value = "{\n  \n}";
  formArgs.value = {};
  useJsonMode.value = false;
  customMessage.success("配置已重置");
};

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
        config: {
          mode: "auto",
          timeout: 60000,
          parallelExecution: true,
          defaultAutoApprove: true,
        } as any,
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
            <div class="label-actions">
              <el-tag v-if="selectedMethod" size="small" type="info" class="method-tag">
                {{ selectedMethod.name }}
              </el-tag>
              <el-tooltip content="重置配置" placement="top">
                <el-button link :icon="RotateCcw" class="reset-icon-btn" @click="resetConfig" />
              </el-tooltip>
            </div>
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
            <ParameterForm v-if="!useJsonMode" v-model="formArgs" :method="selectedMethod" @change="syncFormToJson" />

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

          <ExecutionResultCard v-for="res in executionResults" :key="res.requestId" :res="res" />
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

.label-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.method-tag {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reset-icon-btn {
  padding: 4px;
  height: auto;
  color: var(--text-color-secondary);
  opacity: 0.6;
  transition: all 0.2s;
}

.reset-icon-btn:hover {
  color: var(--el-color-danger);
  opacity: 1;
  transform: rotate(-90deg);
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

.opt-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.opt-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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
