<template>
  <div class="structured-view">
    <!-- Agent 信息 -->
    <InfoCard title="智能体信息" class="agent-info-card">
      <div class="agent-info">
        <Avatar
          v-if="contextData.agentInfo.icon"
          :src="
            resolveAvatarPath(
              { id: contextData.agentInfo.id, icon: contextData.agentInfo.icon },
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
              {{ contextData.agentInfo.profileName || agentProfile?.name || "未知配置" }}
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
          <el-tag v-if="contextData.statistics.tokenizerName" size="small" type="info">
            {{ contextData.statistics.isEstimated ? "字符估算" : "Token 计算" }} -
            {{ contextData.statistics.tokenizerName }}
          </el-tag>
        </div>
      </template>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">总消息数</div>
          <div class="stat-value">{{ contextData.statistics.messageCount }}</div>
        </div>
        <div v-if="contextData.statistics.totalTokenCount !== undefined" class="stat-item primary">
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
          <div class="stat-value">{{ contextData.statistics.totalCharCount.toLocaleString() }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">预设消息</div>
          <div class="stat-value">
            <template v-if="contextData.statistics.presetMessagesTokenCount !== undefined">
              {{ contextData.statistics.presetMessagesTokenCount.toLocaleString() }} tokens
              <span class="char-count">
                {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
              </span>
            </template>
            <template v-else>
              {{ contextData.statistics.presetMessagesCharCount.toLocaleString() }} 字符
            </template>
          </div>
        </div>
        <div class="stat-item">
          <div class="stat-label">会话历史</div>
          <div class="stat-value">
            <template v-if="contextData.statistics.chatHistoryTokenCount !== undefined">
              {{ contextData.statistics.chatHistoryTokenCount.toLocaleString() }} tokens
              <span class="char-count">
                {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
              </span>
            </template>
            <template v-else>
              {{ contextData.statistics.chatHistoryCharCount.toLocaleString() }} 字符
            </template>
          </div>
        </div>
        <div v-if="contextData.statistics.postProcessingTokenCount !== undefined" class="stat-item">
          <div class="stat-label">后处理消耗</div>
          <div class="stat-value">
            {{ contextData.statistics.postProcessingTokenCount.toLocaleString() }} tokens
            <span
              class="char-count"
              v-if="contextData.statistics.postProcessingCharCount !== undefined"
            >
              {{ contextData.statistics.postProcessingCharCount.toLocaleString() }} 字符
            </span>
          </div>
        </div>
        <div v-if="contextData.statistics.worldbookEntryCount" class="stat-item worldbook">
          <div class="stat-label">世界书条目</div>
          <div class="stat-value">
            {{ contextData.statistics.worldbookEntryCount }} 条
            <span class="char-count" v-if="contextData.statistics.worldbookTokenCount">
              {{ contextData.statistics.worldbookTokenCount.toLocaleString() }} tokens
              <template v-if="contextData.statistics.worldbookCharCount">
                / {{ contextData.statistics.worldbookCharCount.toLocaleString() }} 字符
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
            <span class="saved-count" v-if="contextData.statistics.savedTokenCount !== undefined">
              节省 {{ contextData.statistics.savedTokenCount.toLocaleString() }} tokens
            </span>
          </div>
        </div>
      </div>
    </InfoCard>

    <!-- 世界书条目 -->
    <InfoCard
      v-if="contextData.worldbookEntries && contextData.worldbookEntries.length > 0"
      class="worldbook-section-card"
    >
      <template #header>
        <div class="card-header clickable" @click="worldbookExpanded = !worldbookExpanded">
          <div class="header-left">
            <el-icon class="expand-icon" :class="{ expanded: worldbookExpanded }">
              <ArrowRight />
            </el-icon>
            <el-icon class="section-icon worldbook-color"><MagicStick /></el-icon>
            <span>激活的世界书条目</span>
          </div>
          <div class="header-tags">
            <el-tag size="small" type="warning">
              {{ contextData.worldbookEntries.length }} 条
            </el-tag>
            <el-tag v-if="contextData.statistics.worldbookTokenCount" size="small" type="success">
              {{ contextData.statistics.worldbookTokenCount.toLocaleString() }} tokens
            </el-tag>
            <el-tag v-if="contextData.statistics.worldbookCharCount" size="small" type="info">
              {{ contextData.statistics.worldbookCharCount.toLocaleString() }} 字符
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
                <el-tag v-if="entry.constant" size="small" type="danger" effect="dark">
                  常量
                </el-tag>
                <el-tag size="small" type="info" effect="plain" class="entry-source-tag">
                  {{ entry.worldbookName }}
                </el-tag>
              </div>
              <div class="entry-meta">
                <el-tag size="small" type="warning" effect="plain">
                  {{ getPositionLabel(entry.position, entry.depth) }}
                </el-tag>
                <el-tag v-if="entry.tokenCount !== undefined" size="small" type="success">
                  {{ entry.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info"> {{ entry.charCount }} 字符 </el-tag>
              </div>
            </div>
            <el-collapse-transition>
              <div v-show="expandedEntries.has(entry.uid)" class="entry-details">
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
                  <div v-if="entry.keysecondary.length > 0" class="keyword-group">
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
                    <span v-if="entry.keysecondary.length > 5" class="more-keywords">
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
          <el-tag size="small" type="primary"> {{ unifiedMessages.length }} 条消息 </el-tag>
          <el-tag
            v-if="contextData.statistics.totalTokenCount !== undefined"
            size="small"
            type="success"
          >
            {{ contextData.statistics.totalTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
      </div>
      <div class="messages-list">
        <InfoCard v-for="(msg, index) in unifiedMessages" :key="msg.key" class="message-card">
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
                <el-tag v-if="msg.nonTextCount > 0" size="small" type="warning" effect="plain">
                  +{{ msg.nonTextCount }} 非文本
                </el-tag>
                <el-tag v-if="msg.tokenCount !== undefined" size="small" type="success">
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info"> {{ msg.charCount }} 字符 </el-tag>
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
          <div class="message-content" :class="{ 'is-summary': msg.isCompressionNode }">
            {{ getDisplayContent(msg.content) }}
          </div>
          <!-- 附件分析（仅会话历史消息有） -->
          <div v-if="msg.attachments && msg.attachments.length > 0" class="attachments-section">
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
                :will-use-transcription="getWillUseTranscription(att, msg.messageDepth)"
              />
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { Setting, ChatLineRound, MagicStick, Key, ArrowRight } from "@element-plus/icons-vue";
import InfoCard from "@/components/common/InfoCard.vue";
import Avatar from "@/components/common/Avatar.vue";
import AttachmentCard from "../AttachmentCard.vue";
import type { ContextPreviewData } from "../../types/context";
import type { Asset } from "@/types/asset-management";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";
import type { LlmMessageContent } from "@/llm-apis/common";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { useUserProfileStore } from "../../userProfileStore";
import { useTranscriptionManager } from "../../composables/useTranscriptionManager";
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
  return expandedEntries.value.size >= props.contextData.worldbookEntries.length;
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

const { getModelIcon, getModelProperty, getIconPath, getDisplayIconPath } = useModelMetadata();
const { computeWillUseTranscription } = useTranscriptionManager();

const agentProfile = computed(() => {
  if (!props.contextData.agentInfo.profileId) return undefined;
  return getProfileById(props.contextData.agentInfo.profileId);
});

const agentModel = computed(() => {
  if (!agentProfile.value || !props.contextData.agentInfo.modelId) return undefined;
  return agentProfile.value.models.find((m) => m.id === props.contextData.agentInfo.modelId);
});

const modelDisplayName = computed(() => {
  // 1. 优先使用快照中的模型名称
  if (props.contextData.agentInfo.modelName) {
    return props.contextData.agentInfo.modelName;
  }
  // 2. 如果快照没有，再尝试从当前配置获取（用于兼容旧数据）
  if (agentModel.value) {
    return (
      getModelProperty(agentModel.value, "name") || agentModel.value.name || agentModel.value.id
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

  // 2. 尝试获取全局用户配置
  const globalProfile = userProfileStore.globalProfile;
  if (globalProfile) {
    // 适配：UserProfile 的 name 是内部ID，displayName 才是显示名
    return {
      name: globalProfile.displayName || globalProfile.name,
      icon: globalProfile.icon,
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
    };

    // 计算字符数和非文本内容数
    let contentStr = "";
    if (typeof finalMsg.content === "string") {
      contentStr = finalMsg.content;
    } else if (Array.isArray(finalMsg.content)) {
      // 只提取文本部分，避免 Base64 导致字符数虚高
      const textParts = finalMsg.content.filter(
        (p): p is { type: "text"; text: string } => p.type === "text" && !!p.text
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

        if (sourceMsg.sourceType === "agent_preset" && sourceMsg.sourceIndex !== undefined) {
          sourceData = presetMap.get(sourceMsg.sourceIndex);
          source = "agent_preset"; // 只要含预设，整体即为预设来源（优先级更高）
        } else if (sourceMsg.sourceType === "session_history" && sourceMsg.sourceId) {
          sourceData = historyMap.get(String(sourceMsg.sourceId));
          if (source !== "agent_preset") source = "session_history";
        }

        if (sourceData) {
          // 1. 累加 Token
          if (sourceData.tokenCount) totalTokenCount += sourceData.tokenCount;

          // 2. 提取身份信息 (仅当尚未提取到时，优先取第一个非空的)
          if (mergedRole === "user") {
            if (!userName && sourceData.userName) userName = sourceData.userName;
            if (!userIcon && sourceData.userIcon) userIcon = sourceData.userIcon;
          } else if (mergedRole === "assistant") {
            // 注意：preset 数据结构中通常没有 agentName/Icon，访问 undefined 也没关系
            if (!agentName && sourceData.agentName) agentName = sourceData.agentName;
            if (!agentIcon && sourceData.agentIcon) agentIcon = sourceData.agentIcon;
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
      if (result.role === "user" && !result.userName && fallbackUserInfo.value) {
        result.userName = fallbackUserInfo.value.name;
        result.userIcon = fallbackUserInfo.value.icon;
      }

      return result;
    } else if (finalMsg.sourceType === "agent_preset" && finalMsg.sourceIndex !== undefined) {
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
        if (result.role === "user" && !result.userName && fallbackUserInfo.value) {
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
          attachments: history.attachments,
          messageDepth: historyDepthMap.get(history.nodeId),
        };
      }
    } else if (
      (finalMsg.sourceType === "depth_injection" || finalMsg.sourceType === "anchor_injection") &&
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
      { id: props.contextData.agentInfo.id, icon: props.contextData.agentInfo.icon },
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
function getSourceTagType(source: UnifiedMessage["source"]): "warning" | "success" | "info" {
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
  if (msg.source === "agent_preset" && msg._mergedSources && msg._mergedSources.length > 1) {
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
const getWillUseTranscription = (asset: any, messageDepth?: number): boolean => {
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
  return computeWillUseTranscription(asset as Asset, modelId, profileId, messageDepth);
};

/**
 * 获取世界书条目位置的显示文本
 */
function getPositionLabel(position: STWorldbookPosition, depth?: number): string {
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

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.message-title {
  display: flex;
  align-items: center;
  gap: 8px;
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
