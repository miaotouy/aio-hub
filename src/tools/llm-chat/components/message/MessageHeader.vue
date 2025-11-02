<script setup lang="ts">
import { computed } from 'vue';
import { Loader2 } from 'lucide-vue-next';
import type { ChatMessageNode } from '../../types';
import { useAgentStore } from '../../agentStore';
import { useUserProfileStore } from '../../userProfileStore';
import { useLlmProfiles } from '@/composables/useLlmProfiles';
import { useModelMetadata } from '@/composables/useModelMetadata';
import { useChatSettings } from '../../composables/useChatSettings';
import Avatar from '@/components/common/Avatar.vue';
import DynamicIcon from '@/components/common/DynamicIcon.vue';

interface Props {
  message: ChatMessageNode;
}

const props = defineProps<Props>();

const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();
const { getProfileById } = useLlmProfiles();
const { getModelIcon } = useModelMetadata();
const { settings } = useChatSettings();

// 获取消息关联的智能体信息
const agent = computed(() => {
  const agentId = props.message.metadata?.agentId;
  if (!agentId) return null;
  return agentStore.getAgentById(agentId);
});

// 获取消息生成时使用的 Profile 和 Model 信息
const agentProfileInfo = computed(() => {
  const metadata = props.message.metadata;
  if (!metadata) return null;
  
  // 优先从消息元数据中读取 profileId 和 modelId
  const profileId = metadata.profileId;
  const modelId = metadata.modelId;
  
  // 如果元数据中没有，回退到从智能体读取（兼容旧消息）
  const fallbackProfileId = agent.value?.profileId;
  const fallbackModelId = agent.value?.modelId;
  
  const actualProfileId = profileId || fallbackProfileId;
  const actualModelId = modelId || fallbackModelId;
  
  if (!actualProfileId || !actualModelId) return null;
  
  const profile = getProfileById(actualProfileId);
  if (!profile) return null;
  
  const model = profile.models.find(m => m.id === actualModelId);
  if (!model) return null;
  
  // 获取模型图标
  const modelIcon = getModelIcon(model);
  
  // 获取渠道图标（Profile 的 icon 或 logoUrl）
  const profileIcon = profile.icon || profile.logoUrl;
  
  // 优先使用元数据中的模型名称，如果没有则使用 model 对象的名称
  const displayModelName = metadata.modelName || model.name || model.id;
  
  return {
    profileName: profile.name,
    profileIcon: profileIcon,
    modelName: displayModelName,
    modelIcon: modelIcon
  };
});

// 格式化时间
const formatTime = (timestamp: string) => {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });
};

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
  if (props.message.role === 'user') {
    // 优先使用消息元数据中的用户档案快照
    if (props.message.metadata?.userProfileName) {
      return props.message.metadata.userProfileName;
    }
    // 回退到当前生效的用户档案
    if (effectiveUserProfile.value) {
      return effectiveUserProfile.value.name;
    }
    // 最后使用默认值
    return '你';
  } else if (props.message.role === 'assistant') {
    // 优先使用消息元数据中的快照，如果不存在则从 Agent Store 获取（兼容旧消息）
    return props.message.metadata?.agentName || agent.value?.name || '助手';
  } else {
    return '系统';
  }
});

const displayIcon = computed(() => {
  if (props.message.role === 'user') {
    // 优先使用消息元数据中的用户档案快照
    if (props.message.metadata?.userProfileIcon) {
      return props.message.metadata.userProfileIcon;
    }
    // 回退到当前生效的用户档案
    if (effectiveUserProfile.value?.icon) {
      return effectiveUserProfile.value.icon;
    }
    // 最后使用默认值
    return '👤';
  } else if (props.message.role === 'assistant') {
    // 优先使用消息元数据中的快照，如果不存在则从 Agent Store 获取（兼容旧消息）
    return props.message.metadata?.agentIcon || agent.value?.icon || '🤖';
  } else {
    return '⚙️';
  }
});

// 检查是否应该显示副标题（基于设置和数据可用性）
const shouldShowSubtitle = computed(() => {
  return settings.value.uiPreferences.showModelInfo &&
         props.message.role === 'assistant' &&
         !!agentProfileInfo.value;
});
</script>

<template>
  <div class="message-header">
    <div class="header-left">
      <Avatar
        :src="displayIcon"
        :alt="displayName"
        :size="40"
        shape="square"
        :radius="6"
      />
      <div class="message-info">
        <span class="message-name">{{ displayName }}</span>
        <div v-if="shouldShowSubtitle && agentProfileInfo" class="message-subtitle">
          <!-- 模型信息 -->
          <div class="subtitle-item">
            <DynamicIcon
              v-if="agentProfileInfo.modelIcon"
              :src="agentProfileInfo.modelIcon"
              :alt="agentProfileInfo.modelName"
              class="subtitle-icon"
              @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
            />
            <span class="subtitle-text">{{ agentProfileInfo.modelName }}</span>
          </div>
          <!-- 分隔符 -->
          <span class="subtitle-separator">·</span>
          <!-- 渠道信息 -->
          <div class="subtitle-item">
            <DynamicIcon
              v-if="agentProfileInfo.profileIcon"
              :src="agentProfileInfo.profileIcon"
              :alt="agentProfileInfo.profileName"
              class="subtitle-icon"
              @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
            />
            <span class="subtitle-text">{{ agentProfileInfo.profileName }}</span>
          </div>
        </div>
      </div>
    </div>
    
    <!-- 生成状态指示器 -->
    <div v-if="message.status === 'generating'" class="generating-indicator">
      <Loader2 :size="14" class="spinning-icon" />
      <span class="generating-text">生成中</span>
    </div>
    
    <span v-if="settings.uiPreferences.showTimestamp" class="message-time">{{ formatTime(message.timestamp) }}</span>
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

.generating-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 12px;
  background-color: var(--primary-color);
  color: white;
  font-size: 11px;
  font-weight: 500;
  margin-left: auto;
  margin-right: 8px;
}

.spinning-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.generating-text {
  white-space: nowrap;
}

.message-time {
  color: var(--text-color-light);
  font-size: 12px;
  flex-shrink: 0;
}
</style>