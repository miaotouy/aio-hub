<script setup lang="ts">
import { computed } from "vue";
import type { MediaMessage } from "../../types";
import { useModelMetadata } from "@/composables/useModelMetadata";
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import { useUserProfileStore } from "@/tools/llm-chat/stores/userProfileStore";
import Avatar from "@/components/common/Avatar.vue";
import DynamicIcon from "@/components/common/DynamicIcon.vue";
import { Bot, Clock } from "lucide-vue-next";
import { format } from "date-fns";

interface Props {
  message: MediaMessage;
}

const props = defineProps<Props>();

const { getIconPath, getDisplayIconPath } = useModelMetadata();
const { getProfileById } = useLlmProfiles();
const userProfileStore = useUserProfileStore();

// 获取当前任务快照
const task = computed(() => props.message.metadata?.taskSnapshot);

// 获取模型和渠道信息
const agentProfileInfo = computed(() => {
  if (props.message.role !== "assistant") return null;

  const metadata = props.message.metadata;
  const taskData = task.value;

  // 1. 获取模型信息
  const modelId = metadata?.modelId || taskData?.input?.modelId;
  const modelName =
    metadata?.modelDisplayName || metadata?.modelName || taskData?.input?.modelId || "生成助手";

  let modelIcon: string | null = null;
  if (modelId) {
    const iconPath = getIconPath(modelId);
    modelIcon = iconPath ? getDisplayIconPath(iconPath) : null;
  }

  // 2. 获取渠道信息
  const profileId = metadata?.profileId || taskData?.input?.profileId;
  const profile = profileId ? getProfileById(profileId) : null;
  const profileName = metadata?.profileDisplayName || profile?.name || profileId;
  const profileIcon = profile?.icon || profile?.logoUrl || null;

  return {
    modelName,
    modelIcon,
    profileName,
    profileIcon,
  };
});

const displayName = computed(() => {
  if (props.message.role === "user") {
    return (
      userProfileStore.globalProfile?.displayName || userProfileStore.globalProfile?.name || "你"
    );
  }

  // 助手侧直接显示模型名称，不再重复显示
  return agentProfileInfo.value?.modelName || "生成助手";
});

const displayTimestamp = computed(() => {
  const ts = props.message.timestamp;
  if (!ts) return new Date();
  return typeof ts === "string" ? new Date(ts) : new Date(ts);
});

// 耗时统计
const duration = computed(() => {
  if (task.value?.completedAt && task.value?.createdAt) {
    return ((task.value.completedAt - task.value.createdAt) / 1000).toFixed(1);
  }
  return null;
});
</script>

<template>
  <div class="message-header" :class="[message.role]">
    <div class="header-left">
      <!-- 助手侧直接使用模型图标作为标识 -->
      <div v-if="message.role === 'assistant'" class="model-icon-wrapper">
        <DynamicIcon
          v-if="agentProfileInfo?.modelIcon"
          :src="agentProfileInfo.modelIcon"
          :alt="agentProfileInfo.modelName"
          class="model-icon"
        />
        <Bot v-else :size="18" class="fallback-icon" />
      </div>

      <!-- 用户侧保留小头像 -->
      <Avatar
        v-else
        :src="userProfileStore.globalProfile?.icon || ''"
        :size="32"
        :alt="displayName"
        shape="square"
        :radius="6"
        class="user-avatar"
      />

      <div class="message-info-row">
        <span class="message-name">{{ displayName }}</span>

        <div v-if="message.role === 'assistant' && agentProfileInfo" class="assistant-meta">
          <!-- 渠道信息 -->
          <div v-if="agentProfileInfo.profileName" class="meta-item profile-tag">
            <DynamicIcon
              :src="agentProfileInfo.profileIcon || ''"
              :alt="agentProfileInfo.profileName"
              class="meta-icon"
            />
            <span class="meta-text">{{ agentProfileInfo.profileName }}</span>
          </div>

          <!-- 性能统计 -->
          <div v-if="duration" class="meta-item stats-tag">
            <Clock :size="11" />
            <span class="meta-text">{{ duration }}s</span>
          </div>
        </div>
      </div>
    </div>

    <div class="header-right">
      <span class="message-time">{{ format(displayTimestamp, "MM-dd HH:mm") }}</span>
      <!-- 预留给其他操作 -->
    </div>
  </div>
</template>

<style scoped>
.message-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.model-icon-wrapper {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background-color: var(--bg-color-soft);
  border: 1px solid var(--border-color);
  border-radius: 6px;
}

.model-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.fallback-icon {
  color: var(--text-color-secondary);
  opacity: 0.7;
}

.user-avatar {
  border: 1px solid var(--border-color);
  background-color: var(--bg-color-soft);
  flex-shrink: 0;
}

.message-info-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.message-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.message-time {
  color: var(--text-color-tertiary);
  font-size: 12px;
  font-weight: normal;
  white-space: nowrap;
}

.assistant-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.meta-icon {
  width: 14px;
  height: 14px;
  object-fit: contain;
  flex-shrink: 0;
}

.meta-text {
  white-space: nowrap;
}

.profile-tag {
  color: var(--primary-color);
  background-color: var(--primary-color-light);
  padding: 0px 5px;
  border-radius: 4px;
  line-height: 1.4;
}

.stats-tag {
  font-family: var(--font-family-mono);
  opacity: 0.8;
  background-color: var(--bg-color-soft);
  padding: 0px 5px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  line-height: 1.4;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
</style>
