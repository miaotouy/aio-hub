<script setup lang="ts">
import { computed, ref, watchEffect } from "vue";
import type { ChatMessageNode } from "../../types";
import type { ChatSessionDetail, ChatSessionIndex } from "../../types/session";
import type { ScreenshotBrandConfig } from "./screenshotTypes";
import Avatar from "@/components/common/Avatar.vue";
import { resolveAvatarPath } from "../../composables/ui/useResolvedAvatar";
import aioIconColor from "@/assets/aio-icon-color.svg";
import { Link } from "lucide-vue-next";
import QRCode from "qrcode";

interface Props {
  brand: ScreenshotBrandConfig;
  sessionIndex: ChatSessionIndex | null;
  sessionDetail: ChatSessionDetail | null;
  messages: ChatMessageNode[];
  position: "top" | "bottom";
}

const props = defineProps<Props>();

// 提取参与的 Agent 和用户
const participants = computed(() => {
  const agentsMap = new Map<
    string,
    { id: string; name: string; icon?: string }
  >();
  const usersMap = new Map<
    string,
    { id: string; name: string; icon?: string }
  >();

  props.messages.forEach((msg) => {
    if (msg.role === "assistant") {
      const agentId = msg.metadata?.agentId || "default-agent";
      if (!agentsMap.has(agentId)) {
        agentsMap.set(agentId, {
          id: agentId,
          name:
            msg.metadata?.agentDisplayName ||
            msg.metadata?.agentName ||
            "Assistant",
          icon: msg.metadata?.agentIcon,
        });
      }
    } else if (msg.role === "user") {
      const userId = msg.metadata?.userProfileId || "default-user";
      if (!usersMap.has(userId)) {
        usersMap.set(userId, {
          id: userId,
          name:
            msg.metadata?.userProfileDisplayName ||
            msg.metadata?.userProfileName ||
            "User",
          icon: msg.metadata?.userProfileIcon,
        });
      }
    }
  });

  return {
    agents: Array.from(agentsMap.values()),
    users: Array.from(usersMap.values()),
  };
});

// 获取会话话题
const topicName = computed(() => {
  return props.sessionIndex?.name || "未命名会话";
});
// 本地生成二维码 Data URL
const qrCodeSrc = ref<string>("");

watchEffect(async () => {
  const url = props.brand.qrCodeUrl || "https://aiohub-app.com";
  try {
    qrCodeSrc.value = await QRCode.toDataURL(url, {
      width: 120,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#ffffff",
      },
    });
  } catch (err) {
    console.error("Failed to generate QR code locally", err);
    qrCodeSrc.value = "";
  }
});

// 官网链接显示文本
const displayUrl = computed(() => {
  const url = props.brand.qrCodeUrl || "https://aiohub-app.com/";
  return url.replace(/^https?:\/\/(www\.)?/, "");
});
</script>

<template>
  <div
    class="screenshot-brand-strip"
    :class="[
      `position-${props.position}`,
      {
        'has-description':
          props.brand.showDescription && props.brand.descriptionText,
      },
    ]"
  >
    <!-- 毛玻璃背景 -->
    <div class="message-background-container">
      <div class="message-background-slice"></div>
    </div>

    <!-- 品牌内容区 -->
    <div class="screenshot-brand-content">
      <!-- 左侧：应用信息 -->
      <div class="brand-left">
        <img
          v-if="props.brand.showLogo"
          :src="aioIconColor"
          class="screenshot-brand-logo"
          alt="AIO Hub"
        />
        <div class="brand-info-text">
          <span class="screenshot-brand-text">{{
            props.brand.text || "AIO Hub"
          }}</span>
          <span
            v-if="props.brand.showDescription && props.brand.descriptionText"
            class="screenshot-brand-desc"
          >
            {{ props.brand.descriptionText }}
          </span>
        </div>
      </div>

      <!-- 中间：话题与参与者 -->
      <div class="brand-middle">
        <!-- 话题 -->
        <div v-if="props.brand.showTopic" class="brand-topic-tag">
          <span class="topic-label">话题</span>
          <span class="topic-value">{{ topicName }}</span>
        </div>

        <!-- 参与者 -->
        <div
          v-if="props.brand.showAgents || props.brand.showUser"
          class="brand-participants"
        >
          <!-- Agents -->
          <div
            v-if="props.brand.showAgents && participants.agents.length > 0"
            class="participant-group"
          >
            <span class="group-label">智能体</span>
            <div class="avatar-stack">
              <div
                v-for="agent in participants.agents"
                :key="agent.id"
                class="avatar-stack-item"
                :title="agent.name"
              >
                <Avatar
                  :size="20"
                  shape="circle"
                  :border="false"
                  :src="resolveAvatarPath(agent, 'agent') ?? ''"
                  :alt="agent.name"
                />
              </div>
            </div>
          </div>

          <!-- Users -->
          <div
            v-if="props.brand.showUser && participants.users.length > 0"
            class="participant-group"
          >
            <span class="group-label">用户</span>
            <div class="avatar-stack">
              <div
                v-for="user in participants.users"
                :key="user.id"
                class="avatar-stack-item"
                :title="user.name"
              >
                <Avatar
                  :size="20"
                  shape="circle"
                  :border="false"
                  :src="resolveAvatarPath(user, 'user-profile') ?? ''"
                  :alt="user.name"
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- 右侧：官网链接或二维码 -->
      <div v-if="props.brand.showQrCode" class="brand-right">
        <div class="qr-code-container">
          <img :src="qrCodeSrc" class="qr-code-img" alt="QR Code" />
          <div class="qr-code-text">
            <span class="qr-title">扫码访问官网</span>
            <span class="qr-url">{{ displayUrl }}</span>
          </div>
        </div>
      </div>
      <div v-else-if="props.brand.qrCodeUrl" class="brand-right link-only">
        <Link :size="12" class="link-icon" />
        <span class="link-text">{{ displayUrl }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.screenshot-brand-strip {
  position: relative;
  display: flex;
  align-items: center;
  padding: 12px 16px;
  border-radius: 12px;
  overflow: hidden;
  margin: 12px 0;
  flex-shrink: 0;
  box-sizing: border-box;
  width: 100%;
}

/* 头/脚外间距控制 */
.position-top {
  margin-top: 0;
  margin-bottom: 12px;
}
.position-bottom {
  margin-top: 12px;
  margin-bottom: 0;
}

/* 内层毛玻璃背景 */
.screenshot-brand-strip > .message-background-container {
  border-radius: 12px;
}

.screenshot-brand-strip :deep(.message-background-container) {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  border-radius: inherit;
  overflow: hidden;
  transform: translateZ(0);
}

.screenshot-brand-strip :deep(.message-background-slice) {
  position: absolute;
  inset: 0;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
  border-radius: inherit;
}

/* 品牌内容区 */
.screenshot-brand-content {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 16px;
}

/* 左侧：应用信息 */
.brand-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.screenshot-brand-logo {
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  display: block;
}

.brand-info-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.screenshot-brand-text {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color-primary, currentColor);
  letter-spacing: 0.4px;
  line-height: 1.2;
}

.screenshot-brand-desc {
  font-size: 11px;
  color: var(--text-color-secondary);
  line-height: 1.2;
}

/* 中间：话题与参与者 */
.brand-middle {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  justify-content: flex-start;
  min-width: 0;
}

/* 话题标签 */
.brand-topic-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: rgba(
    var(--el-color-primary-rgb),
    calc(var(--card-opacity) * 0.08)
  );
  border: 1px solid rgba(var(--el-color-primary-rgb), 0.15);
  padding: 3px 8px;
  border-radius: 6px;
  font-size: 11px;
  max-width: 180px;
  min-width: 0;
}

.topic-label {
  color: var(--el-color-primary);
  font-weight: 600;
  flex-shrink: 0;
}

.topic-value {
  color: var(--text-color-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 参与者 */
.brand-participants {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.participant-group {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.group-label {
  font-size: 11px;
  color: var(--text-color-secondary);
}

.avatar-stack {
  display: flex;
  align-items: center;
}

.avatar-stack-item {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: -6px;
  border: 1.5px solid var(--card-bg);
  border-radius: 50%;
  overflow: hidden;
  transition: transform 0.2s;
  box-sizing: content-box;
}

.avatar-stack-item:last-child {
  margin-right: 0;
}

.avatar-stack-item:hover {
  transform: translateY(-2px);
  z-index: 10;
}

/* 右侧：官网链接或二维码 */
.brand-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
}

.qr-code-container {
  display: flex;
  align-items: center;
  gap: 8px;
  background: rgba(var(--text-color-primary-rgb, 0, 0, 0), 0.03);
  border: 1px solid var(--border-color);
  padding: 4px 8px;
  border-radius: 8px;
}

.qr-code-img {
  width: 36px;
  height: 36px;
  border-radius: 4px;
  background: #ffffff;
  padding: 2px;
  box-sizing: border-box;
}

.qr-code-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.qr-title {
  font-size: 10px;
  font-weight: 600;
  color: var(--text-color-primary);
}

.qr-url {
  font-size: 9px;
  color: var(--text-color-secondary);
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-only {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
  background: rgba(var(--text-color-primary-rgb, 0, 0, 0), 0.03);
  padding: 3px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.link-icon {
  color: var(--text-color-secondary);
}

.link-text {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
