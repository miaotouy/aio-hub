<script setup lang="ts">
import { computed } from "vue";
import type { ChatMessageNode } from "../../types";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import Avatar from "@/components/common/Avatar.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { useResolvedAvatar } from "../../composables/ui/useResolvedAvatar";
import { formatRelativeTime } from "@/utils/time";

interface Props {
  message: ChatMessageNode;
}

const props = defineProps<Props>();

const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();
const { getProfileById } = useLlmProfiles();
const { getIconPath, getDisplayIconPath } = useModelMetadata();
const { settings } = useChatSettings();

// 获取消息关联的智能体信息
const agent = computed(() => {
  const agentId = props.message.metadata?.agentId;
  if (!agentId) return null;
  return agentStore.getAgentById(agentId);
});

// 获取消息生成时使用的 Profile 和 Model 信息
// 核心原则：优先使用元数据中的快照信息（名称），图标通过模型 ID 匹配规则获取
const agentProfileInfo = computed(() => {
  const metadata = props.message.metadata;
  if (!metadata) return null;

  // 从元数据快照中获取显示名称（这是最可靠的来源）
  const snapshotModelName = metadata.modelDisplayName || metadata.modelName;
  const snapshotProfileName = metadata.profileDisplayName || metadata.profileName;

  // 获取模型 ID 和提供商类型（用于图标匹配）
  const modelId = metadata.modelId || agent.value?.modelId;
  const providerType = metadata.providerType;

  // 如果元数据中连名称都没有，尝试从当前配置中获取（兼容旧消息）
  const profileId = metadata.profileId || agent.value?.profileId;
  const profile = profileId ? getProfileById(profileId) : null;
  const model = profile?.models.find((m) => m.id === modelId);

  // 确定最终显示的名称：优先元数据快照，其次当前配置
  const displayModelName = snapshotModelName || model?.name || model?.id || modelId;
  const displayProfileName = snapshotProfileName || profile?.name || profileId;

  // 如果连名称都无法确定，则不显示副标题
  if (!displayModelName && !displayProfileName) return null;

  // 获取模型图标：优先通过模型 ID 匹配规则，无需依赖 model 对象
  let modelIcon: string | null = null;
  if (modelId) {
    const iconPath = getIconPath(modelId, providerType);
    modelIcon = iconPath ? getDisplayIconPath(iconPath) : null;
  }

  // 获取渠道图标
  const profileIcon = profile?.icon || profile?.logoUrl || null;

  return {
    profileName: displayProfileName,
    profileIcon: profileIcon,
    modelName: displayModelName,
    modelIcon: modelIcon,
  };
});

// 获取当前生效的用户档案（用于兼容旧消息）
const effectiveUserProfile = computed(() => {
  // 优先使用智能体绑定的用户档案
  if (agent.value?.userProfileId) {
    const profile = userProfileStore.getProfileById(agent.value.userProfileId);
    if (profile) return profile;
  }

  // 回退到全局用户档案
  return userProfileStore.globalProfile;
});

// 根据角色决定显示的名称和图标
const displayName = computed(() => {
  if (props.message.role === "user") {
    // 优先使用消息元数据中的用户档案快照
    if (props.message.metadata?.userProfileDisplayName || props.message.metadata?.userProfileName) {
      return props.message.metadata.userProfileDisplayName || props.message.metadata.userProfileName;
    }
    // 回退到当前生效的用户档案
    if (effectiveUserProfile.value) {
      return effectiveUserProfile.value.displayName || effectiveUserProfile.value.name;
    }
    // 最后使用默认值
    return "你";
  } else if (props.message.role === "assistant") {
    // 优先使用消息元数据中的快照，如果不存在则从 Agent Store 获取（兼容旧消息）
    return (
      props.message.metadata?.agentDisplayName ||
      props.message.metadata?.agentName ||
      agent.value?.displayName ||
      agent.value?.name ||
      "助手"
    );
  } else {
    return "系统";
  }
});

// 根据消息角色和元数据，决定使用哪个对象来解析头像
const userAvatarTarget = computed(() => {
  const { metadata } = props.message;
  // 优先使用消息快照
  if (metadata?.userProfileIcon && metadata.userProfileId) {
    return {
      id: metadata.userProfileId,
      icon: metadata.userProfileIcon,
    };
  }
  // 回退到当前生效的用户档案
  return effectiveUserProfile.value;
});
const assistantAvatarTarget = computed(() => {
  const { metadata } = props.message;
  // 优先使用消息快照
  if (metadata?.agentIcon && metadata.agentId) {
    return {
      id: metadata.agentId,
      icon: metadata.agentIcon,
    };
  }
  // 回退到当前 Agent
  return agent.value;
});

// 使用 useResolvedAvatar 解析最终的头像路径
const userAvatarSrc = useResolvedAvatar(userAvatarTarget, "user-profile");
const assistantAvatarSrc = useResolvedAvatar(assistantAvatarTarget, "agent");

// 根据角色选择最终要显示的图标
const displayIcon = computed(() => {
  if (props.message.role === "user") {
    return userAvatarSrc.value;
  }
  if (props.message.role === "assistant") {
    return assistantAvatarSrc.value;
  }
  return "⚙️"; // 系统消息
});

// 检查是否应该显示副标题（基于设置和数据可用性）
const shouldShowSubtitle = computed(() => {
  return (
    settings.value.uiPreferences.showModelInfo &&
    props.message.role === "assistant" &&
    !!agentProfileInfo.value
  );
});

const nameForAlt = computed(() => {
  if (props.message.role === "user") {
    return (
      props.message.metadata?.userProfileDisplayName ||
      props.message.metadata?.userProfileName ||
      effectiveUserProfile.value?.displayName ||
      effectiveUserProfile.value?.name
    );
  } else if (props.message.role === "assistant") {
    // 从 agent 中获取原始 name，这通常比 displayName 更干净
    return agent.value?.name;
  }
  return "System";
});

// 格式化延迟时间：超过 1000ms 显示为秒
const formatLatency = (ms: number) => {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${ms}ms`;
};
</script>

<template>
  <div class="message-header">
    <div class="header-left">
      <Avatar :src="displayIcon || ''" :alt="nameForAlt" :size="40" shape="square" :radius="6" />
      <div class="message-info">
        <span class="message-name">{{ displayName }}</span>
        <div v-if="shouldShowSubtitle && agentProfileInfo" class="message-subtitle">
          <!-- 模型信息 -->
          <div class="subtitle-item">
            <DynamicIcon
              :src="agentProfileInfo.modelIcon || ''"
              :alt="agentProfileInfo.modelName"
              class="subtitle-icon"
            />
            <span class="subtitle-text">{{ agentProfileInfo.modelName }}</span>
          </div>
          <!-- 分隔符 -->
          <span class="subtitle-separator">·</span>
          <!-- 渠道信息 -->
          <div class="subtitle-item">
            <DynamicIcon
              :src="agentProfileInfo.profileIcon || ''"
              :alt="agentProfileInfo.profileName"
              class="subtitle-icon"
            />
            <span class="subtitle-text">{{ agentProfileInfo.profileName }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="header-right">
      <!-- 性能指标 -->
      <div
        v-if="
          message.status === 'complete' &&
          message.metadata?.tokensPerSecond &&
          settings.uiPreferences.showPerformanceMetrics
        "
        class="performance-stats"
      >
        <el-tooltip content="生成速度" placement="top">
          <span class="stat-item">{{ message.metadata.tokensPerSecond }} t/s</span>
        </el-tooltip>
        <el-tooltip
          v-if="message.metadata.requestStartTime && message.metadata.firstTokenTime"
          content="首字延迟 (TTFT)"
          placement="top"
        >
          <span class="stat-item">
            {{ formatLatency(message.metadata.firstTokenTime - message.metadata.requestStartTime) }}
          </span>
        </el-tooltip>
        <el-tooltip
          v-if="message.metadata.requestStartTime && message.metadata.requestEndTime"
          content="总耗时"
          placement="top"
        >
          <span class="stat-item">
            {{
              (
                (message.metadata.requestEndTime - message.metadata.requestStartTime) /
                1000
              ).toFixed(1)
            }}s
          </span>
        </el-tooltip>
      </div>

      <span v-if="settings.uiPreferences.showTimestamp && message.timestamp" class="message-time">{{
        formatRelativeTime(message.timestamp)
      }}</span>
    </div>
  </div>
</template>

<style scoped>
.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 14px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.message-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  line-height: 1.2;
}

.message-subtitle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-color-secondary);
  line-height: 1.2;
}

.subtitle-item {
  display: flex;
  align-items: center;
  gap: 3px;
}

.subtitle-icon {
  width: 12px;
  height: 12px;
  object-fit: contain;
  flex-shrink: 0;
}

.subtitle-text {
  white-space: nowrap;
}

.subtitle-separator {
  color: var(--text-color-tertiary);
  opacity: 0.5;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
}

.performance-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color-tertiary);
  background-color: var(--bg-color-soft);
  padding: 2px 6px;
  border-radius: 4px;
}

.stat-item {
  white-space: nowrap;
}

.stat-item:not(:last-child)::after {
  content: "|";
  margin-left: 6px;
  opacity: 0.3;
}

.message-time {
  color: var(--text-color-light);
  font-size: 12px;
  flex-shrink: 0;
}
</style>
