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
          :alt="contextData.agentInfo.name"
          :size="96"
          shape="square"
          :radius="8"
        />
        <div class="agent-details">
          <div class="info-item">
            <span class="label">名称:</span>
            <span class="value">{{ contextData.agentInfo.name || "未命名" }}</span>
          </div>
          <div class="info-item">
            <span class="label">模型:</span>
            <span class="value">{{ contextData.agentInfo.modelId }}</span>
          </div>
          <div class="info-item">
            <span class="label">配置文件:</span>
            <span class="value">{{ contextData.agentInfo.profileId }}</span>
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
            {{ contextData.statistics.isEstimated ? "估算" : "精确" }} -
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
        <div v-if="contextData.statistics.postProcessingTokenCount" class="stat-item">
          <div class="stat-label">后处理消耗</div>
          <div class="stat-value">
            {{ contextData.statistics.postProcessingTokenCount.toLocaleString() }} tokens
            <span class="char-count" v-if="contextData.statistics.postProcessingCharCount">
              {{ contextData.statistics.postProcessingCharCount.toLocaleString() }} 字符
            </span>
          </div>
        </div>
      </div>
    </InfoCard>

    <!-- 预设消息 -->
    <div v-if="contextData.presetMessages.length > 0" class="section">
      <div class="section-title">
        <span>预设对话</span>
        <div class="header-tags">
          <el-tag size="small" type="warning">
            {{ contextData.presetMessages.length }} 条消息
          </el-tag>
          <el-tag
            v-if="contextData.statistics.presetMessagesTokenCount !== undefined"
            size="small"
            type="success"
          >
            {{ contextData.statistics.presetMessagesTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
      </div>
      <div class="messages-list">
        <InfoCard
          v-for="(msg, index) in contextData.presetMessages"
          :key="index"
          class="message-card"
        >
          <template #header>
            <div class="message-card-header">
              <div class="message-title">
                <Avatar
                  v-if="msg.role === 'user'"
                  :src="msg.userIcon || ''"
                  :alt="msg.userName || 'User'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <Avatar
                  v-else
                  :src="
                    resolveAvatarPath(
                      { id: contextData.agentInfo.id, icon: contextData.agentInfo.icon },
                      'agent'
                    ) || ''
                  "
                  :alt="contextData.agentInfo.name || '助手'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <span class="message-role-name">
                  {{
                    msg.role === "user"
                      ? msg.userName || "用户"
                      : contextData.agentInfo.name || "助手"
                  }}
                  #{{ index + 1 }}
                </span>
              </div>
              <div class="header-tags">
                <el-tag v-if="msg.tokenCount !== undefined" size="small" type="success">
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info"> {{ msg.charCount }} 字符 </el-tag>
              </div>
            </div>
          </template>
          <div class="message-content">{{ msg.content }}</div>
        </InfoCard>
      </div>
    </div>

    <!-- 会话历史 -->
    <div v-if="contextData.chatHistory.length > 0" class="section">
      <div class="section-title">
        <span>会话历史</span>
        <div class="header-tags">
          <el-tag size="small" type="success"> {{ contextData.chatHistory.length }} 条消息 </el-tag>
          <el-tag
            v-if="contextData.statistics.chatHistoryTokenCount !== undefined"
            size="small"
            type="success"
          >
            {{ contextData.statistics.chatHistoryTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
      </div>
      <div class="messages-list">
        <InfoCard
          v-for="(msg, index) in contextData.chatHistory"
          :key="msg.nodeId"
          class="message-card"
        >
          <template #header>
            <div class="message-card-header">
              <div class="message-title">
                <Avatar
                  v-if="msg.role === 'user'"
                  :src="msg.userIcon || ''"
                  :alt="msg.userName || 'User'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <Avatar
                  v-else
                  :src="
                    msg.agentIcon ||
                    resolveAvatarPath(
                      { id: contextData.agentInfo.id, icon: contextData.agentInfo.icon },
                      'agent'
                    ) ||
                    ''
                  "
                  :alt="msg.agentName || contextData.agentInfo.name || '助手'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <span class="message-role-name">
                  {{
                    msg.role === "user"
                      ? msg.userName || "用户"
                      : msg.agentName || contextData.agentInfo.name || "助手"
                  }}
                  #{{ index + 1 }}
                </span>
              </div>
              <div class="header-tags">
                <el-tag v-if="msg.tokenCount !== undefined" size="small" type="success">
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info"> {{ msg.charCount }} 字符 </el-tag>
              </div>
            </div>
          </template>
          <div class="message-content">{{ msg.content }}</div>
          <!-- 附件分析 -->
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
              />
            </div>
          </div>
        </InfoCard>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import InfoCard from "@/components/common/InfoCard.vue";
import Avatar from "@/components/common/Avatar.vue";
import AttachmentCard from "../AttachmentCard.vue";
import type { ContextPreviewData } from "../../composables/useChatContextBuilder";
import type { Asset } from "@/types/asset-management";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";

defineProps<{
  contextData: ContextPreviewData;
}>();

// 辅助函数：解决 template 中直接使用 as unknown as 导致的高亮错乱问题
const castToAsset = (val: any): Asset => val as Asset;
const castToAssetArray = (val: any): Asset[] => val as Asset[];
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
  gap: 4px;
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

.char-count {
  font-size: 12px;
  font-weight: normal;
  color: var(--el-text-color-secondary);
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

.message-content {
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
  max-height: 400px;
  overflow-y: auto;
  line-height: 1.6;
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
</style>
