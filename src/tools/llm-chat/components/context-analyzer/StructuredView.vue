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
  <div class="structured-view">
    <!-- Agent 信息 -->
    <InfoCard title="智能体信息" class="agent-info-card">
      <div class="agent-info">
        <Avatar
          v-if="contextData.agentInfo.icon"
          :src="
            resolveAvatarPath(
              {
                id: contextData.agentInfo.id,
                icon: contextData.agentInfo.icon,
              },
              'agent'
            ) || ''
          "
          :alt="agentDisplayName"
          :size="96"
          shape="square"
          :radius="8"
        />
        <div class="agent-details">
          <div class="info-item">
            <span class="label">名称:</span>
            <span class="value">
              {{ agentDisplayName }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">模型:</span>
            <span class="value">
              <DynamicIcon
                v-if="modelIcon"
                :src="modelIcon"
                :size="16"
                class="value-icon"
                alt="model icon"
              />
              {{ modelDisplayName }}
            </span>
          </div>
          <div class="info-item">
            <span class="label">配置文件:</span>
            <span class="value">
              <DynamicIcon
                v-if="providerIcon"
                :src="providerIcon"
                :size="16"
                class="value-icon"
                alt="provider icon"
              />
              {{
                contextData.agentInfo.profileName ||
                agentProfile?.name ||
                "未知配置"
              }}
            </span>
          </div>
        </div>
      </div>
    </InfoCard>

    <!-- 统计信息 -->
    <InfoCard class="stats-card">
      <template #header>
        <div class="card-header">
          <span>上下文统计</span>
          <el-tag
            v-if="contextData.statistics.tokenizerName"
            size="small"
            type="info"
          >
            {{ contextData.statistics.isEstimated ? "字符估算" : "Token 计算" }}
            -
            {{ contextData.statistics.tokenizerName }}
          </el-tag>
        </div>
      </template>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">总消息数</div>
          <div class="stat-value">
            {{ contextData.statistics.messageCount }}
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">角色分布</div>
          <div class="stat-value role-breakdown">
            <el-tag
              size="small"
              effect="plain"
              class="role-tag role-tag-system"
              v-if="roleBreakdown.system > 0"
            >
              SYS {{ roleBreakdown.system }}
            </el-tag>
            <el-tag
              size="small"
              effect="plain"
              class="role-tag role-tag-user"
              v-if="roleBreakdown.user > 0"
            >
              USER {{ roleBreakdown.user }}
            </el-tag>
            <el-tag
              size="small"
              effect="plain"
              class="role-tag role-tag-assistant"
              v-if="roleBreakdown.assistant > 0"
            >
              AI {{ roleBreakdown.assistant }}
            </el-tag>
          </div>
        </div>
        <div
          v-if="contextData.statistics.totalTokenCount !== undefined"
          class="stat-item primary"
        >
          <div class="stat-label">总 Token 数</div>
          <div class="stat-value">
            {{ contextData.statistics.totalTokenCount.toLocaleString() }}
            <span class="char-count">
              {{ contextData.statistics.totalCharCount.toLocaleString() }} 字符
            </span>
          </div>
        </div>
        <div v-else class="stat-item">
          <div class="stat-label">总字符数</div>
          <div class="stat-value">
            {{ contextData.statistics.totalCharCount.toLocaleString() }}
          </div>
        </div>
        <div
          v-if="contextData.statistics.textTokenCount !== undefined"
          class="stat-item"
        >
          <div class="stat-label">文本 Token</div>
          <div class="stat-value">
            {{ contextData.statistics.textTokenCount.toLocaleString() }}
          </div>
        </div>
        <div
          v-if="
            contextData.statistics.attachmentTokenCount !== undefined &&
            contextData.statistics.attachmentTokenCount > 0
          "
          class="stat-item attachment"
        >
          <div class="stat-label">附件估算 Token</div>
          <div class="stat-value">
            {{ contextData.statistics.attachmentTokenCount.toLocaleString() }}
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">预设消息</div>
          <div class="stat-value">
            <template
              v-if="
                contextData.statistics.presetMessagesTokenCount !== undefined
              "
            >
              {{
                contextData.statistics.presetMessagesTokenCount.toLocaleString()
              }}
              tokens
              <span class="char-count">
                {{
                  contextData.statistics.presetMessagesCharCount.toLocaleString()
                }}
                字符
              </span>
            </template>
            <template v-else>
              {{
                contextData.statistics.presetMessagesCharCount.toLocaleString()
              }}
              字符
            </template>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">会话历史</div>
          <div class="stat-value">
            <template
              v-if="contextData.statistics.chatHistoryTokenCount !== undefined"
            >
              {{
                contextData.statistics.chatHistoryTokenCount.toLocaleString()
              }}
              tokens
              <span class="char-count">
                {{
                  contextData.statistics.chatHistoryCharCount.toLocaleString()
                }}
                字符
              </span>
            </template>
            <template v-else>
              {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }}
              字符
            </template>
          </div>
        </div>
        <div
          v-if="contextData.statistics.postProcessingTokenCount !== undefined"
          class="stat-item"
        >
          <div class="stat-label">后处理消耗</div>
          <div class="stat-value">
            {{
              contextData.statistics.postProcessingTokenCount.toLocaleString()
            }}
            tokens
            <span
              class="char-count"
              v-if="
                contextData.statistics.postProcessingCharCount !== undefined
              "
            >
              {{
                contextData.statistics.postProcessingCharCount.toLocaleString()
              }}
              字符
            </span>
          </div>
        </div>
        <div
          v-if="
            contextData.statistics.worldbookEntryCount ||
            contextData.statistics.worldbookTokenCount ||
            contextData.statistics.worldbookCharCount
          "
          class="stat-item worldbook"
        >
          <div class="stat-label">世界书条目</div>
          <div class="stat-value">
            {{ contextData.statistics.worldbookEntryCount || 0 }} 条
            <span class="char-count">
              <template
                v-if="contextData.statistics.worldbookTokenCount !== undefined"
              >
                {{
                  contextData.statistics.worldbookTokenCount.toLocaleString()
                }}
                tokens
              </template>
              <template
                v-if="contextData.statistics.worldbookCharCount !== undefined"
              >
                {{
                  contextData.statistics.worldbookTokenCount !== undefined
                    ? " / "
                    : ""
                }}
                {{ contextData.statistics.worldbookCharCount.toLocaleString() }}
                字符
              </template>
              <template
                v-if="
                  contextData.statistics.worldbookTokenCount === undefined &&
                  contextData.statistics.worldbookCharCount === undefined
                "
              >
                0 消耗
              </template>
            </span>
          </div>
        </div>
        <div
          v-if="
            contextData.statistics.truncatedMessageCount &&
            contextData.statistics.truncatedMessageCount > 0
          "
          class="stat-item warning"
        >
          <div class="stat-label">截断统计</div>
          <div class="stat-value">
            {{ contextData.statistics.truncatedMessageCount }} 条消息
            <span
              class="saved-count"
              v-if="contextData.statistics.savedTokenCount !== undefined"
            >
              节省
              {{ contextData.statistics.savedTokenCount.toLocaleString() }}
              tokens
            </span>
          </div>
        </div>
      </div>
    </InfoCard>

    <!-- 世界书条目 -->
    <InfoCard
      v-if="
        contextData.worldbookEntries && contextData.worldbookEntries.length > 0
      "
      class="worldbook-section-card"
    >
      <template #header>
        <div
          class="card-header clickable"
          @click="worldbookExpanded = !worldbookExpanded"
        >
          <div class="header-left">
            <el-icon
              class="expand-icon"
              :class="{ expanded: worldbookExpanded }"
            >
              <ArrowRight />
            </el-icon>
            <el-icon class="section-icon worldbook-color"
              ><MagicStick
            /></el-icon>
            <span>激活的世界书条目</span>
          </div>
          <div class="header-tags">
            <el-tag size="small" type="warning">
              {{ contextData.worldbookEntries.length }} 条
            </el-tag>
            <el-tag
              v-if="contextData.statistics.worldbookTokenCount"
              size="small"
              type="success"
            >
              {{ contextData.statistics.worldbookTokenCount.toLocaleString() }}
              tokens
            </el-tag>
            <el-tag
              v-if="contextData.statistics.worldbookCharCount"
              size="small"
              type="info"
            >
              {{ contextData.statistics.worldbookCharCount.toLocaleString() }}
              字符
            </el-tag>
            <el-divider direction="vertical" />
            <el-button
              link
              type="primary"
              size="small"
              class="expand-all-btn"
              @click.stop="toggleAllEntries"
            >
              {{ isAllEntriesExpanded ? "一键收起" : "一键展开" }}
            </el-button>
          </div>
        </div>
      </template>
      <el-collapse-transition>
        <div v-show="worldbookExpanded" class="worldbook-list">
          <div
            v-for="entry in contextData.worldbookEntries"
            :key="entry.uid"
            class="worldbook-entry"
          >
            <div class="entry-header" @click="toggleEntryExpand(entry.uid)">
              <div class="entry-title">
                <el-icon
                  class="expand-icon small"
                  :class="{ expanded: expandedEntries.has(entry.uid) }"
                >
                  <ArrowRight />
                </el-icon>
                <span class="entry-name">
                  {{ entry.comment || `条目 #${entry.uid}` }}
                </span>
                <el-tag
                  v-if="entry.constant"
                  size="small"
                  type="danger"
                  effect="dark"
                >
                  常量
                </el-tag>
                <el-tag
                  size="small"
                  type="info"
                  effect="plain"
                  class="entry-source-tag"
                >
                  {{ entry.worldbookName }}
                </el-tag>
              </div>
              <div class="entry-meta">
                <el-tag size="small" type="warning" effect="plain">
                  {{ getPositionLabel(entry.position, entry.depth) }}
                </el-tag>
                <el-tag
                  v-if="entry.tokenCount !== undefined"
                  size="small"
                  type="success"
                >
                  {{ entry.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info">
                  {{ entry.charCount }} 字符
                </el-tag>
              </div>
            </div>
            <el-collapse-transition>
              <div
                v-show="expandedEntries.has(entry.uid)"
                class="entry-details"
              >
                <!-- 关键词信息 -->
                <div class="worldbook-keywords">
                  <div v-if="entry.keys.length > 0" class="keyword-group">
                    <el-icon class="keyword-icon"><Key /></el-icon>
                    <span class="keyword-label">主要:</span>
                    <el-tag
                      v-for="(key, idx) in entry.keys.slice(0, 8)"
                      :key="idx"
                      size="small"
                      type="primary"
                      effect="plain"
                      class="keyword-tag"
                    >
                      {{ key }}
                    </el-tag>
                    <span v-if="entry.keys.length > 8" class="more-keywords">
                      +{{ entry.keys.length - 8 }}
                    </span>
                  </div>
                  <div
                    v-if="entry.keysecondary.length > 0"
                    class="keyword-group"
                  >
                    <span class="keyword-label">次要:</span>
                    <el-tag
                      v-for="(key, idx) in entry.keysecondary.slice(0, 5)"
                      :key="idx"
                      size="small"
                      type="info"
                      effect="plain"
                      class="keyword-tag"
                    >
                      {{ key }}
                    </el-tag>
                    <span
                      v-if="entry.keysecondary.length > 5"
                      class="more-keywords"
                    >
                      +{{ entry.keysecondary.length - 5 }}
                    </span>
                  </div>
                </div>
                <!-- 内容 -->
                <div class="worldbook-content">
                  {{ entry.content }}
                </div>
              </div>
            </el-collapse-transition>
          </div>
        </div>
      </el-collapse-transition>
    </InfoCard>

    <!-- 统一消息列表（按实际上下文顺序） -->
    <div v-if="unifiedMessages.length > 0" class="section">
      <div class="section-title">
        <span>上下文消息</span>
        <div class="header-tags">
          <el-tag size="small" type="primary">
            {{ unifiedMessages.length }} 条消息
          </el-tag>
          <el-tag
            v-if="contextData.statistics.totalTokenCount !== undefined"
            size="small"
            type="success"
          >
            {{ contextData.statistics.totalTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
      </div>

      <!-- 工具栏：搜索 + 锚点条 (sticky 常驻) -->
      <div class="messages-toolbar">
        <div class="search-row">
          <el-input
            v-model="searchQuery"
            placeholder="搜索消息内容..."
            clearable
            class="search-input"
          >
            <template #prefix>
              <el-icon><Search /></el-icon>
            </template>
          </el-input>
          <div v-if="searchQuery.trim()" class="search-controls">
            <span class="match-count">
              <template v-if="matchedKeys.length > 0">
                {{ currentMatchIndex + 1 }} / {{ matchedKeys.length }}
              </template>
              <template v-else>0 / 0</template>
              <span class="match-total"
                >· 共 {{ unifiedMessages.length }} 块</span
              >
            </span>
            <el-button-group>
              <el-button
                size="small"
                :disabled="matchedKeys.length === 0"
                @click="gotoPrev"
              >
                <el-icon><ArrowUp /></el-icon>
              </el-button>
              <el-button
                size="small"
                :disabled="matchedKeys.length === 0"
                @click="gotoNext"
              >
                <el-icon><ArrowDown /></el-icon>
              </el-button>
            </el-button-group>
          </div>
        </div>
        <div class="anchors-row">
          <button
            v-for="(msg, index) in unifiedMessages"
            :key="msg.key"
            type="button"
            class="anchor-chip"
            :class="[
              `role-${msg.role}`,
              {
                'has-match': matchedKeySet.has(msg.key),
                'is-current':
                  matchedKeys[currentMatchIndex] === msg.key &&
                  matchedKeys.length > 0,
              },
            ]"
            :title="`#${index} ${getRoleShortLabel(msg.role)}`"
            @click="scrollToMessage(msg.key)"
          >
            <span class="anchor-index">#{{ index }}</span>
            <span class="anchor-role">{{ getRoleShortLabel(msg.role) }}</span>
            <span
              v-if="matchedKeySet.has(msg.key)"
              class="anchor-match-dot"
            ></span>
          </button>
        </div>
      </div>

      <div class="messages-list">
        <InfoCard
          v-for="(msg, index) in unifiedMessages"
          :key="msg.key"
          :ref="(el) => registerMessageRef(msg.key, el)"
          :class="[
            'message-card',
            `role-${msg.role}`,
            {
              'pending-message-card': msg.isPendingInput,
              'search-highlight':
                matchedKeySet.has(msg.key) && !!searchQuery.trim(),
              'search-current':
                matchedKeys[currentMatchIndex] === msg.key &&
                matchedKeys.length > 0,
            },
          ]"
        >
          <template #header>
            <div class="message-card-header">
              <div class="message-title">
                <!-- 根据角色显示不同头像 -->
                <Avatar
                  v-if="msg.role === 'user'"
                  :src="msg.userIcon || ''"
                  :alt="msg.userName || 'User'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <Avatar
                  v-else-if="msg.role === 'assistant'"
                  :src="getAssistantAvatarSrc(msg)"
                  :alt="
                    msg.agentName ||
                    contextData.agentInfo.displayName ||
                    contextData.agentInfo.name ||
                    '助手'
                  "
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <el-icon v-else class="system-icon">
                  <Setting />
                </el-icon>
                <span class="message-role-name">
                  {{ getRoleName(msg) }}
                  #{{ index + 1 }}
                </span>
                <!-- 内容类型标签 (text / multimodal) -->
                <el-tag
                  size="small"
                  :type="
                    getContentType(msg.content) === 'multimodal'
                      ? 'warning'
                      : 'info'
                  "
                  effect="plain"
                  class="content-type-tag"
                >
                  {{ getContentType(msg.content) }}
                </el-tag>
                <!-- 摘要节点标识 -->
                <el-tag
                  v-if="msg.isCompressionNode"
                  size="small"
                  type="info"
                  effect="dark"
                  class="compression-tag"
                >
                  上下文摘要
                </el-tag>
                <!-- 待发送节点标识 -->
                <el-tag
                  v-if="msg.isPendingInput"
                  size="small"
                  type="warning"
                  effect="dark"
                  class="pending-tag"
                >
                  待发送
                </el-tag>
                <!-- 来源标签 -->
                <el-tag
                  :type="getSourceTagType(msg.source)"
                  size="small"
                  effect="plain"
                  class="source-tag"
                >
                  {{ getSourceLabel(msg) }}
                </el-tag>
              </div>
              <div class="header-tags">
                <el-tag
                  v-if="msg.nonTextCount > 0"
                  size="small"
                  type="warning"
                  effect="plain"
                >
                  +{{ msg.nonTextCount }} 非文本
                </el-tag>
                <el-tag
                  v-if="msg.tokenCount !== undefined"
                  size="small"
                  type="success"
                >
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info">
                  {{ msg.charCount }} 字符
                </el-tag>
              </div>
            </div>
            <!-- 摘要详情 -->
            <div v-if="msg.isCompressionNode" class="compression-details">
              <span class="detail-item">
                <el-icon><ChatLineRound /></el-icon>
                压缩历史: {{ msg.originalMessageCount }} 条
              </span>
            </div>
          </template>
          <!-- 宏展开对比（待发送消息） -->
          <div
            v-if="msg.isPendingInput && msg.pendingInputOriginal"
            class="macro-diff-section"
          >
            <el-collapse>
              <el-collapse-item title="查看宏展开对比" name="macro">
                <div class="macro-diff-content">
                  <div class="diff-block">
                    <div class="diff-label">原始输入：</div>
                    <div class="diff-text">{{ msg.pendingInputOriginal }}</div>
                  </div>
                  <div class="diff-block">
                    <div class="diff-label">处理后：</div>
                    <div class="diff-text">
                      {{ getDisplayContent(msg.content) }}
                    </div>
                  </div>
                </div>
              </el-collapse-item>
            </el-collapse>
          </div>
          <div
            v-else
            class="message-content"
            :class="{ 'is-summary': msg.isCompressionNode }"
          >
            {{ getDisplayContent(msg.content) }}
          </div>
          <!-- 附件分析（仅会话历史消息有） -->
          <div
            v-if="msg.attachments && msg.attachments.length > 0"
            class="attachments-section"
          >
            <div class="attachments-title">附件分析</div>
            <div class="attachments-grid">
              <AttachmentCard
                v-for="(att, attIndex) in msg.attachments"
                :key="attIndex"
                :asset="castToAsset(att)"
                :all-assets="castToAssetArray(msg.attachments)"
                :token-count="att.tokenCount"
                :token-estimated="att.isEstimated"
                :token-error="att.error"
                :removable="false"
                size="large"
                :will-use-transcription="
                  getWillUseTranscription(att, msg.messageDepth)
                "
              />
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from "vue";
import {
  Setting,
  ChatLineRound,
  MagicStick,
  Key,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Search,
} from "@element-plus/icons-vue";
import InfoCard from "@/components/common/InfoCard.vue";
import Avatar from "@/components/common/Avatar.vue";
import AttachmentCard from "../AttachmentCard.vue";
import {
  type ContextPreviewData,
  isVirtualPendingInputNode,
} from "../../types/context";
import type { Asset } from "@/types/asset-management";
import { resolveAvatarPath } from "../../composables/ui/useResolvedAvatar";
import type { LlmMessageContent } from "@/llm-apis/common";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useTranscriptionManager } from "../../composables/features/useTranscriptionManager";
import { STWorldbookPosition } from "../../types/worldbook";

const props = defineProps<{
  contextData: ContextPreviewData;
}>();

const userProfileStore = useUserProfileStore();
const { getProfileById } = useLlmProfiles();

// 世界书折叠状态
const worldbookExpanded = ref(false);
const expandedEntries = ref(new Set<number>());

function toggleEntryExpand(uid: number) {
  if (expandedEntries.value.has(uid)) {
    expandedEntries.value.delete(uid);
  } else {
    expandedEntries.value.add(uid);
  }
}

const isAllEntriesExpanded = computed(() => {
  if (!props.contextData.worldbookEntries?.length) return false;
  return (
    expandedEntries.value.size >= props.contextData.worldbookEntries.length
  );
});

function toggleAllEntries() {
  if (isAllEntriesExpanded.value) {
    expandedEntries.value.clear();
  } else {
    props.contextData.worldbookEntries?.forEach((entry) => {
      expandedEntries.value.add(entry.uid);
    });
    // 同时也确保大卡片是展开的
    worldbookExpanded.value = true;
  }
}

const { getModelIcon, getModelProperty, getIconPath, getDisplayIconPath } =
  useModelMetadata();
const { computeWillUseTranscription } = useTranscriptionManager();

const agentProfile = computed(() => {
  if (!props.contextData.agentInfo.profileId) return undefined;
  return getProfileById(props.contextData.agentInfo.profileId);
});

const agentModel = computed(() => {
  if (!agentProfile.value || !props.contextData.agentInfo.modelId)
    return undefined;
  return agentProfile.value.models.find(
    (m) => m.id === props.contextData.agentInfo.modelId
  );
});

const modelDisplayName = computed(() => {
  // 1. 优先使用快照中的模型名称
  if (props.contextData.agentInfo.modelName) {
    return props.contextData.agentInfo.modelName;
  }
  // 2. 如果快照没有，再尝试从当前配置获取（用于兼容旧数据）
  if (agentModel.value) {
    return (
      getModelProperty(agentModel.value, "name") ||
      agentModel.value.name ||
      agentModel.value.id
    );
  }
  // 3. 最终回退到使用 modelId
  return props.contextData.agentInfo.modelId;
});

const modelIcon = computed(() => {
  // 优先使用从当前配置获取的模型图标
  if (agentModel.value) {
    return getModelIcon(agentModel.value);
  }
  // 回退到通过 modelId 和 providerType 匹配图标（模型被删除时仍能显示图标）
  const { modelId, providerType } = props.contextData.agentInfo;
  if (modelId) {
    const iconPath = getIconPath(modelId, providerType);
    if (iconPath) {
      return getDisplayIconPath(iconPath);
    }
  }
  return null;
});

const providerIcon = computed(() => {
  // 优先使用从当前配置获取的渠道图标
  if (agentProfile.value) {
    return agentProfile.value.icon || agentProfile.value.logoUrl || null;
  }
  // 如果渠道被删除，回退到通过 providerType 匹配图标
  const { providerType } = props.contextData.agentInfo;
  if (providerType) {
    // 使用 providerType 作为 modelId 来匹配通用的提供商图标
    const iconPath = getIconPath(providerType);
    if (iconPath) {
      return getDisplayIconPath(iconPath);
    }
  }
  return null;
});

const agentDisplayName = computed(() => {
  // 优先使用 agentInfo 中的 displayName
  if (props.contextData.agentInfo.displayName) {
    return props.contextData.agentInfo.displayName;
  }
  // 其次，尝试从历史记录中寻找最后一个 assistant 消息（兼容数据可能不一致的情况）
  // 因为打开分析器时，最后一条消息通常是当前 agent 发出的
  const historyWithAgentName = [...props.contextData.chatHistory]
    .reverse()
    .find((h) => h.role === "assistant" && h.agentName);
  if (historyWithAgentName) {
    return historyWithAgentName.agentName;
  }
  // 最后回退到 name
  return props.contextData.agentInfo.name || "未命名";
});

/**
 * 获取备用的用户信息，用于填充预设消息中的用户身份
 * 优先级: 最后一个历史用户 > 全局用户配置
 */
const fallbackUserInfo = computed(() => {
  // 1. 尝试从历史记录中找到最后一个发言的用户
  const lastUserInHistory = [...props.contextData.chatHistory]
    .reverse()
    .find((h) => h.role === "user" && (h.userName || h.userIcon));
  if (lastUserInHistory) {
    return {
      name: lastUserInHistory.userName,
      icon: lastUserInHistory.userIcon,
    };
  }

  // 2. 尝试获取当前生效的用户配置（优先使用智能体绑定的档案）
  const effectiveProfile = userProfileStore.getEffectiveProfile(
    props.contextData.agentInfo.userProfileId
  );
  if (effectiveProfile) {
    // 适配：UserProfile 的 name 是内部ID，displayName 才是显示名
    return {
      name: effectiveProfile.displayName || effectiveProfile.name,
      icon: effectiveProfile.icon,
    };
  }

  // 3. 最终回退
  return null;
});

/**
 * 统一消息类型
 */
interface UnifiedMessage {
  key: string;
  role: "system" | "user" | "assistant";
  content: string | LlmMessageContent[];
  charCount: number;
  nonTextCount: number;
  tokenCount?: number;
  source: "agent_preset" | "session_history" | "unknown";
  // 用户信息（user 角色）
  userName?: string;
  userIcon?: string;
  // 智能体信息（assistant 角色）
  agentName?: string;
  agentIcon?: string;
  // 摘要信息
  isCompressionNode?: boolean;
  originalMessageCount?: number;
  // 附件（仅会话历史）
  attachments?: ContextPreviewData["chatHistory"][number]["attachments"];
  _mergedSources?: any[];
  // 消息深度（用于判断强制转写）
  messageDepth?: number;
  // 是否为待发送消息（虚拟节点）
  isPendingInput?: boolean;
  // 宏展开前的原始内容（待发送消息使用）
  pendingInputOriginal?: string;
}

/**
 * 将 finalMessages 与详细信息合并，生成统一的消息列表
 * 按照 finalMessages 的实际顺序显示，确保 index 准确
 */
const unifiedMessages = computed<UnifiedMessage[]>(() => {
  const { finalMessages, presetMessages, chatHistory } = props.contextData;

  // 建立预设消息索引 (index -> preset)
  const presetMap = new Map<number, (typeof presetMessages)[number]>();
  presetMessages.forEach((p) => presetMap.set(p.index, p));

  // 建立历史消息索引 (nodeId -> history)
  const historyMap = new Map<string, (typeof chatHistory)[number]>();
  chatHistory.forEach((h) => historyMap.set(h.nodeId, h));

  // 计算会话历史消息的深度映射
  // 深度 = 总消息数 - 1 - 当前索引（最后一条消息深度为 0）
  const historyDepthMap = new Map<string, number>();
  const totalHistoryCount = chatHistory.length;
  chatHistory.forEach((h, idx) => {
    const depth = totalHistoryCount - 1 - idx;
    historyDepthMap.set(h.nodeId, depth);
  });

  return finalMessages.map((finalMsg, i: number) => {
    // 基础信息
    const baseMsg: UnifiedMessage = {
      key: `msg-${i}`,
      role: finalMsg.role,
      content: finalMsg.content,
      charCount: 0, // 稍后计算
      nonTextCount: 0,
      source: "unknown",
      // 真实反映管道处理后的附件状态
      attachments: finalMsg._attachments as any,
    };

    // 计算字符数和非文本内容数
    let contentStr = "";
    if (typeof finalMsg.content === "string") {
      contentStr = finalMsg.content;
    } else if (Array.isArray(finalMsg.content)) {
      // 只提取文本部分，避免 Base64 导致字符数虚高
      const textParts = finalMsg.content.filter(
        (p): p is { type: "text"; text: string } =>
          p.type === "text" && !!p.text
      );
      contentStr = textParts.map((p) => p.text).join("\n");
      baseMsg.nonTextCount = finalMsg.content.length - textParts.length;
    }
    baseMsg.charCount = contentStr.length;

    // 根据来源元数据进行匹配
    // 新增：处理合并后的消息
    if (finalMsg.sourceType === "merged" && finalMsg._mergedSources) {
      let totalTokenCount = 0;
      let source: UnifiedMessage["source"] = "unknown";
      let userName: string | undefined;
      let userIcon: string | undefined;
      let agentName: string | undefined;
      let agentIcon: string | undefined;

      const mergedRole = finalMsg.role;

      for (const sourceMsg of finalMsg._mergedSources) {
        // 获取源数据对象 (Preset 或 History)
        let sourceData: any = null;

        if (
          sourceMsg.sourceType === "agent_preset" &&
          sourceMsg.sourceIndex !== undefined
        ) {
          sourceData = presetMap.get(sourceMsg.sourceIndex);
          source = "agent_preset"; // 只要含预设，整体即为预设来源（优先级更高）
        } else if (
          sourceMsg.sourceType === "session_history" &&
          sourceMsg.sourceId
        ) {
          sourceData = historyMap.get(String(sourceMsg.sourceId));
          if (source !== "agent_preset") source = "session_history";
        }

        if (sourceData) {
          // 1. 累加 Token
          if (sourceData.tokenCount) totalTokenCount += sourceData.tokenCount;

          // 2. 提取身份信息 (仅当尚未提取到时，优先取第一个非空的)
          if (mergedRole === "user") {
            if (!userName && sourceData.userName)
              userName = sourceData.userName;
            if (!userIcon && sourceData.userIcon)
              userIcon = sourceData.userIcon;
          } else if (mergedRole === "assistant") {
            // 注意：preset 数据结构中通常没有 agentName/Icon，访问 undefined 也没关系
            if (!agentName && sourceData.agentName)
              agentName = sourceData.agentName;
            if (!agentIcon && sourceData.agentIcon)
              agentIcon = sourceData.agentIcon;
          }
          // system 角色不需要提取名字头像
        }
      }

      const result: UnifiedMessage = {
        ...baseMsg,
        key: `merged-${i}`,
        tokenCount: totalTokenCount > 0 ? totalTokenCount : undefined,
        source: source,
        userName,
        userIcon,
        agentName,
        agentIcon,
        _mergedSources: finalMsg._mergedSources,
      };

      // 为合并后的 user 消息应用回退逻辑
      if (
        result.role === "user" &&
        !result.userName &&
        fallbackUserInfo.value
      ) {
        result.userName = fallbackUserInfo.value.name;
        result.userIcon = fallbackUserInfo.value.icon;
      }

      return result;
    } else if (
      finalMsg.sourceType === "agent_preset" &&
      finalMsg.sourceIndex !== undefined
    ) {
      const preset = presetMap.get(finalMsg.sourceIndex);
      if (preset) {
        const result: UnifiedMessage = {
          ...baseMsg,
          key: `preset-${preset.index}-${i}`,
          tokenCount: preset.tokenCount,
          source: "agent_preset",
          userName: preset.userName,
          userIcon: preset.userIcon,
        };

        // 为预设的 user 消息应用回退逻辑
        if (
          result.role === "user" &&
          !result.userName &&
          fallbackUserInfo.value
        ) {
          result.userName = fallbackUserInfo.value.name;
          result.userIcon = fallbackUserInfo.value.icon;
        }

        return result;
      }
    } else if (finalMsg.sourceType === "session_history" && finalMsg.sourceId) {
      const history = historyMap.get(String(finalMsg.sourceId));
      if (history) {
        return {
          ...baseMsg,
          key: `history-${history.nodeId}-${i}`,
          tokenCount: history.tokenCount,
          source: "session_history",
          userName: history.userName,
          userIcon: history.userIcon,
          agentName: history.agentName,
          agentIcon: history.agentIcon,
          isCompressionNode: history.isCompressionNode,
          originalMessageCount: history.originalMessageCount,
          // 继承 baseMsg 中从管道获取的附件状态，如果管道没提供（如未处理的消息），则回退到历史附件
          attachments: baseMsg.attachments || history.attachments,
          messageDepth: historyDepthMap.get(history.nodeId),
          // 通过 nodeId 前缀识别虚拟待发送节点
          isPendingInput: isVirtualPendingInputNode(history.nodeId),
          pendingInputOriginal: isVirtualPendingInputNode(history.nodeId)
            ? history.pendingInputOriginal
            : undefined,
        };
      }
    } else if (
      (finalMsg.sourceType === "depth_injection" ||
        finalMsg.sourceType === "anchor_injection") &&
      finalMsg.sourceIndex !== undefined
    ) {
      // 注入消息（归类为预设）
      const preset = presetMap.get(finalMsg.sourceIndex);
      if (preset) {
        return {
          ...baseMsg,
          key: `injection-${preset.index}-${i}`,
          tokenCount: preset.tokenCount,
          source: "agent_preset",
          userName: preset.userName,
          userIcon: preset.userIcon,
        };
      }
    }

    // 如果没有明确来源或匹配失败，保持基本信息
    return baseMsg;
  });
});

/**
 * 角色分布统计（用于顶部角色块计数聚合）
 */
const roleBreakdown = computed(() => {
  const counts = { system: 0, user: 0, assistant: 0 };
  unifiedMessages.value.forEach((msg) => {
    if (msg.role in counts) {
      counts[msg.role]++;
    }
  });
  return counts;
});

/**
 * 角色短标签 (用于锚点 chip)
 */
function getRoleShortLabel(role: string): string {
  const labelMap: Record<string, string> = {
    system: "SYS",
    user: "USER",
    assistant: "AI",
  };
  return labelMap[role] || role.toUpperCase();
}

/**
 * 内容类型识别 (text / multimodal)
 */
function getContentType(
  content: string | LlmMessageContent[]
): "text" | "multimodal" {
  if (typeof content === "string") return "text";
  if (Array.isArray(content) && content.some((p) => p.type !== "text")) {
    return "multimodal";
  }
  return "text";
}

// ============ 消息引用注册 & 锚点跳转 ============
const messageRefs = ref(new Map<string, HTMLElement>());

function registerMessageRef(key: string, instance: any) {
  if (!instance) {
    messageRefs.value.delete(key);
    return;
  }
  // InfoCard 是 Vue 组件，需要取 $el；如果已经是 DOM 节点则直接用
  const el: HTMLElement | undefined = instance.$el ?? instance;
  if (el && el.nodeType === 1) {
    messageRefs.value.set(key, el);
  }
}

function scrollToMessage(key: string) {
  const el = messageRefs.value.get(key);
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// ============ 搜索（高亮跳转模式） ============
const searchQuery = ref("");
const currentMatchIndex = ref(0);

const matchedKeys = computed<string[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return [];
  return unifiedMessages.value
    .filter((msg) => {
      const text = getDisplayContent(msg.content).toLowerCase();
      return text.includes(q);
    })
    .map((msg) => msg.key);
});

const matchedKeySet = computed(() => new Set(matchedKeys.value));

// 搜索词变化时重置游标
watch(searchQuery, () => {
  currentMatchIndex.value = 0;
});

// 当 matchedKeys 第一次有匹配时自动滚到第一项
watch(matchedKeys, (newKeys, oldKeys) => {
  if (newKeys.length > 0 && oldKeys.length === 0) {
    nextTick(() => {
      scrollToMessage(newKeys[0]);
    });
  }
  // 边界保护：游标越界则归零
  if (currentMatchIndex.value >= newKeys.length) {
    currentMatchIndex.value = 0;
  }
});

// 消息列表重算时清理失效的引用
watch(
  () => unifiedMessages.value.map((m) => m.key),
  (newKeys) => {
    const validKeys = new Set(newKeys);
    for (const k of messageRefs.value.keys()) {
      if (!validKeys.has(k)) messageRefs.value.delete(k);
    }
  }
);

function gotoNext() {
  if (matchedKeys.value.length === 0) return;
  currentMatchIndex.value =
    (currentMatchIndex.value + 1) % matchedKeys.value.length;
  scrollToMessage(matchedKeys.value[currentMatchIndex.value]);
}

function gotoPrev() {
  if (matchedKeys.value.length === 0) return;
  currentMatchIndex.value =
    (currentMatchIndex.value - 1 + matchedKeys.value.length) %
    matchedKeys.value.length;
  scrollToMessage(matchedKeys.value[currentMatchIndex.value]);
}

/**
 * 获取 assistant 消息的头像路径
 * 处理历史消息中可能是文件名格式的 agentIcon
 */
function getAssistantAvatarSrc(msg: UnifiedMessage): string {
  // 如果消息有自己的 agentIcon
  if (msg.agentIcon) {
    // 检查是否需要解析（可能是文件名格式）
    // 但由于历史消息没有存储 agentId，我们无法正确解析
    // 只能尝试用当前 agent 的 id 来解析（假设是同一个 agent）
    const resolved = resolveAvatarPath(
      { id: props.contextData.agentInfo.id, icon: msg.agentIcon },
      "agent"
    );
    if (resolved) return resolved;
  }

  // 回退到当前 agent 的头像
  return (
    resolveAvatarPath(
      {
        id: props.contextData.agentInfo.id,
        icon: props.contextData.agentInfo.icon,
      },
      "agent"
    ) || ""
  );
}

/**
 * 获取角色显示名称
 */
function getRoleName(msg: UnifiedMessage): string {
  if (msg.role === "system") {
    return "系统";
  }
  if (msg.role === "user") {
    return msg.userName || "用户";
  }
  if (msg.role === "assistant") {
    return (
      msg.agentName ||
      props.contextData.agentInfo.displayName ||
      props.contextData.agentInfo.name ||
      "助手"
    );
  }
  return msg.role;
}

/**
 * 获取来源标签类型
 */
function getSourceTagType(
  source: UnifiedMessage["source"]
): "warning" | "success" | "info" {
  switch (source) {
    case "agent_preset":
      return "warning";
    case "session_history":
      return "success";
    default:
      return "info";
  }
}

/**
 * 获取来源标签文本
 */
function getSourceLabel(msg: UnifiedMessage): string {
  if (
    msg.source === "agent_preset" &&
    msg._mergedSources &&
    msg._mergedSources.length > 1
  ) {
    return `预设 (合并 x${msg._mergedSources.length})`;
  }

  switch (msg.source) {
    case "agent_preset":
      return "预设";
    case "session_history":
      return "历史";
    default:
      return "未知";
  }
}

/**
 * 获取显示内容（处理多模态内容）
 */
function getDisplayContent(content: string | LlmMessageContent[]): string {
  if (typeof content === "string") {
    return content;
  }
  // 多模态内容，提取文本部分
  return content
    .filter((part) => part.type === "text" && part.text)
    .map((part) => (part as { type: "text"; text: string }).text)
    .join("\n");
}

// 辅助函数：解决 template 中直接使用 as unknown as 导致的高亮错乱问题
const castToAsset = (val: any): Asset => val as Asset;
const castToAssetArray = (val: any): Asset[] => val as Asset[];

/**
 * 计算附件是否会使用转写
 * 在上下文分析器中，我们使用当前 Agent 的模型信息
 * @param asset 附件对象
 * @param messageDepth 消息深度（用于判断是否触发强制转写）
 */
const getWillUseTranscription = (
  asset: any,
  messageDepth?: number
): boolean => {
  // 确保 asset 有必要的字段
  if (!asset || typeof asset !== "object") {
    return true; // 无效资产，默认需要转写
  }

  const { modelId, profileId } = props.contextData.agentInfo;
  if (!modelId || !profileId) {
    return true; // 如果没有模型信息，默认需要转写
  }

  // 使用类型断言，因为上下文预览数据中的附件对象可能缺少某些字段
  // 但 computeWillUseTranscription 只需要 type、id、path 等基本字段
  // 这些字段在预览数据中应该都存在
  return computeWillUseTranscription(
    asset as Asset,
    modelId,
    profileId,
    messageDepth
  );
};

/**
 * 获取世界书条目位置的显示文本
 */
function getPositionLabel(
  position: STWorldbookPosition,
  depth?: number
): string {
  switch (position) {
    case STWorldbookPosition.BeforeChar:
      return "角色设定前";
    case STWorldbookPosition.AfterChar:
      return "角色设定后";
    case STWorldbookPosition.BeforeAN:
      return "作者注释前";
    case STWorldbookPosition.AfterAN:
      return "作者注释后";
    case STWorldbookPosition.Depth:
      return `深度 ${depth ?? 0}`;
    case STWorldbookPosition.BeforeEM:
      return "示例消息前";
    case STWorldbookPosition.AfterEM:
      return "示例消息后";
    case STWorldbookPosition.Outlet:
      return "Outlet";
    default:
      return "未知位置";
  }
}
</script>

<style scoped>
.structured-view {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-header {
  font-weight: bold;
  color: var(--el-text-color-primary);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.header-tags {
  display: flex;
  gap: 8px;
  align-items: center;
}

.agent-info {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}

.agent-details {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 12px;
  justify-content: center;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.label {
  font-weight: 500;
  color: var(--el-text-color-secondary);
  min-width: 80px;
}

.value {
  color: var(--el-text-color-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.value-icon {
  width: 16px;
  height: 16px;
  object-fit: contain;
  flex-shrink: 0;
  border-radius: 3px;
}

.agent-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 4px;
}

.icon-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.icon-emoji {
  font-size: 18px;
  line-height: 1;
}

.stats-card {
  margin-bottom: 8px;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 4px;
}

.stat-value {
  font-size: 20px;
  font-weight: bold;
  color: var(--el-color-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}

.stat-item.primary .stat-value {
  color: var(--el-color-success);
}

.stat-item.warning .stat-value {
  color: var(--el-color-warning);
}

.stat-item.attachment .stat-value {
  color: var(--el-color-warning);
}

.char-count {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
  margin-top: 2px;
}

.saved-count {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-color-success);
  margin-top: 2px;
}

/* 角色分布 stat */
.role-breakdown {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
  font-size: 12px;
  font-weight: normal;
}

.role-tag {
  letter-spacing: 0.5px;
}

.role-tag-system {
  color: var(--el-color-info);
  border-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}

.role-tag-user {
  color: var(--el-color-success);
  border-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}

.role-tag-assistant {
  color: var(--el-color-primary);
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.1)
  );
}

.section {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 16px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  padding-bottom: 8px;
  border-bottom: 2px solid var(--el-border-color);
}

/* ============ 工具栏：搜索 + 锚点 ============ */
.messages-toolbar {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
  background-color: var(--card-bg, var(--el-fill-color-blank));
  backdrop-filter: blur(var(--ui-blur, 0));
  border-bottom: 1px solid var(--border-color, var(--el-border-color-lighter));
}

.search-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 240px;
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.match-count {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
}

.match-total {
  margin-left: 6px;
  color: var(--el-text-color-placeholder);
}

.anchors-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 96px;
  overflow-y: auto;
}

.anchor-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  line-height: 1.4;
  font-family: var(--el-font-family-monospace);
  border-radius: 12px;
  border: 1px solid var(--el-border-color-lighter);
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  );
  color: var(--el-text-color-primary);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  white-space: nowrap;
}

.anchor-chip:hover {
  transform: translateY(-1px);
  filter: brightness(1.05);
}

.anchor-index {
  color: var(--el-text-color-placeholder);
  font-size: 11px;
}

.anchor-role {
  font-weight: 600;
  letter-spacing: 0.4px;
}

.anchor-chip.role-system {
  background-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.12)
  );
  color: var(--el-color-info);
  border-color: rgba(
    var(--el-color-info-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
}

.anchor-chip.role-user {
  background-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.12)
  );
  color: var(--el-color-success);
  border-color: rgba(
    var(--el-color-success-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
}

.anchor-chip.role-assistant {
  background-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.12)
  );
  color: var(--el-color-primary);
  border-color: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity, 1) * 0.4)
  );
}

.anchor-chip.has-match {
  box-shadow: 0 0 0 1px var(--el-color-warning) inset;
}

.anchor-chip.is-current {
  outline: 2px solid var(--el-color-warning);
  outline-offset: 1px;
  transform: translateY(-1px);
}

.anchor-match-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background-color: var(--el-color-warning);
  margin-left: 2px;
}

/* ============ 消息卡片 ============ */
.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card {
  /* 角色色条作用在 InfoCard 的根元素上，需要使用 deep 或直接利用 class 透传 */
  transition:
    box-shadow 0.2s ease,
    border-color 0.2s ease;
}

.message-card.role-system {
  border-left: 4px solid var(--el-color-info) !important;
}

.message-card.role-user {
  border-left: 4px solid var(--el-color-success) !important;
}

.message-card.role-assistant {
  border-left: 4px solid var(--el-color-primary) !important;
}

.message-card.search-highlight {
  box-shadow: 0 0 0 2px
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity, 1) * 0.6));
}

.message-card.search-current {
  box-shadow: 0 0 0 3px var(--el-color-warning);
}

.message-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  color: var(--el-text-color-primary);
  gap: 8px;
  flex-wrap: wrap;
}

.pending-message-card {
  border: 2px solid
    rgba(var(--el-color-warning-rgb), calc(var(--card-opacity, 1) * 0.6)) !important;
  background-color: rgba(
    var(--el-color-warning-rgb),
    calc(var(--card-opacity, 1) * 0.08)
  ) !important;
}

.macro-diff-section {
  margin-bottom: 12px;
}

.macro-diff-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 8px;
}

.diff-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.diff-label {
  font-size: 12px;
  font-weight: bold;
  color: var(--el-text-color-secondary);
}

.diff-text {
  font-family: var(--el-font-family-monospace);
  font-size: 12px;
  white-space: pre-wrap;
  word-break: break-all;
  padding: 8px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  max-height: 200px;
  overflow-y: auto;
}

.message-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.message-role-name {
  font-size: 14px;
}

.system-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--el-fill-color);
  border-radius: 4px;
  color: var(--el-text-color-secondary);
}

.source-tag {
  margin-left: 4px;
}

.content-type-tag {
  text-transform: uppercase;
  letter-spacing: 0.5px;
  font-size: 10px;
}

.message-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
}

.message-content.is-summary {
  font-style: italic;
  color: var(--el-text-color-secondary);
  background-color: var(--el-fill-color-lighter);
  padding: 12px;
  border-radius: 4px;
  border-left: 4px solid var(--el-border-color);
}

.compression-tag {
  margin-left: 8px;
  font-weight: normal;
}

.compression-details {
  margin-top: 8px;
  display: flex;
  gap: 16px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 4px 8px;
  background-color: var(--el-fill-color-blank);
  border-radius: 4px;
  border: 1px dashed var(--el-border-color-lighter);
}

.detail-item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.detail-item .el-icon {
  font-size: 14px;
}

.attachments-section {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.attachments-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.attachments-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

/* 世界书样式 */
.stat-item.worldbook .stat-value {
  color: var(--el-color-warning);
}

.worldbook-section-card {
  margin-bottom: 8px;
}

.card-header.clickable {
  cursor: pointer;
  user-select: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-icon {
  transition: transform 0.2s ease;
  font-size: 14px;
  color: var(--el-text-color-secondary);
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.expand-icon.small {
  font-size: 12px;
}

.section-icon {
  font-size: 16px;
}

.section-icon.worldbook-color {
  color: var(--el-color-warning);
}

.worldbook-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 8px;
}

.worldbook-entry {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  background-color: var(--el-fill-color-blank);
}

.entry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  cursor: pointer;
  user-select: none;
  background-color: var(--el-fill-color-light);
  transition: background-color 0.2s;
}

.entry-header:hover {
  background-color: var(--el-fill-color);
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.entry-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 200px;
}

.entry-source-tag {
  opacity: 0.8;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.entry-details {
  padding: 12px;
  border-top: 1px solid var(--el-border-color-lighter);
}

.worldbook-keywords {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 12px;
}

.keyword-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.keyword-icon {
  font-size: 14px;
  color: var(--el-color-primary);
}

.keyword-label {
  font-weight: 500;
  min-width: 36px;
}

.keyword-tag {
  font-size: 11px;
}

.more-keywords {
  font-size: 11px;
  color: var(--el-text-color-placeholder);
}

.worldbook-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-height: 200px;
  overflow-y: auto;
  line-height: 1.6;
  font-size: 12px;
  background-color: var(--el-fill-color-lighter);
  padding: 10px;
  border-radius: 4px;
  border-left: 3px solid var(--el-color-warning);
}
</style>
