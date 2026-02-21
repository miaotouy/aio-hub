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
              <div class="panel-header-actions">
                <!-- 预设选择器 -->
                <div class="preset-selector-group">
                  <el-select
                    v-model="activePresetId"
                    placeholder="选择预设..."
                    size="small"
                    class="preset-select"
                    clearable
                    @change="handlePresetChange"
                  >
                    <template #prefix>
                      <el-icon><BookmarkIcon /></el-icon>
                    </template>
                    <el-option v-for="preset in presets" :key="preset.id" :label="preset.name" :value="preset.id">
                      <div class="preset-option-item">
                        <span>{{ preset.name }}</span>
                        <el-icon class="delete-icon" @click.stop="handleDeletePreset(preset.id)">
                          <CloseIcon />
                        </el-icon>
                      </div>
                    </el-option>
                  </el-select>

                  <div class="preset-actions" v-if="activePresetId">
                    <el-tooltip content="更新当前预设" placement="top">
                      <el-button :icon="SaveIcon" circle size="small" @click="handleUpdatePreset" />
                    </el-tooltip>
                    <el-tooltip content="另存为/重命名" placement="top">
                      <el-dropdown trigger="click" @command="handlePresetMoreCommand">
                        <el-button :icon="PlusIcon" circle size="small" />
                        <template #dropdown>
                          <el-dropdown-menu>
                            <el-dropdown-item :icon="EditIcon" command="rename">重命名</el-dropdown-item>
                            <el-dropdown-item :icon="CopyIcon" command="saveAs">另存为新预设</el-dropdown-item>
                          </el-dropdown-menu>
                        </template>
                      </el-dropdown>
                    </el-tooltip>
                  </div>
                  <el-tooltip content="保存为预设" placement="top" v-else>
                    <el-button :icon="PlusIcon" circle size="small" @click="handleSaveAsPreset" />
                  </el-tooltip>
                </div>
              </div>
            </div>

            <el-scrollbar class="config-scroll">
              <div class="config-form">
                <el-form label-position="top" size="small">
                  <div class="config-section-header">
                    <span class="section-label">数据路径 (可选)</span>
                  </div>
                  <el-form-item>
                    <el-input v-model="options.dataPath" placeholder="例如: data.items" clearable />
                  </el-form-item>

                  <div class="config-section-header">
                    <span class="section-label">筛选条件</span>
                    <el-button :icon="Plus" type="primary" link size="small" @click="addCondition">添加条件</el-button>
                  </div>

                  <div v-for="(cond, index) in options.conditions" :key="index" class="condition-card">
                    <div class="cond-row">
                      <el-input v-model="cond.key" placeholder="键名 (如: status)" class="key-input" />
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
              <el-button type="primary" :icon="Filter" @click="doExecuteFilter" class="execute-btn">执行筛选</el-button>
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

    <!-- 保存预设对话框 -->
    <BaseDialog v-model="savePresetDialogVisible" title="保存筛选规则预设" width="400px">
      <el-form label-position="top" size="small">
        <el-form-item label="预设名称">
          <el-input
            v-model="saveAsName"
            placeholder="例如：过滤已启用项"
            clearable
            @keyup.enter="confirmSaveAsPreset"
            ref="saveAsInputRef"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="savePresetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmSaveAsPreset">保存</el-button>
      </template>
    </BaseDialog>

    <!-- 重命名预设对话框 -->
    <BaseDialog v-model="renamePresetDialogVisible" title="重命名预设" width="400px">
      <el-form label-position="top" size="small">
        <el-form-item label="新的预设名称">
          <el-input
            v-model="renameName"
            placeholder="请输入新的名称"
            clearable
            @keyup.enter="confirmRenamePreset"
            ref="renameInputRef"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="renamePresetDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRenamePreset">确定</el-button>
      </template>
    </BaseDialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, watch, onMounted, nextTick } from "vue";
import RichCodeEditor from "@/components/common/RichCodeEditor.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { Plus, Delete, Filter, Send, Bookmark, Save, X, Edit3, Copy } from "lucide-vue-next";
import { DocumentCopy, CopyDocument, Delete as DeleteIcon, Plus as PlusIcon } from "@element-plus/icons-vue";
import { customMessage } from "@/utils/customMessage";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSendToChat } from "@/composables/useSendToChat";
import * as logic from "./logic/dataFilter.logic";
import yaml from "js-yaml";
import { useDataFilterConfig } from "./composables/useDataFilterConfig";

// 图标别名
const BookmarkIcon = Bookmark;
const SaveIcon = Save;
const CloseIcon = X;
const EditIcon = Edit3;
const CopyIcon = Copy;

const errorHandler = createModuleErrorHandler("DataFilter");
const { sendCodeToChat } = useSendToChat();
const { presets, loadConfig, saveLastState, savePreset, updatePreset, deletePreset, renamePreset } =
  useDataFilterConfig();

const inputText = ref("");
const resultText = ref("");
const result = ref<logic.FilterResult | null>(null);
const savePresetDialogVisible = ref(false);
const renamePresetDialogVisible = ref(false);
const saveAsName = ref("");
const renameName = ref("");
const saveAsInputRef = ref<InstanceType<(typeof import("element-plus"))["ElInput"]> | null>(null);
const renameInputRef = ref<InstanceType<(typeof import("element-plus"))["ElInput"]> | null>(null);
const activePresetId = ref<string | null>(null);
const activePresetName = ref("");

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

// 加载持久化配置
onMounted(async () => {
  const lastState = await loadConfig();
  if (lastState.inputText) {
    inputText.value = lastState.inputText;
  }
  if (lastState.options) {
    options.dataPath = lastState.options.dataPath ?? "";
    options.conditions = lastState.options.conditions?.length
      ? lastState.options.conditions
      : [{ key: "enabled", operator: "eq", value: "true" }];
  }
});

// 自动保存当前状态（防抖）
watch(
  [inputText, () => JSON.stringify(options)],
  () => {
    saveLastState(inputText.value, { ...options, conditions: [...options.conditions] });
  },
  { deep: true }
);

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
  activePresetId.value = null;
  activePresetName.value = "";
}

// 预设相关
function handlePresetChange(id: string | null) {
  if (!id) {
    activePresetId.value = null;
    activePresetName.value = "";
    return;
  }
  const preset = presets.value.find((p) => p.id === id);
  if (preset) {
    options.dataPath = preset.options.dataPath ?? "";
    options.conditions = JSON.parse(JSON.stringify(preset.options.conditions));
    activePresetId.value = preset.id;
    activePresetName.value = preset.name;
    customMessage.success(`已加载预设「${preset.name}」`);
  }
}

async function handleUpdatePreset() {
  if (!activePresetId.value) return;
  await updatePreset(activePresetId.value, {
    ...options,
    conditions: JSON.parse(JSON.stringify(options.conditions)),
  });
  customMessage.success("预设已更新");
}

function handleSaveAsPreset() {
  saveAsName.value = activePresetId.value ? `${activePresetName.value} (副本)` : "";
  savePresetDialogVisible.value = true;
  nextTick(() => {
    saveAsInputRef.value?.focus();
  });
}

function handleRenamePreset() {
  if (!activePresetId.value) return;
  renameName.value = activePresetName.value;
  renamePresetDialogVisible.value = true;
  nextTick(() => {
    renameInputRef.value?.focus();
  });
}

function handlePresetMoreCommand(command: string) {
  if (command === "rename") {
    handleRenamePreset();
  } else if (command === "saveAs") {
    handleSaveAsPreset();
  }
}

async function handleDeletePreset(id: string) {
  await deletePreset(id);
  if (activePresetId.value === id) {
    activePresetId.value = null;
    activePresetName.value = "";
  }
  customMessage.success("预设已删除");
}

async function confirmSaveAsPreset() {
  const name = saveAsName.value.trim();
  if (!name) {
    customMessage.warning("请输入预设名称");
    return;
  }

  const newId = await savePreset(name, {
    ...options,
    conditions: JSON.parse(JSON.stringify(options.conditions)),
  });
  activePresetId.value = newId;
  activePresetName.value = name;
  customMessage.success(`预设「${name}」已保存`);
  savePresetDialogVisible.value = false;
}

async function confirmRenamePreset() {
  const name = renameName.value.trim();
  if (!name) {
    customMessage.warning("请输入预设名称");
    return;
  }

  if (activePresetId.value) {
    await renamePreset(activePresetId.value, name);
    activePresetName.value = name;
    customMessage.success(`预设已重命名为「${name}」`);
  }
  renamePresetDialogVisible.value = false;
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

.panel-header-actions {
  display: flex;
  align-items: center;
  gap: 6px;
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

/* 预设选择器 */
.preset-selector-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.preset-select {
  width: 140px;
}

.preset-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.preset-option-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.delete-icon {
  margin-left: 8px;
  color: var(--el-text-color-placeholder);
  cursor: pointer;
  font-size: 14px;
}

.delete-icon:hover {
  color: var(--el-color-danger);
}

.config-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  margin-top: 4px;
}

.section-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
}
</style>
