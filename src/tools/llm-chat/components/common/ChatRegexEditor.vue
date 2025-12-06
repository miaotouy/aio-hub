<template>
  <div class="chat-regex-editor">
    <!-- 顶部操作栏 -->
    <div class="editor-header">
      <div class="header-left">
        <h4>正则管道配置</h4>
        <el-tooltip content="用于对消息内容进行动态清洗、格式转换等" placement="right">
          <el-icon class="info-icon"><InfoIcon /></el-icon>
        </el-tooltip>
      </div>
      <div class="header-actions">
        <el-button @click="addPreset" size="small" :icon="Plus"> 新建预设 </el-button>
        <el-dropdown trigger="click" @command="handleImportCommand">
          <el-button size="small" :icon="Download">
            导入
            <el-icon class="el-icon--right"><ChevronDown /></el-icon>
          </el-button>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="sillytavern">从 SillyTavern 导入</el-dropdown-item>
              <el-dropdown-item command="json">从 JSON 导入</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>

    <!-- 预设列表 (一级层级) -->
    <div class="presets-container" v-if="localConfig.presets && localConfig.presets.length > 0">
      <el-collapse v-model="expandedPresets">
        <div>
          <draggable
            v-model="localConfig.presets"
            item-key="id"
            handle=".preset-drag-handle"
            ghost-class="drag-ghost"
            @end="handlePresetReorder"
          >
            <template #item="{ element: preset, index }">
              <div>
                <el-collapse-item :name="preset.id" class="preset-item">
                  <template #title>
                    <div class="preset-header" @click.stop="togglePreset(preset.id)">
                      <el-icon class="preset-drag-handle" @click.stop><GripVertical /></el-icon>
                      <el-switch
                        v-model="preset.enabled"
                        size="small"
                        @change="handleChange"
                        @click.stop
                      />
                      <span class="preset-name">{{ preset.name }}</span>
                      <el-tag size="small" type="info"> {{ preset.rules.length }} 条规则 </el-tag>
                      <div class="preset-actions">
                        <el-button
                          @click.stop="duplicatePreset(index)"
                          :icon="Copy"
                          size="small"
                          text
                          title="复制预设"
                        />
                        <el-button
                          @click.stop="deletePreset(index)"
                          :icon="Trash2"
                          size="small"
                          text
                          type="danger"
                          title="删除预设"
                        />
                      </div>
                    </div>
                  </template>

                  <!-- 预设详情 (二级层级) -->
                  <div class="preset-content">
                    <!-- 预设基本信息 -->
                    <div class="preset-info">
                      <el-input
                        v-model="preset.name"
                        placeholder="预设名称"
                        size="small"
                        @input="handleChange"
                      >
                        <template #prepend>名称</template>
                      </el-input>
                      <el-input
                        v-model="preset.description"
                        placeholder="预设描述（可选）"
                        size="small"
                        @input="handleChange"
                      >
                        <template #prepend>描述</template>
                      </el-input>
                    </div>

                    <!-- 规则列表 -->
                    <!-- 规则区域 (左右分栏布局) -->
                    <div class="rules-section">
                      <div class="rules-container">
                        <!-- 左侧：规则列表 -->
                        <div class="rules-sidebar">
                          <div class="rules-header">
                            <span class="rules-title">规则列表</span>
                            <el-button
                              @click="addRule(preset)"
                              size="small"
                              :icon="Plus"
                              type="primary"
                              plain
                              circle
                              title="添加规则"
                            />
                          </div>

                          <div class="rules-list-scroll">
                            <div class="rules-list" v-if="preset.rules.length > 0">
                              <draggable
                                v-model="preset.rules"
                                item-key="id"
                                handle=".rule-drag-handle"
                                ghost-class="drag-ghost"
                                @end="handleChange"
                              >
                                <template #item="{ element: rule, index: ruleIndex }">
                                  <div
                                    class="rule-item"
                                    :class="{ 'is-selected': selectedRule?.id === rule.id }"
                                    @click="selectRule(preset, rule)"
                                  >
                                    <div class="rule-item-main">
                                      <div class="rule-item-header">
                                        <el-icon class="rule-drag-handle"><GripVertical /></el-icon>
                                        <span class="rule-name">{{
                                          rule.name || "未命名规则"
                                        }}</span>
                                        <el-switch
                                          v-model="rule.enabled"
                                          size="small"
                                          @click.stop
                                          @change="handleChange"
                                        />
                                      </div>
                                      <code class="rule-preview">{{
                                        truncateRegex(rule.regex)
                                      }}</code>
                                    </div>
                                    <div class="rule-actions">
                                      <el-button
                                        @click.stop="deleteRule(preset, ruleIndex)"
                                        :icon="Trash2"
                                        size="small"
                                        text
                                        type="danger"
                                      />
                                    </div>
                                  </div>
                                </template>
                              </draggable>
                            </div>
                            <div v-else class="empty-rules">
                              <span class="text-muted">暂无规则，点击上方 + 添加</span>
                            </div>
                          </div>
                        </div>

                        <!-- 右侧：规则编辑 -->
                        <div class="rules-editor-panel">
                          <div
                            v-if="selectedPreset?.id === preset.id && selectedRule"
                            class="editor-wrapper"
                          >
                            <ChatRegexRuleForm
                              v-model="selectedRule"
                              @update:model-value="handleRuleUpdate"
                            />
                          </div>
                          <div v-else class="editor-placeholder">
                            <el-icon :size="48" class="placeholder-icon"><InfoIcon /></el-icon>
                            <p>请从左侧选择一条规则进行编辑</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </el-collapse-item>
              </div>
            </template>
          </draggable>
        </div>
      </el-collapse>
    </div>
    <el-empty v-else description="暂无正则预设" :image-size="80">
      <el-button @click="addPreset" type="primary">创建预设</el-button>
    </el-empty>
    <!-- 导入对话框 -->
    <el-dialog v-model="isImportDialogVisible" title="导入正则脚本" width="600px">
      <el-input v-model="importJson" type="textarea" :rows="12" placeholder="粘贴 JSON 内容..." />
      <template #footer>
        <el-button @click="isImportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="executeImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import draggable from "vuedraggable";
import { cloneDeep, defaultsDeep } from "lodash-es";
import {
  Plus,
  Download,
  ChevronDown,
  GripVertical,
  Copy,
  Trash2,
  Info as InfoIcon,
} from "lucide-vue-next";
import type { ChatRegexConfig, ChatRegexPreset, ChatRegexRule } from "../../types/chatRegex";
import {
  createDefaultChatRegexConfig,
  createChatRegexPreset,
  createChatRegexRule,
} from "../../types/chatRegex";
import { convertFromSillyTavern, convertMultipleFromSillyTavern } from "../../utils/chatRegexUtils";
import { customMessage } from "@/utils/customMessage";
import ChatRegexRuleForm from "./ChatRegexRuleForm.vue";

interface Props {
  modelValue?: ChatRegexConfig;
}

interface Emits {
  (e: "update:modelValue", value: ChatRegexConfig): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => createDefaultChatRegexConfig(),
});
const emit = defineEmits<Emits>();

// 本地配置副本
const localConfig = ref<ChatRegexConfig>(
  defaultsDeep(cloneDeep(props.modelValue), createDefaultChatRegexConfig())
);

// 监听外部变化
watch(
  () => props.modelValue,
  (newVal) => {
    const newConfig = defaultsDeep(cloneDeep(newVal), createDefaultChatRegexConfig());
    // 避免因内部更新触发的不必要循环
    if (JSON.stringify(newConfig) !== JSON.stringify(localConfig.value)) {
      localConfig.value = newConfig;
    }
  },
  { deep: true }
);

// UI 状态
const expandedPresets = ref<string[]>([]);
const selectedPreset = ref<ChatRegexPreset | null>(null);
const selectedRule = ref<ChatRegexRule | null>(null);
const isImportDialogVisible = ref(false);
const importJson = ref("");
const importMode = ref<"sillytavern" | "json">("json");

function togglePreset(presetId: string) {
  const index = expandedPresets.value.indexOf(presetId);
  if (index > -1) {
    expandedPresets.value.splice(index, 1);
  } else {
    expandedPresets.value.push(presetId);
  }
}

// 通知父组件变更
function handleChange() {
  emit("update:modelValue", JSON.parse(JSON.stringify(localConfig.value)));
}

// =====================
// 预设操作
// =====================

function addPreset() {
  const newPreset = createChatRegexPreset(`预设 ${localConfig.value.presets.length + 1}`);
  localConfig.value.presets.push(newPreset);
  expandedPresets.value.push(newPreset.id);
  handleChange();
}

function duplicatePreset(index: number) {
  const original = localConfig.value.presets[index];
  const copy = JSON.parse(JSON.stringify(original)) as ChatRegexPreset;
  copy.id = crypto.randomUUID();
  copy.name = `${original.name} (副本)`;
  copy.rules = copy.rules.map((rule) => ({
    ...rule,
    id: crypto.randomUUID(),
  }));
  localConfig.value.presets.splice(index + 1, 0, copy);
  handleChange();
}

function deletePreset(index: number) {
  localConfig.value.presets.splice(index, 1);
  handleChange();
}

function handlePresetReorder() {
  // 更新 order 字段
  localConfig.value.presets.forEach((preset, index) => {
    preset.order = index;
  });
  handleChange();
}

// =====================
// 规则操作
// =====================

function addRule(preset: ChatRegexPreset) {
  const newRule = createChatRegexRule({
    name: `规则 ${preset.rules.length + 1}`,
  });
  preset.rules.push(newRule);
  selectRule(preset, newRule);
  handleChange();
}

function deleteRule(preset: ChatRegexPreset, index: number) {
  const deletedRule = preset.rules[index];
  preset.rules.splice(index, 1);

  // 如果删除的是当前选中的规则，清空选中状态
  if (selectedRule.value?.id === deletedRule.id) {
    selectedRule.value = null;
  }
  handleChange();
}

function selectRule(preset: ChatRegexPreset, rule: ChatRegexRule) {
  selectedPreset.value = preset;
  selectedRule.value = rule;
}

function handleRuleUpdate(updatedRule: ChatRegexRule) {
  if (selectedPreset.value && selectedRule.value) {
    const ruleIndex = selectedPreset.value.rules.findIndex((r) => r.id === selectedRule.value!.id);
    if (ruleIndex !== -1) {
      selectedPreset.value.rules[ruleIndex] = updatedRule;
      selectedRule.value = updatedRule;
      handleChange();
    }
  }
}

// =====================
// 导入
// =====================

function handleImportCommand(command: string) {
  importMode.value = command as "sillytavern" | "json";
  importJson.value = "";
  isImportDialogVisible.value = true;
}

function executeImport() {
  try {
    const data = JSON.parse(importJson.value);

    if (importMode.value === "sillytavern") {
      // SillyTavern 格式
      let presets: ChatRegexPreset[];
      if (Array.isArray(data)) {
        presets = convertMultipleFromSillyTavern(data);
      } else {
        presets = [convertFromSillyTavern(data)];
      }
      localConfig.value.presets.push(...presets);
      customMessage.success(`成功导入 ${presets.length} 个预设`);
    } else {
      // 原生 JSON 格式
      if (Array.isArray(data)) {
        localConfig.value.presets.push(...data);
        customMessage.success(`成功导入 ${data.length} 个预设`);
      } else if (data.presets) {
        localConfig.value.presets.push(...data.presets);
        customMessage.success(`成功导入 ${data.presets.length} 个预设`);
      } else {
        localConfig.value.presets.push(data);
        customMessage.success("成功导入 1 个预设");
      }
    }

    handleChange();
    isImportDialogVisible.value = false;
  } catch (error) {
    customMessage.error("导入失败: JSON 格式错误");
  }
}

// =====================
// 工具函数
// =====================

function truncateRegex(regex: string, maxLength = 30): string {
  if (!regex) return "(空)";
  return regex.length > maxLength ? regex.slice(0, maxLength) + "..." : regex;
}
</script>

<style scoped>
.chat-regex-editor {
  min-height: 500px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.header-left h4 {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
}

.info-icon {
  color: var(--text-color-light);
  cursor: help;
}

.header-actions {
  display: flex;
  gap: 8px;
}

/* 预设项 */
.preset-item {
  margin-bottom: 8px;
}

.preset-header {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1;
  padding-right: 12px;
  cursor: pointer;
}

.preset-drag-handle {
  cursor: move;
  color: var(--text-color-light);
}

.preset-name {
  font-weight: 500;
  flex: 1;
}

.preset-actions {
  margin-left: auto;
  display: flex;
  gap: 4px;
}

.preset-content {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.preset-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 规则区域 */
.rules-section {
  display: flex;
  flex-direction: column;
  height: 500px; /* 固定高度以支持滚动 */
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.rules-container {
  display: flex;
  height: 100%;
}

/* 左侧列表 */
.rules-sidebar {
  width: 280px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-color);
  background-color: var(--bg-color-soft);
}

.rules-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--card-bg);
}

.rules-title {
  font-weight: 500;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.rules-list-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.rules-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.rule-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s;
}

.rule-item:hover {
  background-color: var(--hover-bg-color);
}

.rule-item.is-selected {
  background-color: var(--card-bg);
  border-color: var(--primary-color);
  box-shadow: var(--el-box-shadow-light);
}

.rule-item-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  overflow: hidden;
}

.rule-item-header {
  display: flex;
  align-items: center;
  gap: 6px;
}

.rule-drag-handle {
  cursor: move;
  color: var(--text-color-light);
  font-size: 14px;
}

.rule-name {
  flex: 1;
  font-weight: 500;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.rule-preview {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-color-light);
  background-color: var(--bg-color);
  padding: 2px 4px;
  border-radius: 3px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: block;
}

.rule-actions {
  opacity: 0;
  transition: opacity 0.2s;
}

.rule-item:hover .rule-actions,
.rule-item.is-selected .rule-actions {
  opacity: 1;
}

.empty-rules {
  display: flex;
  justify-content: center;
  padding: 20px 0;
  font-size: 12px;
}

/* 右侧编辑区 */
.rules-editor-panel {
  flex: 1;
  background-color: var(--card-bg);
  overflow-y: auto;
  position: relative;
}

.editor-wrapper {
  padding: 16px;
}

.editor-placeholder {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-color-light);
  gap: 12px;
}

.placeholder-icon {
  opacity: 0.5;
}

/* 拖拽效果 */
.drag-ghost {
  opacity: 0.5;
  background: var(--primary-color-alpha);
}
</style>
