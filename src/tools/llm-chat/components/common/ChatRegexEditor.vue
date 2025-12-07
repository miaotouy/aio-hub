<template>
  <div class="chat-regex-editor" ref="containerRef" :class="{ 'is-compact': isMobile }">
    <!-- 顶部操作栏 -->
    <div class="editor-header">
      <div class="header-left">
        <h4>文本替换规则</h4>
        <el-tooltip content="用于对消息内容进行动态清洗、格式转换等" placement="right">
          <el-icon class="info-icon"><InfoIcon /></el-icon>
        </el-tooltip>
      </div>
      <div class="header-actions">
        <el-button @click="addPreset" size="small" :icon="Plus"> 新建预设 </el-button>
        <el-button @click="pastePreset" size="small" :icon="ClipboardPaste"> 粘贴预设 </el-button>
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
        <el-button @click="exportAllPresets" size="small" :icon="FileJson"> 导出全部 </el-button>
      </div>
    </div>

    <!-- 预设列表 (一级层级) -->
    <div
      class="presets-container"
      v-if="props.modelValue.presets && props.modelValue.presets.length > 0"
    >
      <el-collapse v-model="expandedPresets">
        <div>
          <VueDraggableNext
            v-model="presetsForDraggable"
            item-key="id"
            handle=".preset-drag-handle"
            ghost-class="drag-ghost"
            drag-class="sortable-drag"
            :animation="200"
            :force-fallback="true"
            :fallback-tolerance="3"
          >
            <div v-for="(preset, index) in presetsForDraggable" :key="preset.id">
              <el-collapse-item :name="preset.id" class="preset-item">
                <template #title>
                  <div class="preset-header" @click.stop="togglePreset(preset.id)">
                    <el-icon class="preset-drag-handle" @click.stop><GripVertical /></el-icon>
                    <el-switch
                      :model-value="preset.enabled"
                      size="small"
                      @update:model-value="updatePresetField(index, 'enabled', $event)"
                      @click.stop
                    />
                    <span class="preset-name">{{ preset.name }}</span>
                    <el-tag size="small" type="info"> {{ preset.rules.length }} 条规则 </el-tag>
                    <div class="preset-actions">
                      <el-button
                        @click.stop="copyPresetToClipboard(preset)"
                        :icon="Copy"
                        size="small"
                        text
                        title="复制预设到剪贴板"
                      />
                      <el-button
                        @click.stop="exportPreset(preset)"
                        :icon="FileJson"
                        size="small"
                        text
                        title="导出预设文件"
                      />
                      <el-popconfirm
                        title="确定要删除这个预设吗？"
                        @confirm="deletePreset(index)"
                        width="200"
                      >
                        <template #reference>
                          <el-button
                            @click.stop
                            :icon="Trash2"
                            size="small"
                            text
                            type="danger"
                            title="删除预设"
                          />
                        </template>
                      </el-popconfirm>
                    </div>
                  </div>
                </template>

                <!-- 预设详情 (二级层级) -->
                <div class="preset-content">
                  <!-- 预设基本信息 -->
                  <div class="preset-info">
                    <el-input
                      :model-value="preset.name"
                      @update:model-value="updatePresetField(index, 'name', $event)"
                      placeholder="预设名称"
                      size="small"
                    >
                      <template #prepend>名称</template>
                    </el-input>
                    <el-input
                      :model-value="preset.description"
                      @update:model-value="updatePresetField(index, 'description', $event)"
                      placeholder="预设描述（可选）"
                      size="small"
                    >
                      <template #prepend>描述</template>
                    </el-input>
                  </div>

                  <!-- 规则列表 -->
                  <!-- 规则区域 (左右分栏布局) -->
                  <div class="rules-section">
                    <div
                      class="rules-container"
                      :class="{ 'is-mobile': isMobile, 'show-editor': showMobileEditor }"
                    >
                      <!-- 左侧：规则列表 -->
                      <div class="rules-sidebar">
                        <div class="rules-header">
                          <span class="rules-title">规则列表</span>
                          <div class="rules-header-actions">
                            <el-button
                              @click="pasteRule(index)"
                              size="small"
                              :icon="ClipboardPaste"
                              text
                              circle
                              title="粘贴规则"
                            />
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
                        </div>

                        <div class="rules-list-scroll">
                          <div class="rules-list" v-if="preset.rules.length > 0">
                            <VueDraggableNext
                              :model-value="preset.rules"
                              @update:model-value="updateRulesOrder(index, $event)"
                              item-key="id"
                              handle=".rule-drag-handle"
                              ghost-class="drag-ghost"
                              drag-class="sortable-drag"
                              :animation="200"
                              :force-fallback="true"
                              :fallback-tolerance="3"
                            >
                              <div
                                v-for="(rule, ruleIndex) in preset.rules"
                                :key="rule.id"
                                class="rule-item"
                                :class="{ 'is-selected': selectedRule?.id === rule.id }"
                                @click="selectRule(preset, rule)"
                              >
                                <div class="rule-item-main">
                                  <div class="rule-item-header">
                                    <el-icon class="rule-drag-handle"><GripVertical /></el-icon>
                                    <span class="rule-name">{{ rule.name || "未命名规则" }}</span>
                                    <div
                                      @click.stop
                                      style="display: flex; align-items: center; gap: 4px"
                                    >
                                      <el-switch
                                        :model-value="rule.enabled"
                                        @update:model-value="
                                          updateRuleField(index, ruleIndex, 'enabled', $event)
                                        "
                                        size="small"
                                      />
                                      <el-button
                                        @click="copyRuleToClipboard(rule)"
                                        :icon="Copy"
                                        size="small"
                                        text
                                        circle
                                        title="复制规则"
                                      />
                                      <el-popconfirm
                                        title="确定要删除这条规则吗？"
                                        @confirm="deleteRule(index, ruleIndex)"
                                        width="200"
                                      >
                                        <template #reference>
                                          <el-button
                                            :icon="Trash2"
                                            size="small"
                                            text
                                            circle
                                            type="danger"
                                            title="删除规则"
                                          />
                                        </template>
                                      </el-popconfirm>
                                    </div>
                                  </div>
                                  <code class="rule-preview">{{ truncateRegex(rule.regex) }}</code>
                                </div>
                              </div>
                            </VueDraggableNext>
                          </div>
                          <div v-else class="empty-rules">
                            <span class="text-muted">暂无规则，点击上方 + 添加</span>
                          </div>
                        </div>
                      </div>

                      <!-- 右侧：规则编辑 -->
                      <div class="rules-editor-panel">
                        <!-- 移动端返回按钮 -->
                        <div v-if="isMobile" class="mobile-editor-header">
                          <el-button link @click="backToRuleList" :icon="ArrowLeft">
                            返回列表
                          </el-button>
                          <span class="mobile-title">编辑规则</span>
                        </div>

                        <div
                          v-if="selectedPreset?.id === preset.id && selectedRule"
                          class="editor-wrapper"
                        >
                          <ChatRegexRuleForm
                            :model-value="selectedRule"
                            @update:model-value="handleRuleUpdate(index, $event)"
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
          </VueDraggableNext>
        </div>
      </el-collapse>
    </div>
    <el-empty v-else description="暂无文本替换规则" :image-size="80">
      <el-button @click="addPreset" type="primary">创建预设</el-button>
    </el-empty>
    <!-- 导入对话框 -->
    <el-dialog v-model="isImportDialogVisible" title="导入规则脚本" width="600px">
      <el-input v-model="importJson" type="textarea" :rows="12" placeholder="粘贴 JSON 内容..." />
      <template #footer>
        <el-button @click="isImportDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="executeImport">导入</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { VueDraggableNext } from "vue-draggable-next";
import { useElementSize } from "@vueuse/core";
import { defaultsDeep } from "lodash-es";
import {
  Plus,
  Download,
  ChevronDown,
  GripVertical,
  Copy,
  Trash2,
  Info as InfoIcon,
  ArrowLeft,
  ClipboardPaste,
  FileJson,
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

// UI 状态
const expandedPresets = ref<string[]>([]);
const selectedPreset = ref<ChatRegexPreset | null>(null);
const selectedRule = ref<ChatRegexRule | null>(null);
const isImportDialogVisible = ref(false);
const importJson = ref("");
const importMode = ref<"sillytavern" | "json">("json");

// 响应式布局状态
const containerRef = ref<HTMLElement | null>(null);
const { width: containerWidth } = useElementSize(containerRef);
const isMobile = computed(() => containerWidth.value < 768);
const showMobileEditor = ref(false);

// 当从宽屏切换到窄屏时，如果已选中规则，自动显示编辑器
watch(isMobile, (mobile) => {
  if (mobile && selectedRule.value) {
    showMobileEditor.value = true;
  } else if (!mobile) {
    showMobileEditor.value = false;
  }
});

// 确保 modelValue 始终有 presets 数组
const presets = computed(() => {
  const config = defaultsDeep(props.modelValue, createDefaultChatRegexConfig());
  return config.presets;
});

// 为 vuedraggable 创建计算属性代理
const presetsForDraggable = computed({
  get: () => presets.value,
  set: (newPresets: ChatRegexPreset[]) => {
    const reorderedPresets = newPresets.map((p, i) => ({ ...p, order: i }));
    emit("update:modelValue", { ...props.modelValue, presets: reorderedPresets });
  },
});

function togglePreset(presetId: string) {
  const index = expandedPresets.value.indexOf(presetId);
  if (index > -1) {
    expandedPresets.value.splice(index, 1);
  } else {
    expandedPresets.value.push(presetId);
  }
}

// =====================
// 预设操作 (不可变)
// =====================

function addPreset() {
  const newPreset = createChatRegexPreset(`预设 ${presets.value.length + 1}`);
  const newPresets = [...presets.value, newPreset];
  emit("update:modelValue", { ...props.modelValue, presets: newPresets });
  expandedPresets.value.push(newPreset.id);
}

async function copyPresetToClipboard(preset: ChatRegexPreset) {
  try {
    const content = JSON.stringify(preset, null, 2);
    await navigator.clipboard.writeText(content);
    customMessage.success("预设已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
    console.error(error);
  }
}

async function pastePreset() {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      customMessage.error("剪贴板内容不是有效的 JSON");
      return;
    }

    // 简单的格式检查：必须包含 id, name, rules
    if (!data || typeof data !== "object" || !Array.isArray(data.rules)) {
      customMessage.error("剪贴板内容不是有效的正则预设");
      return;
    }

    // 创建副本并重置 ID
    const newPreset = { ...data } as ChatRegexPreset;
    newPreset.id = crypto.randomUUID();
    newPreset.name = `${newPreset.name} (导入)`;
    newPreset.rules = newPreset.rules.map((rule) => ({
      ...rule,
      id: crypto.randomUUID(),
    }));

    const newPresets = [...presets.value, newPreset];
    emit("update:modelValue", { ...props.modelValue, presets: newPresets });
    expandedPresets.value.push(newPreset.id);
    customMessage.success("预设已粘贴");
  } catch (error) {
    customMessage.error("粘贴失败");
    console.error(error);
  }
}

function deletePreset(index: number) {
  const newPresets = presets.value.filter((_: ChatRegexPreset, i: number) => i !== index);
  emit("update:modelValue", { ...props.modelValue, presets: newPresets });
}

function updatePresetField<K extends keyof ChatRegexPreset>(
  presetIndex: number,
  field: K,
  value: ChatRegexPreset[K]
) {
  const newPresets = [...presets.value];
  newPresets[presetIndex] = { ...newPresets[presetIndex], [field]: value };
  emit("update:modelValue", { ...props.modelValue, presets: newPresets });
}

// =====================
// 规则操作 (不可变)
// =====================

function addRule(preset: ChatRegexPreset) {
  const presetIndex = presets.value.findIndex((p: ChatRegexPreset) => p.id === preset.id);
  if (presetIndex === -1) return;

  const newRule = createChatRegexRule({
    name: `规则 ${preset.rules.length + 1}`,
  });
  const newRules = [...preset.rules, newRule];
  updatePresetField(presetIndex, "rules", newRules);

  // 更新后需要从新的 presets 引用中选择
  const updatedPreset = presets.value[presetIndex];
  selectRule(updatedPreset, newRule);
}

async function copyRuleToClipboard(rule: ChatRegexRule) {
  try {
    const content = JSON.stringify(rule, null, 2);
    await navigator.clipboard.writeText(content);
    customMessage.success("规则已复制到剪贴板");
  } catch (error) {
    customMessage.error("复制失败");
  }
}

async function pasteRule(presetIndex: number) {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return;

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      customMessage.error("剪贴板内容不是有效的 JSON");
      return;
    }

    // 简单的格式检查：必须包含 regex, replacement
    if (!data || typeof data !== "object" || !("regex" in data) || !("replacement" in data)) {
      customMessage.error("剪贴板内容不是有效的规则");
      return;
    }

    const preset = presets.value[presetIndex];
    const newRule = { ...data } as ChatRegexRule;
    newRule.id = crypto.randomUUID();
    newRule.name = `${newRule.name || "未命名规则"} (导入)`;

    const newRules = [...preset.rules, newRule];
    updatePresetField(presetIndex, "rules", newRules);
    customMessage.success("规则已粘贴");
  } catch (error) {
    customMessage.error("粘贴失败");
    console.error(error);
  }
}

function deleteRule(presetIndex: number, ruleIndex: number) {
  const preset = presets.value[presetIndex];
  const deletedRuleId = preset.rules[ruleIndex]?.id;
  const newRules = preset.rules.filter((_: ChatRegexRule, i: number) => i !== ruleIndex);
  updatePresetField(presetIndex, "rules", newRules);

  if (selectedRule.value?.id === deletedRuleId) {
    selectedRule.value = null;
  }
}

function selectRule(preset: ChatRegexPreset, rule: ChatRegexRule) {
  selectedPreset.value = preset;
  selectedRule.value = rule;
  if (isMobile.value) {
    showMobileEditor.value = true;
  }
}

function backToRuleList() {
  showMobileEditor.value = false;
}

function handleRuleUpdate(presetIndex: number, updatedRule: ChatRegexRule) {
  const preset = presets.value[presetIndex];
  const ruleIndex = preset.rules.findIndex((r: ChatRegexRule) => r.id === updatedRule.id);
  if (ruleIndex === -1) return;

  const newRules = [...preset.rules];
  newRules[ruleIndex] = updatedRule;
  updatePresetField(presetIndex, "rules", newRules);

  // 保持选中状态
  selectedRule.value = updatedRule;
}

function updateRuleField<K extends keyof ChatRegexRule>(
  presetIndex: number,
  ruleIndex: number,
  field: K,
  value: ChatRegexRule[K]
) {
  const preset = presets.value[presetIndex];
  const rule = preset.rules[ruleIndex];
  const updatedRule = { ...rule, [field]: value };
  handleRuleUpdate(presetIndex, updatedRule);
}

function updateRulesOrder(presetIndex: number, newRules: ChatRegexRule[]) {
  updatePresetField(presetIndex, "rules", newRules);
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
    let importedPresets: ChatRegexPreset[] = [];

    if (importMode.value === "sillytavern") {
      if (Array.isArray(data)) {
        importedPresets = convertMultipleFromSillyTavern(data);
      } else {
        importedPresets = [convertFromSillyTavern(data)];
      }
    } else {
      if (Array.isArray(data)) {
        importedPresets = data;
      } else if (data.presets && Array.isArray(data.presets)) {
        importedPresets = data.presets;
      } else if (typeof data === "object" && data !== null) {
        importedPresets = [data];
      }
    }

    if (importedPresets.length > 0) {
      const newPresets = [...presets.value, ...importedPresets];
      emit("update:modelValue", { ...props.modelValue, presets: newPresets });
      customMessage.success(`成功导入 ${importedPresets.length} 个预设`);
      isImportDialogVisible.value = false;
    } else {
      customMessage.warning("未找到可导入的预设");
    }
  } catch (error) {
    customMessage.error("导入失败: JSON 格式或内容错误");
  }
}

// =====================
// 导出
// =====================

function downloadJson(data: any, filename: string) {
  try {
    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    customMessage.success(`已导出: ${filename}`);
  } catch (error) {
    console.error("导出失败", error);
    customMessage.error("导出文件失败");
  }
}

function exportAllPresets() {
  if (presets.value.length === 0) {
    customMessage.warning("没有可导出的预设");
    return;
  }
  const date = new Date().toISOString().split("T")[0];
  downloadJson(presets.value, `regex-presets-all-${date}.json`);
}

function exportPreset(preset: ChatRegexPreset) {
  const safeName = preset.name.replace(/[\\/:*?"<>|]/g, "_");
  downloadJson(preset, `regex-preset-${safeName}.json`);
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
  box-sizing: border-box;
  width: 100%;
  min-height: 400px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  flex-wrap: wrap;
  gap: 8px;
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
  flex-wrap: wrap;
}

/* 预设项 */
.preset-item {
  margin-bottom: 8px;
}

.preset-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  padding-right: 8px;
  cursor: pointer;
  min-width: 0;
}

:deep(.el-collapse-item__header) {
  height: auto !important;
  min-height: 48px;
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: normal;
}

.preset-drag-handle {
  cursor: move;
  color: var(--text-color-light);
  user-select: none;
}

.preset-name {
  font-weight: 500;
  flex: 1;
  min-width: 90px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-right: 4px;
}

.preset-actions {
  margin-left: auto;
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.preset-content {
  padding: 8px;
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
  height: 600px; /* 固定高度以支持滚动 */
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
  /* border-bottom: 1px solid var(--border-color); */
  background-color: var(--bg-color-soft);
}

.rules-title {
  font-weight: 500;
  color: var(--text-color-secondary);
  font-size: 13px;
}

.rules-header-actions {
  display: flex;
  gap: 4px;
  align-items: center;
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
  transition:
    background-color 0.2s,
    border-color 0.2s,
    box-shadow 0.2s;
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
  user-select: none;
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

.sortable-drag {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
  background-color: var(--card-bg);
  z-index: 9999;
}

.el-button {
  margin: 2px;
}

/* 响应式布局优化 */
.chat-regex-editor.is-compact .rules-container {
  position: relative;
  overflow: hidden;
}

.chat-regex-editor.is-compact .rules-sidebar {
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  z-index: 1;
  transform: translateX(0);
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.3s;
}

.chat-regex-editor.is-compact .rules-editor-panel {
  width: 100%;
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  z-index: 2;
  transform: translateX(100%);
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  background-color: var(--card-bg);
  display: flex;
  flex-direction: column;
}

.chat-regex-editor.is-compact .rules-container.show-editor .rules-sidebar {
  transform: translateX(-20%);
  opacity: 0;
  pointer-events: none;
}

.chat-regex-editor.is-compact .rules-container.show-editor .rules-editor-panel {
  transform: translateX(0);
}

.chat-regex-editor.is-compact .mobile-editor-header {
  display: flex;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  background-color: var(--bg-color-soft);
  gap: 8px;
  flex-shrink: 0;
}

.chat-regex-editor.is-compact .mobile-title {
  font-weight: 500;
  font-size: 14px;
}

/* 调整移动端下的一些内边距 */
.chat-regex-editor.is-compact .editor-wrapper {
  padding: 12px;
}
</style>
