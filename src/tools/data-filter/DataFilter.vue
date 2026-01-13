<template>
  <div class="data-filter-container">
    <div class="tool-wrapper">
      <!-- 顶部工具栏 -->
      <div class="toolbar">
        <div class="toolbar-left">
          <div class="tool-title">数据筛选工具</div>
          <el-divider direction="vertical" />
          <el-button @click="handlePaste" size="small" type="primary">
            <el-icon><DocumentCopy /></el-icon>
            粘贴
          </el-button>
          <el-button @click="handleCopy" size="small" :disabled="!resultText">
            <el-icon><CopyDocument /></el-icon>
            复制结果
          </el-button>
          <el-button @click="handleSendToChat" size="small" :disabled="!resultText">
            <el-icon><Send /></el-icon>
            发送到聊天
          </el-button>
        </div>

        <div class="toolbar-right">
          <el-button @click="handleClear" size="small" type="danger" plain>
            <el-icon><DeleteIcon /></el-icon>
            清空
          </el-button>
        </div>
      </div>

      <!-- 主内容区 -->
      <div class="main-content">
        <div class="filter-layout">
          <!-- 左侧：输入区 -->
          <div class="editor-panel input-panel">
            <div class="panel-header">
              <span class="panel-title">原始数据</span>
              <el-tag size="small" type="info" effect="plain">{{ inputType }}</el-tag>
            </div>
            <div class="editor-content">
              <RichCodeEditor
                v-model="inputText"
                :language="inputType === 'YAML' ? 'yaml' : 'json'"
                editor-type="monaco"
                placeholder="粘贴 JSON 或 YAML 数组数据到这里..."
              />
            </div>
          </div>

          <!-- 中间：配置区 -->
          <div class="config-panel">
            <div class="panel-header">
              <span class="panel-title">筛选规则</span>
              <el-button :icon="Plus" circle size="small" @click="addCondition" />
            </div>

            <el-scrollbar class="config-scroll">
              <div class="config-form">
                <el-form label-position="top" size="small">
                  <el-form-item label="数据路径 (可选)">
                    <el-input v-model="options.dataPath" placeholder="例如: data.items" clearable />
                  </el-form-item>

                  <div
                    v-for="(cond, index) in options.conditions"
                    :key="index"
                    class="condition-card"
                  >
                    <div class="cond-row">
                      <el-input
                        v-model="cond.key"
                        placeholder="键名 (如: status)"
                        class="key-input"
                      />
                      <el-button
                        :icon="Delete"
                        circle
                        type="danger"
                        plain
                        size="small"
                        @click="removeCondition(index)"
                      />
                    </div>

                    <div class="cond-row">
                      <el-select v-model="cond.operator" placeholder="操作符" class="op-select">
                        <el-option label="等于" value="eq" />
                        <el-option label="不等于" value="ne" />
                        <el-option label="包含" value="contains" />
                        <el-option label="真值" value="truthy" />
                        <el-option label="假值" value="falsy" />
                        <el-option label="自定义脚本" value="custom" />
                      </el-select>
                    </div>

                    <div v-if="showValueInput(cond.operator)" class="cond-row">
                      <el-input v-model="cond.value" placeholder="目标值" />
                    </div>

                    <div v-if="cond.operator === 'custom'" class="cond-row">
                      <el-input
                        v-model="cond.customScript"
                        type="textarea"
                        :rows="3"
                        placeholder="JS表达式, 如: item.id > 100"
                      />
                    </div>
                  </div>
                </el-form>
              </div>
            </el-scrollbar>

            <div class="config-footer">
              <el-button type="primary" :icon="Filter" @click="doExecuteFilter" class="execute-btn"
                >执行筛选</el-button
              >
            </div>
          </div>

          <!-- 右侧：结果区 -->
          <div class="editor-panel result-panel">
            <div class="panel-header">
              <span class="panel-title">筛选结果</span>
              <div class="stats" v-if="result">
                <span>{{ result.filtered }} / {{ result.total }} 项</span>
              </div>
            </div>
            <div class="editor-content">
              <RichCodeEditor
                :model-value="resultText"
                :language="inputType === 'YAML' ? 'yaml' : 'json'"
                editor-type="monaco"
                read-only
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from "vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import { Plus, Delete, Filter, Send } from "lucide-vue-next";
import { DocumentCopy, CopyDocument, Delete as DeleteIcon } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSendToChat } from "@/composables/useSendToChat";
import * as logic from "./logic/dataFilter.logic";
import yaml from "js-yaml";

const errorHandler = createModuleErrorHandler("DataFilter");
const { sendCodeToChat } = useSendToChat();

const inputText = ref("");
const resultText = ref("");
const result = ref<logic.FilterResult | null>(null);

const options = reactive<logic.FilterOptions>({
  dataPath: "",
  conditions: [{ key: "enabled", operator: "eq", value: "true" }],
});

// 自动识别输入类型
const inputType = computed(() => {
  const trimmed = inputText.value.trim();
  if (!trimmed) return "JSON";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "JSON";
  return "YAML";
});

function addCondition() {
  options.conditions.push({ key: "", operator: "eq", value: "" });
}

function removeCondition(index: number) {
  options.conditions.splice(index, 1);
}

function showValueInput(op: string) {
  return !["truthy", "falsy", "custom"].includes(op);
}

async function handlePaste() {
  try {
    const text = await readText();
    inputText.value = text;
    customMessage.success("已从剪贴板粘贴");
  } catch (error: any) {
    errorHandler.error(error, "粘贴失败");
  }
}

async function handleCopy() {
  if (!resultText.value) return;
  try {
    await writeText(resultText.value);
    customMessage.success("已复制结果");
  } catch (error: any) {
    errorHandler.error(error, "复制失败");
  }
}

function handleSendToChat() {
  if (!resultText.value) return;
  const lang = inputType.value === "YAML" ? "yaml" : "json";
  sendCodeToChat(resultText.value, lang, {
    successMessage: "筛选结果已发送到聊天",
  });
}

function handleClear() {
  inputText.value = "";
  resultText.value = "";
  result.value = null;
}

function doExecuteFilter() {
  if (!inputText.value.trim()) {
    customMessage.warning("请输入原始数据");
    return;
  }

  try {
    let parsedData: any;
    if (inputType.value === "JSON") {
      parsedData = JSON.parse(inputText.value);
    } else {
      parsedData = yaml.load(inputText.value);
    }

    // 预处理 condition 中的 value
    const processedOptions = {
      ...options,
      conditions: options.conditions.map((c) => {
        let val = c.value;
        if (val === "true") val = true;
        else if (val === "false") val = false;
        else if (!isNaN(Number(val)) && val !== "" && typeof val === "string") val = Number(val);
        return { ...c, value: val };
      }),
    };

    const res = logic.applyFilter(parsedData, processedOptions);
    result.value = res;

    if (res.error) {
      customMessage.error(res.error);
      resultText.value = "";
    } else {
      if (inputType.value === "JSON") {
        resultText.value = JSON.stringify(res.data, null, 2);
      } else {
        resultText.value = yaml.dump(res.data);
      }
      if (res.filtered === 0) {
        customMessage.info("筛选完成，没有匹配的项");
      }
    }
  } catch (e: any) {
    customMessage.error("解析失败: " + e.message);
  }
}
</script>

<style scoped>
.data-filter-container {
  display: flex;
  height: 100%;
  width: 100%;
  padding: 20px;
  box-sizing: border-box;
}

.tool-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
}

/* 顶部工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tool-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

/* 主内容区 */
.main-content {
  flex: 1;
  overflow: hidden;
}

.filter-layout {
  display: flex;
  height: 100%;
  overflow: hidden;
}

.editor-panel {
  flex: 3;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.input-panel {
  border-right: 1px solid var(--border-color);
}

.result-panel {
  border-left: 1px solid var(--border-color);
}

.config-panel {
  flex: 2;
  min-width: 280px;
  max-width: 380px;
  display: flex;
  flex-direction: column;
  background-color: transparent;
}

.panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background-color: var(--sidebar-bg);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
  height: 42px;
  box-sizing: border-box;
}

.panel-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.editor-content {
  flex: 1;
  overflow: hidden;
}

:deep(.rich-code-editor-wrapper) {
  border: none;
  border-radius: 0;
}

/* 配置区内部样式 */
.config-scroll {
  flex: 1;
  background-color: var(--sidebar-bg);
}

.config-form {
  padding: 16px;
}

.condition-card {
  padding: 12px;
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  margin-bottom: 12px;
  transition: border-color 0.2s;
}

.condition-card:hover {
  border-color: var(--primary-color);
}

.cond-row {
  display: flex;
  gap: 8px;
  margin-bottom: 8px;
}

.cond-row:last-child {
  margin-bottom: 0;
}

.key-input {
  flex: 1;
}

.op-select {
  width: 100%;
}

.config-footer {
  padding: 16px;
  background-color: var(--sidebar-bg);
  border-top: 1px solid var(--border-color);
}

.execute-btn {
  width: 100%;
}

.stats {
  font-size: 12px;
  color: var(--text-color-light);
}

:deep(.el-form-item__label) {
  font-size: 12px;
  color: var(--text-color-light);
  margin-bottom: 4px;
}
</style>
