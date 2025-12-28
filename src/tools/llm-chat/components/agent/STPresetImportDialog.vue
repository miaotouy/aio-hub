<template>
  <BaseDialog
    :model-value="props.visible"
    title="导入 SillyTavern 预设"
    width="800px"
    height="80vh"
    @update:model-value="emit('update:visible', $event)"
  >
    <div class="import-dialog-content">
      <!-- 消息选择区域 -->
      <div class="section">
        <div class="section-header">
          <span class="section-title">预设消息</span>
          <div class="section-actions">
            <el-button size="small" link @click="selectAll">全选</el-button>
            <el-button size="small" link @click="selectNone">全不选</el-button>
          </div>
        </div>

        <div class="messages-list">
          <!-- 前置消息 -->
          <div v-if="systemPrompts.length > 0" class="message-group">
            <div class="group-header">
              <el-checkbox
                v-model="selectAllSystem"
                :indeterminate="isSystemIndeterminate"
                @change="toggleSystemAll"
              >
                前置消息 ({{ selectedSystemCount }}/{{ systemPrompts.length }})
              </el-checkbox>
              <el-tag size="small" type="info">在聊天历史之前</el-tag>
            </div>
            <div class="group-items">
              <div
                v-for="(item, index) in systemPrompts"
                :key="'system-' + index"
                v-memo="[item.selected, item.enabled, item.message.content]"
                class="message-item"
                :class="{ selected: item.selected }"
              >
                <el-checkbox v-model="item.selected" />
                <el-tag :type="getRoleTagType(item.message.role)" size="small" effect="plain">
                  {{ getRoleLabel(item.message.role) }}
                </el-tag>
                <span class="message-preview">{{ truncateText(item.message.content, 80) }}</span>
                <el-switch
                  v-model="item.enabled"
                  size="small"
                  :disabled="!item.selected"
                  title="导入后是否启用"
                />
              </div>
            </div>
          </div>

          <!-- 注入消息 -->
          <div v-if="injectionPrompts.length > 0" class="message-group">
            <div class="group-header">
              <el-checkbox
                v-model="selectAllInjection"
                :indeterminate="isInjectionIndeterminate"
                @change="toggleInjectionAll"
              >
                注入消息 ({{ selectedInjectionCount }}/{{ injectionPrompts.length }})
              </el-checkbox>
              <el-tag size="small" type="warning">在聊天历史之后</el-tag>
            </div>
            <div class="group-items">
              <div
                v-for="(item, index) in injectionPrompts"
                :key="'injection-' + index"
                v-memo="[item.selected, item.enabled, item.message.content]"
                class="message-item"
                :class="{ selected: item.selected }"
              >
                <el-checkbox v-model="item.selected" />
                <el-tag :type="getRoleTagType(item.message.role)" size="small" effect="plain">
                  {{ getRoleLabel(item.message.role) }}
                </el-tag>
                <span
                  v-if="item.message.injectionStrategy?.depth !== undefined"
                  class="injection-badge"
                >
                  📍{{ item.message.injectionStrategy.depth }}
                </span>
                <span class="message-preview">{{ truncateText(item.message.content, 80) }}</span>
                <el-switch
                  v-model="item.enabled"
                  size="small"
                  :disabled="!item.selected"
                  title="导入后是否启用"
                />
              </div>
            </div>
          </div>

          <!-- 未排序消息（不在 order 配置中的消息） -->
          <div v-if="unorderedPrompts.length > 0" class="message-group">
            <div class="group-header">
              <el-checkbox
                v-model="selectAllUnordered"
                :indeterminate="isUnorderedIndeterminate"
                @change="toggleUnorderedAll"
              >
                其他消息 ({{ selectedUnorderedCount }}/{{ unorderedPrompts.length }})
              </el-checkbox>
              <el-tag size="small" type="danger">未在排序中配置</el-tag>
            </div>
            <div class="group-items">
              <div
                v-for="(item, index) in unorderedPrompts"
                :key="'unordered-' + index"
                v-memo="[item.selected, item.enabled, item.message.content]"
                class="message-item"
                :class="{ selected: item.selected }"
              >
                <el-checkbox v-model="item.selected" />
                <el-tag :type="getRoleTagType(item.message.role)" size="small" effect="plain">
                  {{ getRoleLabel(item.message.role) }}
                </el-tag>
                <span v-if="item.message.metadata?.stPromptName" class="prompt-name">
                  {{ item.message.metadata.stPromptName }}
                </span>
                <span class="message-preview">{{ truncateText(item.message.content, 60) }}</span>
                <el-switch
                  v-model="item.enabled"
                  size="small"
                  :disabled="!item.selected"
                  title="导入后是否启用"
                />
              </div>
            </div>
          </div>

          <!-- 空状态 -->
          <el-empty
            v-if="
              systemPrompts.length === 0 &&
              injectionPrompts.length === 0 &&
              unorderedPrompts.length === 0
            "
            description="预设文件中没有可导入的消息"
          />
        </div>
      </div>

      <!-- 参数选择区域 -->
      <div v-if="hasParameters" class="section">
        <div class="section-header">
          <el-checkbox
            v-model="allParametersSelected"
            :indeterminate="isParametersIndeterminate"
            @change="toggleAllParameters"
          >
            <span class="section-title">
              导入模型参数 ({{ selectedParametersCount }}/{{ selectableParameters.length }})
            </span>
          </el-checkbox>
        </div>
        <div class="parameters-list">
          <el-checkbox
            v-for="param in selectableParameters"
            :key="param.key"
            v-model="param.selected"
            class="param-item"
          >
            <span class="param-key">{{ param.key }}:</span>
            <span class="param-value">{{ param.value }}</span>
          </el-checkbox>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <span class="selected-count">
          已选择 {{ totalSelectedCount }} 条消息
          <span v-if="selectedParametersCount > 0"> 和 {{ selectedParametersCount }} 个参数 </span>
        </span>
        <div class="footer-actions">
          <el-button @click="emit('update:visible', false)">取消</el-button>
          <el-button
            type="primary"
            :disabled="totalSelectedCount === 0 && selectedParametersCount === 0"
            @click="handleConfirm"
          >
            确认导入
          </el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { ChatMessageNode, MessageRole } from "../../types";
import type { ParsedPromptFile } from "../../services/sillyTavernParser";

interface SelectableMessage {
  message: ChatMessageNode;
  selected: boolean;
  enabled: boolean;
}

interface SelectableParameter {
  key: string;
  value: any;
  selected: boolean;
}

interface Props {
  visible: boolean;
  parsedResult: ParsedPromptFile;
}

interface Emits {
  (e: "update:visible", value: boolean): void;
  (
    e: "confirm",
    data: {
      systemPrompts: ChatMessageNode[];
      injectionPrompts: ChatMessageNode[];
      unorderedPrompts: ChatMessageNode[];
      parameters: Record<string, any>;
    }
  ): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 可选择的消息列表
const systemPrompts = ref<SelectableMessage[]>([]);
const injectionPrompts = ref<SelectableMessage[]>([]);
const unorderedPrompts = ref<SelectableMessage[]>([]);
const selectableParameters = ref<SelectableParameter[]>([]);

// 监听 parsedResult 变化，初始化选择状态
watch(
  () => props.parsedResult,
  (result) => {
    if (result) {
      systemPrompts.value = result.systemPrompts.map((msg) => ({
        message: msg,
        selected: msg.isEnabled !== false, // 默认选中启用的消息
        enabled: msg.isEnabled !== false,
      }));
      injectionPrompts.value = result.injectionPrompts.map((msg) => ({
        message: msg,
        selected: msg.isEnabled !== false,
        enabled: msg.isEnabled !== false,
      }));
      unorderedPrompts.value = (result.unorderedPrompts || []).map((msg) => ({
        message: msg,
        selected: false, // 未排序消息默认不选中
        enabled: false,
      }));
      selectableParameters.value = Object.entries(result.parameters || {}).map(([key, value]) => ({
        key,
        value,
        selected: false, // 参数默认不选中
      }));
    }
  },
  { immediate: true }
);

// 计算属性
const hasParameters = computed(() => selectableParameters.value.length > 0);

const selectedSystemCount = computed(() => systemPrompts.value.filter((m) => m.selected).length);
const selectedInjectionCount = computed(
  () => injectionPrompts.value.filter((m) => m.selected).length
);
const selectedUnorderedCount = computed(
  () => unorderedPrompts.value.filter((m) => m.selected).length
);
const totalSelectedCount = computed(
  () => selectedSystemCount.value + selectedInjectionCount.value + selectedUnorderedCount.value
);

const selectAllSystem = computed({
  get: () => systemPrompts.value.length > 0 && systemPrompts.value.every((m) => m.selected),
  set: () => {},
});
const isSystemIndeterminate = computed(
  () => systemPrompts.value.some((m) => m.selected) && !systemPrompts.value.every((m) => m.selected)
);

const selectAllInjection = computed({
  get: () => injectionPrompts.value.length > 0 && injectionPrompts.value.every((m) => m.selected),
  set: () => {},
});
const isInjectionIndeterminate = computed(
  () =>
    injectionPrompts.value.some((m) => m.selected) &&
    !injectionPrompts.value.every((m) => m.selected)
);

const selectAllUnordered = computed({
  get: () => unorderedPrompts.value.length > 0 && unorderedPrompts.value.every((m) => m.selected),
  set: () => {},
});
const isUnorderedIndeterminate = computed(
  () =>
    unorderedPrompts.value.some((m) => m.selected) &&
    !unorderedPrompts.value.every((m) => m.selected)
);

// 参数选择相关计算属性
const selectedParametersCount = computed(
  () => selectableParameters.value.filter((p) => p.selected).length
);
const allParametersSelected = computed({
  get: () =>
    selectableParameters.value.length > 0 && selectableParameters.value.every((p) => p.selected),
  set: (value) => toggleAllParameters(value),
});
const isParametersIndeterminate = computed(
  () =>
    selectedParametersCount.value > 0 &&
    selectedParametersCount.value < selectableParameters.value.length
);

// 方法
function selectAll() {
  systemPrompts.value.forEach((m) => (m.selected = true));
  injectionPrompts.value.forEach((m) => (m.selected = true));
  unorderedPrompts.value.forEach((m) => (m.selected = true));
}

function selectNone() {
  systemPrompts.value.forEach((m) => (m.selected = false));
  injectionPrompts.value.forEach((m) => (m.selected = false));
  unorderedPrompts.value.forEach((m) => (m.selected = false));
}

function toggleSystemAll(val: boolean) {
  systemPrompts.value.forEach((m) => (m.selected = val));
}

function toggleInjectionAll(val: boolean) {
  injectionPrompts.value.forEach((m) => (m.selected = val));
}

function toggleUnorderedAll(val: boolean) {
  unorderedPrompts.value.forEach((m) => (m.selected = val));
}

function toggleAllParameters(val: boolean) {
  selectableParameters.value.forEach((p) => (p.selected = val));
}

function getRoleTagType(role: MessageRole): "success" | "primary" | "info" {
  const typeMap: Record<MessageRole, "success" | "primary" | "info"> = {
    system: "info",
    user: "primary",
    assistant: "success",
  };
  return typeMap[role];
}

function getRoleLabel(role: MessageRole): string {
  const labelMap: Record<MessageRole, string> = {
    system: "System",
    user: "User",
    assistant: "Assistant",
  };
  return labelMap[role];
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

function handleConfirm() {
  const selectedSystem = systemPrompts.value
    .filter((m) => m.selected)
    .map((m) => ({
      ...m.message,
      isEnabled: m.enabled,
    }));

  const selectedInjection = injectionPrompts.value
    .filter((m) => m.selected)
    .map((m) => ({
      ...m.message,
      isEnabled: m.enabled,
    }));

  const selectedUnordered = unorderedPrompts.value
    .filter((m) => m.selected)
    .map((m) => ({
      ...m.message,
      isEnabled: m.enabled,
    }));

  const parameters = selectableParameters.value
    .filter((p) => p.selected)
    .reduce(
      (obj, p) => {
        obj[p.key] = p.value;
        return obj;
      },
      {} as Record<string, any>
    );

  emit("confirm", {
    systemPrompts: selectedSystem,
    injectionPrompts: selectedInjection,
    unorderedPrompts: selectedUnordered,
    parameters,
  });
}
</script>

<style scoped>
.import-dialog-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  overflow: hidden;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.section:first-child {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
}

.section-title {
  font-weight: 600;
  font-size: 14px;
}

.section-actions {
  display: flex;
  gap: 8px;
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-right: 8px;
}

.message-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.group-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-left: 24px;
}

.message-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;
}

.message-item:hover {
  border-color: var(--el-color-primary-light-5);
}

.message-item.selected {
  background: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
  border-color: var(--el-color-primary-light-5);
}

.message-preview {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.injection-badge {
  font-size: 12px;
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.prompt-name {
  font-size: 12px;
  color: var(--el-color-info);
  background: var(--el-fill-color-light);
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}

.parameters-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-fill-color-lighter);
  border-radius: 6px;
  max-height: 160px;
  overflow-y: auto;
}

.param-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.param-key {
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.param-value {
  color: var(--el-text-color-secondary);
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.dialog-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.selected-count {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.footer-actions {
  display: flex;
  gap: 8px;
}
</style>
