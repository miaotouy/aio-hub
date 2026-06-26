<script setup lang="ts">
import { computed, ref } from "vue";
import { VueDraggableNext } from "vue-draggable-next";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import BaseDialog from "@/components/common/BaseDialog.vue";
import type { AgentIntegrationConfig, MediaTaskType } from "../types";
import type { LlmModelInfo, LlmProfile } from "@/types/llm-profiles";
import {
  Bot,
  FileText,
  GripVertical,
  Image,
  Mic,
  Music,
  Video,
  Zap,
  Sliders,
  Settings,
  ChevronRight,
} from "lucide-vue-next";

const props = defineProps<{
  config: AgentIntegrationConfig;
}>();

const emit = defineEmits<{
  (e: "update", value: AgentIntegrationConfig): void;
}>();

const { enabledProfiles } = useLlmProfiles();
const activeEditingModel = ref<UniqueModel | null>(null);
const isDetailDialogVisible = ref(false);

function openDetailDialog(model: UniqueModel) {
  activeEditingModel.value = model;
  isDetailDialogVisible.value = true;
}

interface UniqueModel {
  id: string;
  name: string;
  supportedTypes: MediaTaskType[];
  profiles: {
    profile: LlmProfile;
    model: LlmModelInfo;
  }[];
}

function getSupportedTypes(model: LlmModelInfo): MediaTaskType[] {
  const caps = model.capabilities;
  const types: MediaTaskType[] = [];
  if (caps?.imageGeneration) types.push("image");
  if (caps?.videoGeneration) types.push("video");
  if (caps?.audioGeneration) types.push("speech");
  if (caps?.musicGeneration) types.push("music");
  return types;
}

function cloneConfig(
  patch: Partial<AgentIntegrationConfig>
): AgentIntegrationConfig {
  return {
    visibilityMode: props.config.visibilityMode,
    blacklistModelIds: [...props.config.blacklistModelIds],
    whitelistModelIds: [...props.config.whitelistModelIds],
    fastModelIds: [...props.config.fastModelIds],
    profilePriority: [...props.config.profilePriority],
    modelParamNotes: { ...props.config.modelParamNotes },
    ...patch,
  };
}

function updateConfig(patch: Partial<AgentIntegrationConfig>) {
  emit("update", cloneConfig(patch));
}

// 1. 获取所有渠道去重后的可用模型列表
const uniqueModels = computed<UniqueModel[]>(() => {
  const modelMap = new Map<string, UniqueModel>();

  for (const profile of enabledProfiles.value) {
    for (const model of profile.models) {
      const supportedTypes = getSupportedTypes(model);
      if (supportedTypes.length === 0) continue;

      if (!modelMap.has(model.id)) {
        modelMap.set(model.id, {
          id: model.id,
          name: model.name || model.id,
          supportedTypes,
          profiles: [],
        });
      }

      modelMap.get(model.id)!.profiles.push({ profile, model });
    }
  }

  return Array.from(modelMap.values());
});

// 2. 统一勾选语义：选中的模型即为 Agent 可见模型
const selectedModelIds = computed({
  get: () => {
    if (props.config.visibilityMode === "whitelist") {
      return props.config.whitelistModelIds;
    }
    // 黑名单模式下，可见的模型 = 所有可用模型 - 黑名单模型
    return uniqueModels.value
      .filter((m) => !props.config.blacklistModelIds.includes(m.id))
      .map((m) => m.id);
  },
  set: (val: string[]) => {
    if (props.config.visibilityMode === "whitelist") {
      updateConfig({ whitelistModelIds: val });
    } else {
      // 黑名单模式下，黑名单 = 所有可用模型 - 选中的模型
      const blacklist = uniqueModels.value
        .filter((m) => !val.includes(m.id))
        .map((m) => m.id);
      updateConfig({ blacklistModelIds: blacklist });
    }
  },
});

// 3. 当前可见的模型列表（用于下方卡片展示）
const visibleModels = computed<UniqueModel[]>(() => {
  return uniqueModels.value.filter((m) => {
    if (props.config.visibilityMode === "whitelist") {
      return props.config.whitelistModelIds.includes(m.id);
    }
    return !props.config.blacklistModelIds.includes(m.id);
  });
});

// 4. 获取每个模型排序后的渠道列表
function getSortedProfilesForModel(model: UniqueModel) {
  const priority = props.config.profilePriority;
  return [...model.profiles].sort((a, b) => {
    const ai = priority.indexOf(a.profile.id);
    const bi = priority.indexOf(b.profile.id);
    const ar = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const br = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    if (ar !== br) return ar - br;
    return (
      enabledProfiles.value.findIndex((p) => p.id === a.profile.id) -
      enabledProfiles.value.findIndex((p) => p.id === b.profile.id)
    );
  });
}

// 5. 处理模型内部渠道拖拽排序，更新全局 profilePriority
function handleProfilesReorder(newProfiles: any[]) {
  const reorderedProfileIds = newProfiles.map((p) => p.profile.id);
  const currentPriority = [...props.config.profilePriority];
  const reorderedSet = new Set(reorderedProfileIds);

  const newPriority: string[] = [];
  for (const pid of currentPriority) {
    if (!reorderedSet.has(pid)) {
      newPriority.push(pid);
    }
  }

  let insertIndex = currentPriority.findIndex((pid) => reorderedSet.has(pid));
  if (insertIndex === -1) {
    insertIndex = 0;
  }

  newPriority.splice(insertIndex, 0, ...reorderedProfileIds);
  updateConfig({ profilePriority: newPriority });
}

function setVisibilityMode(value: AgentIntegrationConfig["visibilityMode"]) {
  updateConfig({ visibilityMode: value });
}

function setFastModel(modelId: string, enabled: boolean) {
  const next = new Set(props.config.fastModelIds);
  if (enabled) next.add(modelId);
  else next.delete(modelId);
  updateConfig({ fastModelIds: Array.from(next) });
}

function updateNote(modelId: string, value: string) {
  const modelParamNotes = { ...props.config.modelParamNotes };
  if (value.trim()) modelParamNotes[modelId] = value;
  else delete modelParamNotes[modelId];
  updateConfig({ modelParamNotes });
}

function typeLabel(type: MediaTaskType): string {
  if (type === "image") return "图片";
  if (type === "video") return "视频";
  if (type === "speech") return "语音";
  return "音乐";
}

function typeIcon(type: MediaTaskType) {
  if (type === "image") return Image;
  if (type === "video") return Video;
  if (type === "speech") return Mic;
  return Music;
}
</script>

<template>
  <div class="agent-settings">
    <!-- 顶部控制区 -->
    <div class="control-panel">
      <div class="mode-row">
        <div class="mode-label">
          <el-icon><Bot /></el-icon>
          <span>可见性模式</span>
        </div>
        <el-segmented
          :model-value="config.visibilityMode"
          :options="[
            { label: '自动发现 (黑名单)', value: 'blacklist' },
            { label: '仅白名单', value: 'whitelist' },
          ]"
          size="small"
          @update:model-value="
            (value: string | number | boolean) =>
              setVisibilityMode(
                value as AgentIntegrationConfig['visibilityMode']
              )
          "
        />
      </div>

      <div class="select-row">
        <div class="select-label">
          <span>Agent 可见模型</span>
          <span class="select-hint">
            {{
              config.visibilityMode === "whitelist"
                ? "只有选中的模型会暴露给 Agent"
                : "未选中的模型将被屏蔽"
            }}
          </span>
        </div>
        <el-select
          v-model="selectedModelIds"
          multiple
          filterable
          collapse-tags
          :max-collapse-tags="3"
          collapse-tags-tooltip
          placeholder="选择允许 Agent 调用的模型..."
          style="width: 100%"
        >
          <el-option
            v-for="model in uniqueModels"
            :key="model.id"
            :label="model.name"
            :value="model.id"
          >
            <div class="model-option">
              <span class="option-name">{{ model.name }}</span>
              <span class="option-id">{{ model.id }}</span>
            </div>
          </el-option>
        </el-select>
      </div>
    </div>

    <!-- 空状态 -->
    <el-empty
      v-if="uniqueModels.length === 0"
      description="当前没有配置任何生成能力模型"
    />

    <!-- 模型配置与渠道优先级列表 -->
    <div v-else class="settings-content">
      <div class="section-heading">
        <el-icon><Sliders /></el-icon>
        <span>模型配置与渠道优先级</span>
        <span class="section-hint">拖拽渠道行可调整同名模型的路由优先级</span>
      </div>

      <div v-if="visibleModels.length === 0" class="empty-visible">
        <p>没有可见的模型。请在上方选择模型以进行配置。</p>
      </div>

      <div v-else class="model-cards">
        <div v-for="model in visibleModels" :key="model.id" class="model-card">
          <!-- 卡片头部：模型基本信息与控制 -->
          <div class="card-header">
            <div class="model-info">
              <div class="model-name-row">
                <span class="model-name">{{ model.name }}</span>
                <span class="model-id">{{ model.id }}</span>
              </div>
              <div class="type-tags">
                <el-tag
                  v-for="type in model.supportedTypes"
                  :key="type"
                  size="small"
                  effect="plain"
                >
                  <el-icon><component :is="typeIcon(type)" /></el-icon>
                  <span>{{ typeLabel(type) }}</span>
                </el-tag>
              </div>
            </div>

            <div class="model-controls">
              <el-tooltip
                content="启用同步等待结果，适合几秒内完成的模型"
                placement="top"
              >
                <div class="fast-toggle">
                  <Zap :size="14" />
                  <el-switch
                    :model-value="config.fastModelIds.includes(model.id)"
                    size="small"
                    @update:model-value="
                      (value: string | number | boolean) =>
                        setFastModel(model.id, Boolean(value))
                    "
                  />
                </div>
              </el-tooltip>

              <el-tooltip
                v-if="config.modelParamNotes[model.id]"
                content="已配置参数说明"
                placement="top"
              >
                <div class="note-badge">
                  <FileText :size="14" class="note-icon" />
                </div>
              </el-tooltip>

              <el-tooltip content="配置渠道与参数" placement="top">
                <el-button
                  :icon="Settings"
                  circle
                  text
                  size="small"
                  @click="openDetailDialog(model)"
                />
              </el-tooltip>
            </div>
          </div>

          <!-- 卡片内容：渠道面包屑预览 -->
          <div class="card-body">
            <div class="breadcrumb-container">
              <div class="breadcrumb-title">渠道优先级：</div>
              <div class="channel-breadcrumb">
                <template
                  v-for="(item, index) in getSortedProfilesForModel(model)"
                  :key="item.profile.id"
                >
                  <div
                    class="breadcrumb-item"
                    :class="{ 'is-first': index === 0 }"
                  >
                    <span class="item-name" :title="item.profile.name">{{
                      item.profile.name
                    }}</span>
                  </div>
                  <div
                    v-if="index < getSortedProfilesForModel(model).length - 1"
                    class="breadcrumb-separator"
                  >
                    <ChevronRight :size="12" />
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情配置弹窗 -->
    <BaseDialog
      v-model="isDetailDialogVisible"
      :title="`模型配置 - ${activeEditingModel?.name || ''}`"
      width="600px"
    >
      <template #content>
        <div v-if="activeEditingModel" class="dialog-layout">
          <!-- 渠道优先级 -->
          <div class="dialog-section">
            <div class="section-title">
              <el-icon><Sliders /></el-icon>
              <span>渠道路由优先级</span>
              <span class="section-hint"
                >拖拽渠道行可调整同名模型的路由优先级</span
              >
            </div>
            <VueDraggableNext
              :model-value="getSortedProfilesForModel(activeEditingModel)"
              item-key="profile.id"
              handle=".drag-handle"
              ghost-class="drag-ghost"
              :animation="200"
              :force-fallback="true"
              :fallback-tolerance="3"
              class="dialog-channel-list"
              @update:model-value="handleProfilesReorder"
            >
              <div
                v-for="(element, index) in getSortedProfilesForModel(
                  activeEditingModel
                )"
                :key="element.profile.id"
                class="channel-row"
              >
                <div
                  class="drag-handle"
                  v-if="activeEditingModel.profiles.length > 1"
                >
                  <GripVertical :size="14" />
                </div>
                <div class="channel-info">
                  <span class="channel-name">{{ element.profile.name }}</span>
                  <span class="channel-type">{{ element.profile.type }}</span>
                </div>
                <div class="channel-badge">
                  <el-tag
                    :type="index === 0 ? 'success' : 'info'"
                    size="small"
                    effect="light"
                  >
                    {{ index === 0 ? "首选" : `备选 ${index}` }}
                  </el-tag>
                </div>
              </div>
            </VueDraggableNext>
          </div>

          <!-- 参数说明 -->
          <div class="dialog-section">
            <div class="section-title">
              <el-icon><FileText /></el-icon>
              <span>参数与提示词说明</span>
              <span class="section-hint"
                >写给 Agent 的模型参数补充说明，支持 Markdown</span
              >
            </div>
            <el-input
              :model-value="config.modelParamNotes[activeEditingModel.id] || ''"
              type="textarea"
              :rows="5"
              resize="vertical"
              placeholder="写给 Agent 的模型参数补充说明，支持 Markdown"
              @update:model-value="
                (value: string) => updateNote(activeEditingModel!.id, value)
              "
            />
          </div>
        </div>
      </template>
      <template #footer>
        <el-button type="primary" @click="isDetailDialogVisible = false"
          >确定</el-button
        >
      </template>
    </BaseDialog>
  </div>
</template>

<style scoped>
.agent-settings {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.control-panel {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
}

.mode-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.mode-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.select-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.select-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.select-hint {
  font-size: 12px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
}

.model-option {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.option-name {
  font-weight: 500;
}

.option-id {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.empty-visible {
  padding: 32px;
  text-align: center;
  color: var(--el-text-color-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
}

.model-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.model-card {
  display: flex;
  flex-direction: column;
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  overflow: hidden;
  transition:
    border-color 0.2s ease,
    box-shadow 0.2s ease;
}

.model-card:hover {
  border-color: var(--el-color-primary-light-5);
  box-shadow: var(--el-box-shadow-lighter);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 10px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  background-color: rgba(var(--el-text-color-primary-rgb), 0.01);
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  flex: 1;
}

.model-name-row {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.model-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.model-id {
  font-size: 10px;
  color: var(--el-text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.type-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.type-tags :deep(.el-tag__content) {
  display: flex;
  align-items: center;
  gap: 3px;
}

.model-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: 8px;
}

.fast-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--el-text-color-secondary);
}

.note-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background-color: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}

.note-icon {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% {
    opacity: 0.6;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.6;
  }
}

.card-body {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.breadcrumb-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.breadcrumb-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
}

.channel-breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 24px;
}

.breadcrumb-item {
  display: inline-flex;
  align-items: center;
  padding: 2px 6px;
  border-radius: 4px;
  background-color: rgba(var(--el-text-color-primary-rgb), 0.03);
  border: var(--border-width) solid var(--border-color);
  font-size: 11px;
  color: var(--el-text-color-regular);
  max-width: 120px;
}

.breadcrumb-item.is-first {
  background-color: rgba(var(--el-color-success-rgb), 0.08);
  border-color: rgba(var(--el-color-success-rgb), 0.2);
  color: var(--el-color-success);
  font-weight: 500;
}

.item-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.breadcrumb-separator {
  display: flex;
  align-items: center;
  color: var(--el-text-color-placeholder);
}

/* 弹窗布局样式 */
.dialog-layout {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.dialog-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.section-hint {
  font-size: 11px;
  font-weight: 400;
  color: var(--el-text-color-secondary);
  margin-left: 4px;
}

.dialog-channel-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
  padding-right: 4px;
}

.channel-row {
  display: flex;
  align-items: center;
  padding: 8px 10px;
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  background-color: rgba(var(--el-text-color-primary-rgb), 0.01);
  transition: background-color 0.2s ease;
}

.channel-row:hover {
  background-color: rgba(var(--el-text-color-primary-rgb), 0.03);
}

.drag-handle {
  display: flex;
  align-items: center;
  color: var(--el-text-color-secondary);
  cursor: grab;
  margin-right: 6px;
}

.drag-handle:active {
  cursor: grabbing;
}

.channel-info {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.channel-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.channel-type {
  font-size: 10px;
  color: var(--el-text-color-secondary);
}

.channel-badge {
  margin-left: 8px;
}

.drag-ghost {
  opacity: 0.5;
  border-style: dashed;
  border-color: var(--el-color-primary);
}

@media (max-width: 480px) {
  .mode-row {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .model-cards {
    grid-template-columns: 1fr;
  }
}
</style>
