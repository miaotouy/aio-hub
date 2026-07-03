<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <!-- 纯占位符锚点 -->
  <div
    v-if="isPurePlaceholder"
    class="message-card"
    :class="[
      compact
        ? 'message-card-compact placeholder-card-compact'
        : 'placeholder-card',
      { disabled: element.isEnabled === false },
      `placeholder-${element.type}`,
    ]"
  >
    <div class="drag-handle">
      <el-icon><Rank /></el-icon>
    </div>
    <template v-if="compact">
      <div class="role-icon">
        <el-icon :color="anchorColor"><component :is="anchorIcon" /></el-icon>
      </div>
      <div class="message-text-compact placeholder-text">
        {{ anchorDef?.name }}
      </div>
      <div class="message-actions-compact">
        <el-switch
          v-model="element.isEnabled"
          :active-value="true"
          :inactive-value="false"
          size="small"
          @change="$emit('toggle-enabled')"
        />
      </div>
    </template>
    <template v-else>
      <div class="message-content">
        <div class="message-role">
          <el-tag :type="anchorTagType" size="small" effect="plain">
            <el-icon style="margin-right: 4px"
              ><component :is="anchorIcon"
            /></el-icon>
            {{ anchorDef?.name }}
          </el-tag>
        </div>
        <div class="message-text placeholder-text">
          {{ anchorDef?.description }}
        </div>
      </div>
      <div class="message-actions">
        <el-switch
          v-model="element.isEnabled"
          :active-value="true"
          :inactive-value="false"
          size="small"
          @change="$emit('toggle-enabled')"
        />
      </div>
    </template>
  </div>

  <!-- 模板锚点 & 普通消息 - 紧凑模式 -->
  <div
    v-else-if="compact"
    class="message-card message-card-compact"
    :class="{
      disabled: element.isEnabled === false,
      'template-anchor-card-compact': isTemplateAnchor,
    }"
    @click="$emit('edit', element)"
  >
    <div class="drag-handle">
      <el-icon><Rank /></el-icon>
    </div>
    <div class="role-icon">
      <el-icon :color="roleColor"><component :is="roleIcon" /></el-icon>
    </div>
    <span
      v-if="isTemplateAnchor"
      class="injection-badge-compact"
      :title="anchorDef?.name"
      >⚓</span
    >
    <span
      v-if="injectionBadge"
      class="injection-badge-compact"
      :title="injectionBadge.title"
    >
      {{ injectionBadge.emoji }}{{ injectionBadge.label }}
    </span>
    <span
      v-if="element.modelMatch?.enabled"
      class="model-match-badge-compact"
      title="仅特定模型生效"
      >🎯</span
    >
    <span
      v-if="element.presetAttachments?.length"
      class="attachment-badge-compact"
      :title="`${element.presetAttachments.length} 个附件`"
      >📎{{ element.presetAttachments.length }}</span
    >
    <div class="message-text-compact">
      {{
        element.name
          ? truncateText(element.name, 60)
          : truncateText(element.content, 60)
      }}
    </div>
    <div v-if="tokenCount !== undefined" class="token-compact">
      {{ tokenCount }}
    </div>
    <div class="message-actions-compact" @click.stop>
      <el-tooltip content="编辑消息" placement="top" :show-after="500">
        <el-button link size="small" @click="$emit('edit', element)">
          <el-icon><Edit /></el-icon>
        </el-button>
      </el-tooltip>
      <el-radio
        v-if="getMessageGroup(element.groupId)?.selectionMode === 'radio'"
        :value="true"
        :model-value="element.isEnabled"
        size="small"
        :disabled="getMessageGroup(element.groupId)?.enabled === false"
        @change="props.onRadioChange ? props.onRadioChange(element) : null"
      />
      <el-switch
        v-else
        v-model="element.isEnabled"
        :active-value="true"
        :inactive-value="false"
        size="small"
        :disabled="getMessageGroup(element.groupId)?.enabled === false"
        @change="$emit('toggle-enabled')"
      />
    </div>
  </div>

  <!-- 模板锚点 & 普通消息 - 正常模式 -->
  <div
    v-else
    class="message-card"
    :class="{
      disabled: element.isEnabled === false,
      'template-anchor-card': isTemplateAnchor,
    }"
  >
    <div class="drag-handle">
      <el-icon><Rank /></el-icon>
    </div>
    <div class="message-content">
      <div class="message-role">
        <div class="role-tags">
          <el-tag :type="roleTagType" size="small" effect="plain">
            <el-icon style="margin-right: 4px"
              ><component :is="roleIcon"
            /></el-icon>
            {{ roleLabel }} </el-tag
          ><el-tag
            v-if="isTemplateAnchor"
            :type="anchorTagType"
            size="small"
            effect="plain"
            class="injection-tag"
          >
            <el-icon style="margin-right: 4px"
              ><component :is="anchorIcon"
            /></el-icon>
            {{ anchorDef?.name }} </el-tag
          ><el-tag
            v-if="injectionBadge?.type === 'advanced_depth'"
            size="small"
            type="warning"
            effect="plain"
            class="injection-tag"
          >
            🔩 深度 {{ element.injectionStrategy?.depthConfig }}
          </el-tag>
          <el-tag
            v-else-if="injectionBadge?.type === 'depth'"
            size="small"
            type="warning"
            effect="plain"
            class="injection-tag"
          >
            📍 深度 {{ element.injectionStrategy?.depth }}
          </el-tag>
          <el-tag
            v-else-if="injectionBadge?.type === 'anchor'"
            size="small"
            type="success"
            effect="plain"
            class="injection-tag"
          >
            ⚓ {{ element.injectionStrategy?.anchorTarget }}
            {{
              element.injectionStrategy?.anchorPosition === "before"
                ? "前"
                : "后"
            }}
          </el-tag>
          <el-tag
            v-if="element.modelMatch?.enabled"
            size="small"
            type="warning"
            effect="plain"
            class="model-match-tag"
          >
            🎯 模型限定
          </el-tag>
          <el-tag
            v-if="element.presetAttachments?.length"
            size="small"
            type="info"
            effect="plain"
            class="attachment-tag"
          >
            📎 {{ element.presetAttachments.length }} 个附件
          </el-tag>
          <el-tag
            v-if="tokenCount !== undefined"
            size="small"
            type="info"
            effect="plain"
            class="token-tag"
          >
            {{ tokenCount }} tokens
          </el-tag>
          <!-- 组标签 - 有组 -->
          <el-dropdown
            v-if="element.groupId"
            trigger="click"
            @command="(cmd: string) => emit('group-command', element, cmd)"
          >
            <el-tag size="small" style="cursor: pointer"
              >🏷️
              {{ getMessageGroup(element.groupId)?.name || "未知组" }}</el-tag
            >
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="g in presetGroups"
                  :key="g.id"
                  :command="`move:${g.id}`"
                  :disabled="g.id === element.groupId"
                  >移动到: {{ g.name }}</el-dropdown-item
                >
                <el-dropdown-item divided command="leave"
                  >脱离当前组</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <!-- 组标签 - 无组且有可用组 -->
          <el-dropdown
            v-else-if="presetGroups && presetGroups.length > 0"
            trigger="click"
            @command="(cmd: string) => emit('group-command', element, cmd)"
          >
            <el-tag
              size="small"
              type="info"
              style="cursor: pointer; opacity: 0.6"
              >+ 加入组</el-tag
            >
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="g in presetGroups"
                  :key="g.id"
                  :command="`move:${g.id}`"
                  >加入: {{ g.name }}</el-dropdown-item
                >
                <el-dropdown-item divided command="new"
                  >新建组并加入</el-dropdown-item
                >
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
        <div class="message-actions">
          <el-tooltip content="编辑消息" placement="top" :show-after="500">
            <el-button link size="small" @click="$emit('edit', element)">
              <el-icon><Edit /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="复制消息配置" placement="top" :show-after="500">
            <el-button link size="small" @click="$emit('copy', element)">
              <el-icon><CopyDocument /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip
            v-if="!isTemplateAnchor"
            content="复制到下方"
            placement="top"
            :show-after="500"
          >
            <el-button link size="small" @click="$emit('duplicate', element)">
              <el-icon><DocumentAdd /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="粘贴并覆盖" placement="top" :show-after="500">
            <span>
              <el-popconfirm
                title="确定要用剪贴板内容覆盖这条消息吗？"
                @confirm="$emit('paste', element)"
                width="220"
              >
                <template #reference>
                  <el-button link size="small"
                    ><el-icon><DocumentCopy /></el-icon
                  ></el-button>
                </template>
              </el-popconfirm>
            </span>
          </el-tooltip>
          <el-tooltip
            v-if="!isTemplateAnchor"
            content="删除消息"
            placement="top"
            :show-after="500"
          >
            <span>
              <el-popconfirm
                title="确定要删除这条预设消息吗？"
                @confirm="$emit('delete', element)"
                width="240"
              >
                <template #reference>
                  <el-button link size="small" type="danger"
                    ><el-icon><Delete /></el-icon
                  ></el-button>
                </template>
              </el-popconfirm>
            </span>
          </el-tooltip>
          <el-radio
            v-if="getMessageGroup(element.groupId)?.selectionMode === 'radio'"
            :value="true"
            :model-value="element.isEnabled"
            size="small"
            :disabled="getMessageGroup(element.groupId)?.enabled === false"
            @change="props.onRadioChange ? props.onRadioChange(element) : null"
          />
          <el-switch
            v-else
            v-model="element.isEnabled"
            :active-value="true"
            :inactive-value="false"
            size="small"
            :disabled="getMessageGroup(element.groupId)?.enabled === false"
            @change="$emit('toggle-enabled')"
          />
        </div>
      </div>
      <div v-if="element.name" class="message-name">{{ element.name }}</div>
      <div class="message-text">{{ truncateText(element.content, 120) }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, markRaw } from "vue";
import {
  Rank,
  Edit,
  Delete,
  CopyDocument,
  DocumentCopy,
  DocumentAdd,
  Setting,
  User,
  Link,
} from "@element-plus/icons-vue";
import { Bot } from "lucide-vue-next";
import type { ChatMessageNode, MessageRole } from "../../../types";
import type { PresetMessageGroup } from "../../../types/agent";
import {
  useAnchorRegistry,
  type AnchorDefinition,
} from "../../../composables/ui/useAnchorRegistry";

interface Props {
  element: ChatMessageNode;
  compact: boolean;
  modelId?: string;
  tokenCount?: number;
  presetGroups?: PresetMessageGroup[];
  onRadioChange?: (msg: ChatMessageNode) => void;
}

interface Emits {
  (e: "edit", message: ChatMessageNode): void;
  (e: "copy", message: ChatMessageNode): void;
  (e: "duplicate", message: ChatMessageNode): void;
  (e: "paste", message: ChatMessageNode): void;
  (e: "delete", message: ChatMessageNode): void;
  (e: "toggle-enabled"): void;
  (e: "group-command", msg: ChatMessageNode, cmd: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

function getMessageGroup(groupId?: string) {
  if (!groupId || !props.presetGroups) return undefined;
  return props.presetGroups.find((g) => g.id === groupId);
}

const anchorRegistry = useAnchorRegistry();

function getAnchorDef(type?: string): AnchorDefinition | undefined {
  return type ? anchorRegistry.getAnchorById(type) : undefined;
}

const isPurePlaceholder = computed(() => {
  const t = props.element.type;
  if (!t || t === "message") return false;
  const anchor = anchorRegistry.getAnchorById(t);
  return !!anchor && !anchor.hasTemplate;
});

const isTemplateAnchor = computed(() => {
  return getAnchorDef(props.element.type)?.hasTemplate === true;
});

const anchorDef = computed(() => getAnchorDef(props.element.type));
const anchorTagType = computed(() => anchorDef.value?.tagType || "success");
const anchorIcon = computed(() => anchorDef.value?.icon || Link);
const anchorColor = computed(
  () => anchorDef.value?.color || "var(--el-color-success)"
);

const roleTagTypeMap: Record<MessageRole, "success" | "primary" | "info"> = {
  system: "info",
  user: "primary",
  assistant: "success",
  tool: "info",
};
const roleIconMap: Record<MessageRole, any> = {
  system: markRaw(Setting),
  user: markRaw(User),
  assistant: markRaw(Bot),
  tool: markRaw(Bot),
};
const roleLabelMap: Record<MessageRole, string> = {
  system: "System",
  user: "User",
  assistant: "Assistant",
  tool: "Tool",
};
const roleColorMap: Record<MessageRole, string> = {
  system: "var(--el-color-info)",
  user: "var(--el-color-primary)",
  assistant: "var(--el-color-success)",
  tool: "var(--el-color-info)",
};

const roleTagType = computed(() => roleTagTypeMap[props.element.role]);
const roleIcon = computed(() => roleIconMap[props.element.role]);
const roleLabel = computed(() => roleLabelMap[props.element.role]);
const roleColor = computed(() => roleColorMap[props.element.role]);

const injectionBadge = computed(() => {
  const s = props.element.injectionStrategy;
  if (!s) return null;
  if (s.type === "advanced_depth" || (!s.type && s.depthConfig))
    return {
      type: "advanced_depth",
      emoji: "🔩",
      label: String(s.depthConfig),
      title: `高级深度: ${s.depthConfig}`,
    };
  if (s.type === "depth" || (!s.type && s.depth !== undefined))
    return {
      type: "depth",
      emoji: "📍",
      label: String(s.depth),
      title: "深度注入",
    };
  if (s.type === "anchor" || (!s.type && s.anchorTarget))
    return { type: "anchor", emoji: "⚓", label: null, title: "锚点注入" };
  return null;
});

function truncateText(text: string, maxLength: number): string {
  if (!text) return "(空内容)";
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length <= maxLength
    ? cleaned
    : cleaned.substring(0, maxLength) + "...";
}
</script>

<style scoped>
.message-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.message-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-card.disabled {
  opacity: 0.5;
}

.placeholder-card,
.template-anchor-card {
  border-style: dashed;
}

.placeholder-card.placeholder-chat_history,
.template-anchor-card.template-anchor-chat_history {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning-light-5);
}
.placeholder-card.placeholder-chat_history:hover,
.template-anchor-card.template-anchor-chat_history:hover {
  border-color: var(--el-color-warning);
  background: color-mix(in srgb, var(--el-color-warning) 20%, transparent);
}

.template-anchor-card {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border-color: var(--el-color-primary-light-5);
}
.template-anchor-card:hover {
  border-color: var(--el-color-primary);
  background: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
}

.placeholder-text {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.drag-handle {
  display: flex;
  align-items: center;
  cursor: grab;
  color: var(--el-text-color-secondary);
  padding: 4px;
  user-select: none;
}
.drag-handle:active {
  cursor: grabbing;
}
.drag-handle:hover {
  color: var(--el-color-primary);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-role {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 8px;
}

.role-tags {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  flex: 1;
  min-width: 0;
}

.token-tag {
  font-variant-numeric: tabular-nums;
}
.injection-tag {
  font-size: 12px;
}

.message-name {
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 4px;
  font-size: 14px;
  line-height: 1.4;
}

.message-text {
  color: var(--el-text-color-regular);
  line-height: 1.6;
  word-break: break-word;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.message-actions > * {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.message-actions .el-button {
  width: 24px;
  height: 24px;
  padding: 0;
  border-radius: 4px;
  transition: all 0.2s;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.message-actions .el-button:hover {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--el-color-primary);
}

.message-actions .el-button.el-button--danger:hover {
  background-color: rgba(
    var(--el-color-danger-rgb),
    calc(var(--card-opacity) * 0.1)
  );
  color: var(--el-color-danger);
}

/* 紧凑模式 */
.message-card-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border: var(--border-width) solid var(--border-color);
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
  min-height: 36px;
}

.message-card-compact:hover {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.message-card-compact.disabled {
  opacity: 0.5;
}

.placeholder-card-compact,
.template-anchor-card-compact {
  border-style: dashed;
}

.placeholder-card-compact.placeholder-chat_history {
  background: color-mix(in srgb, var(--el-color-warning) 10%, transparent);
  border-color: var(--el-color-warning-light-5);
}
.placeholder-card-compact.placeholder-user_profile,
.template-anchor-card-compact {
  background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  border-color: var(--el-color-primary-light-5);
}

.message-card-compact .drag-handle {
  padding: 2px;
  font-size: 14px;
}

.role-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.message-text-compact {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.token-compact {
  font-size: 11px;
  color: var(--el-color-info);
  font-variant-numeric: tabular-nums;
  padding: 2px 6px;
  background: var(--el-fill-color-light);
  border-radius: 4px;
  flex-shrink: 0;
}

.message-actions-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.injection-badge-compact {
  font-size: 11px;
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.model-match-badge-compact {
  font-size: 11px;
  color: var(--el-color-danger);
  flex-shrink: 0;
}

.attachment-badge-compact {
  font-size: 11px;
  color: var(--el-color-info);
  flex-shrink: 0;
}

.el-button {
  margin: 0;
}

/* 增强 el-radio 在半透明主题下的可见性 */
:deep(.el-radio__inner) {
  border-width: 2px;
  border-color: var(--el-text-color-secondary);
  background-color: transparent;
}

:deep(.el-radio__inner:hover) {
  border-color: var(--el-color-primary);
}

:deep(.el-radio.is-checked .el-radio__inner) {
  border-color: var(--el-color-primary);
  background-color: var(--el-color-primary);
}

:deep(.el-radio.is-disabled .el-radio__inner) {
  border-color: var(--el-text-color-placeholder);
  background-color: transparent;
}

:deep(.el-radio.is-disabled.is-checked .el-radio__inner) {
  border-color: var(--el-text-color-placeholder);
  background-color: var(--el-text-color-placeholder);
}
</style>
