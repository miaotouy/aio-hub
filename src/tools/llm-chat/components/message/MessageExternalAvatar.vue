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

<script setup lang="ts">
/**
 * 外置头像组件 (Bubble Mode - Outside Avatar)
 *
 * 用于气泡模式下渲染独立于气泡的头像。
 * - 仅对 user / assistant 渲染真正的头像
 * - 其他角色 (tool / system / compression) 渲染同尺寸的透明占位，保持气泡的左右对齐
 */
import { computed } from "vue";
import type { ChatMessageNode } from "../../types";
import { useAgentStore } from "../../stores/agentStore";
import { useUserProfileStore } from "../../stores/userProfileStore";
import { useResolvedAvatar } from "../../composables/ui/useResolvedAvatar";
import Avatar from "@/components/common/Avatar.vue";

interface Props {
  message: ChatMessageNode;
  /** 头像尺寸 (px) */
  size: number;
}

const props = defineProps<Props>();

const agentStore = useAgentStore();
const userProfileStore = useUserProfileStore();

const role = computed(() => props.message.role);

const isRenderableRole = computed(
  () => role.value === "user" || role.value === "assistant"
);

// 当前 agent (使用消息快照或当前激活的 agent)
const agent = computed(() => {
  const agentId = props.message.metadata?.agentId;
  if (!agentId) return null;
  return agentStore.getAgentById(agentId);
});

// 当前生效的用户档案
const effectiveUserProfile = computed(() => {
  return userProfileStore.getEffectiveProfile(agent.value?.userProfileId);
});

// user 头像目标 (优先消息快照，回退当前档案)
const userAvatarTarget = computed(() => {
  const metadata = props.message.metadata;
  if (metadata?.userProfileIcon && metadata.userProfileId) {
    return {
      id: metadata.userProfileId,
      icon: metadata.userProfileIcon,
    };
  }
  return effectiveUserProfile.value;
});

// assistant 头像目标
const assistantAvatarTarget = computed(() => {
  const metadata = props.message.metadata;
  if (metadata?.agentIcon && metadata.agentId) {
    return {
      id: metadata.agentId,
      icon: metadata.agentIcon,
    };
  }
  return agent.value;
});

const userAvatarSrc = useResolvedAvatar(userAvatarTarget, "user-profile");
const assistantAvatarSrc = useResolvedAvatar(assistantAvatarTarget, "agent");

const resolvedAvatar = computed(() => {
  if (role.value === "user") return userAvatarSrc.value;
  if (role.value === "assistant") return assistantAvatarSrc.value;
  return "";
});

const nameForAlt = computed(() => {
  if (role.value === "user") {
    return (
      props.message.metadata?.userProfileDisplayName ||
      props.message.metadata?.userProfileName ||
      effectiveUserProfile.value?.displayName ||
      effectiveUserProfile.value?.name ||
      "U"
    );
  }
  if (role.value === "assistant") {
    return (
      props.message.metadata?.agentDisplayName ||
      props.message.metadata?.agentName ||
      agent.value?.displayName ||
      agent.value?.name ||
      "A"
    );
  }
  return "";
});
</script>

<template>
  <div
    class="message-external-avatar"
    :style="{ width: `${size}px`, height: `${size}px` }"
  >
    <Avatar
      v-if="isRenderableRole"
      :src="typeof resolvedAvatar === 'string' ? resolvedAvatar : ''"
      :alt="nameForAlt"
      :size="size"
      shape="circle"
    />
    <!-- 非 user/assistant 角色：渲染同尺寸透明占位以保持对齐 -->
    <div v-else class="avatar-placeholder" />
  </div>
</template>

<style scoped>
.message-external-avatar {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar-placeholder {
  width: 100%;
  height: 100%;
  /* 透明占位，不显示任何视觉元素 */
}
</style>
