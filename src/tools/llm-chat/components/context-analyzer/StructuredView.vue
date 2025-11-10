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
        <Avatar
          v-if="contextData.agentInfo.icon"
          :src="contextData.agentInfo.icon"
          alt="Agent Icon"
          :size="96"
          shape="square"
          :radius="8"
        />
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
          <el-tag v-if="contextData.statistics.tokenizerName" size="small" type="info">
            {{ contextData.statistics.isEstimated ? '估算' : '精确' }} - {{ contextData.statistics.tokenizerName }}
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
          <div class="stat-label">系统提示</div>
          <div class="stat-value">
            <template v-if="contextData.statistics.systemPromptTokenCount !== undefined">
              {{ contextData.statistics.systemPromptTokenCount.toLocaleString() }} tokens
              <span class="char-count">
                {{ contextData.statistics.systemPromptCharCount.toLocaleString() }} 字符
              </span>
            </template>
            <template v-else>
              {{ contextData.statistics.systemPromptCharCount.toLocaleString() }} 字符
            </template>
          </div>
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
      </div>
    </el-card>

    <!-- 系统提示 -->
    <InfoCard
      v-if="contextData.systemPrompt"
      title="系统提示 (System Prompt)"
      :content="contextData.systemPrompt.content"
    >
      <template #headerExtra>
        <div class="header-tags">
          <el-tag v-if="contextData.systemPrompt.tokenCount !== undefined" size="small" type="success">
            {{ contextData.systemPrompt.tokenCount }} tokens
          </el-tag>
          <el-tag size="small" type="info">
            {{ contextData.systemPrompt.charCount }} 字符
          </el-tag>
        </div>
      </template>
    </InfoCard>

    <!-- 预设消息 -->
    <div v-if="contextData.presetMessages.length > 0" class="section">
      <div class="section-title">
        <span>预设对话</span>
        <div class="header-tags">
          <el-tag size="small" type="warning">
            {{ contextData.presetMessages.length }} 条消息
          </el-tag>
          <el-tag v-if="contextData.statistics.presetMessagesTokenCount !== undefined" size="small" type="success">
            {{ contextData.statistics.presetMessagesTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
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
                <Avatar
                  v-if="msg.role === 'user'"
                  src="👤"
                  alt="User"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <Avatar
                  v-else
                  :src="contextData.agentInfo.icon || ''"
                  :alt="contextData.agentInfo.name || '助手'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <span class="message-role-name">
                  {{ msg.role === 'user' ? '用户' : (contextData.agentInfo.name || '助手') }} #{{ index + 1 }}
                </span>
              </div>
              <div class="header-tags">
                <el-tag v-if="msg.tokenCount !== undefined" size="small" type="success">
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info">
                  {{ msg.charCount }} 字符
                </el-tag>
              </div>
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
        <div class="header-tags">
          <el-tag size="small" type="success">
            {{ contextData.chatHistory.length }} 条消息
          </el-tag>
          <el-tag v-if="contextData.statistics.chatHistoryTokenCount !== undefined" size="small" type="success">
            {{ contextData.statistics.chatHistoryTokenCount.toLocaleString() }} tokens
          </el-tag>
        </div>
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
                <Avatar
                  v-if="msg.role === 'user'"
                  src="👤"
                  alt="User"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <Avatar
                  v-else
                  :src="msg.agentIcon || ''"
                  :alt="msg.agentName || '助手'"
                  :size="24"
                  shape="square"
                  :radius="4"
                />
                <span class="message-role-name">
                  {{ msg.role === 'user' ? '用户' : (msg.agentName || '助手') }} #{{ index + 1 }}
                </span>
              </div>
              <div class="header-tags">
                <el-tag v-if="msg.tokenCount !== undefined" size="small" type="success">
                  {{ msg.tokenCount }} tokens
                </el-tag>
                <el-tag size="small" type="info">
                  {{ msg.charCount }} 字符
                </el-tag>
              </div>
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
import Avatar from '@/components/common/Avatar.vue';
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