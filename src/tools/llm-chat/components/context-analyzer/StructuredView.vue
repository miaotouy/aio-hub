<template>
  <div class="structured-view">
    <!-- Agent 信息 -->
    <el-card shadow="never" class="agent-info-card">
      <template #header>
        <div class="card-header">
          <span>智能体信息</span>
        </div>
      </template>
      <div class="agent-info">
        <div v-if="contextData.agentInfo.icon" class="agent-avatar">
          <img
            v-if="contextData.agentInfo.icon && (contextData.agentInfo.icon.startsWith('/') || contextData.agentInfo.icon.startsWith('appdata://') || contextData.agentInfo.icon.startsWith('http'))"
            :src="contextData.agentInfo.icon.startsWith('appdata://') ? contextData.agentInfo.icon.replace('appdata://', '/') : contextData.agentInfo.icon"
            alt="Agent Icon"
            class="avatar-image"
            @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
          />
          <span v-else class="avatar-emoji">{{ contextData.agentInfo.icon }}</span>
        </div>
        <div class="agent-details">
          <div class="info-item">
            <span class="label">名称:</span>
            <span class="value">{{ contextData.agentInfo.name || '未命名' }}</span>
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
    </el-card>

    <!-- 统计信息 -->
    <el-card shadow="never" class="stats-card">
      <template #header>
        <div class="card-header">
          <span>上下文统计</span>
        </div>
      </template>
      <div class="stats-grid">
        <div class="stat-item">
          <div class="stat-label">总消息数</div>
          <div class="stat-value">{{ contextData.statistics.messageCount }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">总字符数</div>
          <div class="stat-value">{{ contextData.statistics.totalCharCount.toLocaleString() }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">系统提示</div>
          <div class="stat-value">{{ contextData.statistics.systemPromptCharCount.toLocaleString() }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">预设消息</div>
          <div class="stat-value">{{ contextData.statistics.presetMessagesCharCount.toLocaleString() }}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">会话历史</div>
          <div class="stat-value">{{ contextData.statistics.chatHistoryCharCount.toLocaleString() }}</div>
        </div>
      </div>
    </el-card>

    <!-- 系统提示 -->
    <InfoCard
      v-if="contextData.systemPrompt"
      title="系统提示 (System Prompt)"
      :content="contextData.systemPrompt.content"
    >
      <template #headerExtra>
        <el-tag size="small" type="info">
          {{ contextData.systemPrompt.charCount }} 字符
        </el-tag>
      </template>
    </InfoCard>

    <!-- 预设消息 -->
    <div v-if="contextData.presetMessages.length > 0" class="section">
      <div class="section-title">
        <span>预设对话</span>
        <el-tag size="small" type="warning">
          {{ contextData.presetMessages.length }} 条消息
        </el-tag>
      </div>
      <div class="messages-list">
        <el-card
          v-for="(msg, index) in contextData.presetMessages"
          :key="index"
          shadow="never"
          class="message-card"
        >
          <template #header>
            <div class="message-card-header">
              <div class="message-title">
                <div v-if="msg.role === 'user'" class="message-icon">
                  <span class="icon-emoji">👤</span>
                </div>
                <div v-else class="message-icon">
                  <img
                    v-if="contextData.agentInfo.icon && (contextData.agentInfo.icon.startsWith('/') || contextData.agentInfo.icon.startsWith('appdata://') || contextData.agentInfo.icon.startsWith('http'))"
                    :src="contextData.agentInfo.icon.startsWith('appdata://') ? contextData.agentInfo.icon.replace('appdata://', '/') : contextData.agentInfo.icon"
                    alt="Agent Icon"
                    class="icon-image"
                    @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
                  />
                  <span v-else class="icon-emoji">{{ contextData.agentInfo.icon || '🤖' }}</span>
                </div>
                <span class="message-role-name">
                  {{ msg.role === 'user' ? '用户' : (contextData.agentInfo.name || '助手') }} #{{ index + 1 }}
                </span>
              </div>
              <el-tag size="small" type="warning">
                {{ msg.charCount }} 字符
              </el-tag>
            </div>
          </template>
          <div class="message-content">{{ msg.content }}</div>
        </el-card>
      </div>
    </div>

    <!-- 会话历史 -->
    <div v-if="contextData.chatHistory.length > 0" class="section">
      <div class="section-title">
        <span>会话历史</span>
        <el-tag size="small" type="success">
          {{ contextData.chatHistory.length }} 条消息
        </el-tag>
      </div>
      <div class="messages-list">
        <el-card
          v-for="(msg, index) in contextData.chatHistory"
          :key="msg.nodeId"
          shadow="never"
          class="message-card"
        >
          <template #header>
            <div class="message-card-header">
              <div class="message-title">
                <div v-if="msg.role === 'user'" class="message-icon">
                  <span class="icon-emoji">👤</span>
                </div>
                <div v-else class="message-icon">
                  <img
                    v-if="msg.agentIcon && (msg.agentIcon.startsWith('/') || msg.agentIcon.startsWith('appdata://') || msg.agentIcon.startsWith('http'))"
                    :src="msg.agentIcon.startsWith('appdata://') ? msg.agentIcon.replace('appdata://', '/') : msg.agentIcon"
                    alt="Agent Icon"
                    class="icon-image"
                    @error="(e: Event) => ((e.target as HTMLImageElement).style.display = 'none')"
                  />
                  <span v-else class="icon-emoji">{{ msg.agentIcon || '🤖' }}</span>
                </div>
                <span class="message-role-name">
                  {{ msg.role === 'user' ? '用户' : (msg.agentName || '助手') }} #{{ index + 1 }}
                </span>
              </div>
              <el-tag size="small" type="success">
                {{ msg.charCount }} 字符
              </el-tag>
            </div>
          </template>
          <div class="message-content">{{ msg.content }}</div>
        </el-card>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import InfoCard from '@/components/common/InfoCard.vue';
import type { ContextPreviewData } from '../../composables/useChatHandler';

defineProps<{
  contextData: ContextPreviewData;
}>();
</script>

<style scoped>
.structured-view {
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.agent-info-card,
.stats-card {
  border: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color);
}

.card-header {
  font-weight: bold;
  color: var(--el-text-color-primary);
}

.agent-info {
  display: flex;
  flex-direction: row;
  gap: 16px;
  align-items: stretch;
}

.agent-avatar {
  flex-shrink: 0;
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border-radius: 8px;
  background-color: var(--el-fill-color-light);
}

.avatar-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-emoji {
  font-size: 48px;
  line-height: 1;
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

.message-card {
  border: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color);
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

.message-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;
  border-radius: 4px;
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
</style>