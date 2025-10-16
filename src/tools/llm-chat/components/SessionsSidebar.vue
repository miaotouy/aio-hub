<script setup lang="ts">
import { computed, ref } from 'vue';
import { useAgentStore } from '../agentStore';
import type { ChatSession } from '../types';
import { Plus, Delete } from '@element-plus/icons-vue';

interface Props {
  sessions: ChatSession[];
  currentSessionId: string | null;
}

interface Emits {
  (e: 'switch', sessionId: string): void;
  (e: 'delete', sessionId: string): void;
  (e: 'new-session', data: { agentId: string; name?: string }): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const agentStore = useAgentStore();

// 新建会话相关
const showNewSessionForm = ref(false);
const selectedAgentId = ref('');
const sessionName = ref('');

// 可用智能体列表
const availableAgents = computed(() => agentStore.sortedAgents);

// 创建新会话
const handleCreateSession = () => {
  if (!selectedAgentId.value) {
    alert('请选择智能体');
    return;
  }

  emit('new-session', {
    agentId: selectedAgentId.value,
    name: sessionName.value || undefined,
  });

  resetNewSessionForm();
};

// 重置表单
const resetNewSessionForm = () => {
  showNewSessionForm.value = false;
  selectedAgentId.value = '';
  sessionName.value = '';
};

// 快速新建（使用默认智能体）
const handleQuickNewSession = () => {
  const defaultAgent = agentStore.defaultAgent;
  if (!defaultAgent) {
    // 如果没有默认智能体，显示表单
    showNewSessionForm.value = true;
    return;
  }

  emit('new-session', {
    agentId: defaultAgent.id,
  });
};

// 按更新时间倒序排列
const sortedSessions = computed(() => {
  return [...props.sessions].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
});

// 格式化日期
const formatDate = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins} 分钟前`;
  if (diffHours < 24) return `${diffHours} 小时前`;
  if (diffDays < 7) return `${diffDays} 天前`;
  
  return date.toLocaleDateString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
  });
};

// 获取消息数量（排除系统根节点）
const getMessageCount = (session: ChatSession) => {
  return Object.keys(session.nodes).length - 1;
};

// 确认删除
const confirmDelete = (session: ChatSession, event: Event) => {
  event.stopPropagation();
  if (confirm(`确定要删除对话"${session.name}"吗？`)) {
    emit('delete', session.id);
  }
};
</script>

<template>
  <div class="sessions-sidebar">
    <div class="sidebar-header">
      <div class="header-top">
        <el-button
          type="primary"
          @click="handleQuickNewSession"
          :icon="Plus"
          style="width: 100%"
        >
          新建对话
        </el-button>
      </div>

      <!-- 新建会话表单 -->
      <div v-if="showNewSessionForm" class="new-session-form">
        <div class="form-group">
          <el-input
            v-model="sessionName"
            placeholder="对话名称（可选）"
          />
        </div>

        <div class="form-group">
          <el-select
            v-model="selectedAgentId"
            placeholder="选择智能体"
            style="width: 100%"
          >
            <el-option
              v-for="agent in availableAgents"
              :key="agent.id"
              :label="`${agent.icon || '🤖'} ${agent.name}`"
              :value="agent.id"
            />
          </el-select>
        </div>

        <div class="form-actions">
          <el-button type="primary" @click="handleCreateSession">
            创建
          </el-button>
          <el-button @click="resetNewSessionForm">
            取消
          </el-button>
        </div>
      </div>

      <div class="session-count">{{ sessions.length }} 个会话</div>
    </div>

    <div class="sessions-list">
      <div v-if="sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
        <p class="hint">点击上方按钮创建新会话</p>
      </div>

      <div
        v-for="session in sortedSessions"
        :key="session.id"
        :class="['session-item', { active: session.id === currentSessionId }]"
        @click="emit('switch', session.id)"
      >
        <div class="session-content">
          <div class="session-title">{{ session.name }}</div>
          <div class="session-info">
            <span class="message-count">{{ getMessageCount(session) }} 条</span>
            <span class="session-time">{{ formatDate(session.updatedAt) }}</span>
          </div>
        </div>
        
        <el-button
          @click="confirmDelete(session, $event)"
          :icon="Delete"
          size="small"
          text
          class="btn-delete"
          title="删除会话"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.sessions-sidebar {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--card-bg);
}

.sidebar-header {
  padding: 12px;
  border-bottom: 1px solid var(--border-color);
}

.header-top {
  margin-bottom: 12px;
}


.new-session-form {
  padding: 12px;
  background-color: var(--container-bg);
  border-radius: 6px;
  margin-bottom: 12px;
}

.form-group {
  margin-bottom: 8px;
}


.form-actions {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}

.form-actions .el-button {
  flex: 1;
}

.session-count {
  font-size: 12px;
  color: var(--text-color-light);
  text-align: center;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  font-size: 12px;
  margin-top: 8px;
  opacity: 0.7;
}

.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.session-item:hover {
  background-color: var(--hover-bg);
  border-color: var(--border-color);
}

.session-item.active {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-color: var(--primary-color);
}

.session-content {
  flex: 1;
  min-width: 0;
}

.session-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.message-count {
  background-color: var(--container-bg);
  padding: 1px 6px;
  border-radius: 3px;
}

.btn-delete {
  opacity: 0;
  transition: all 0.2s;
}

.session-item:hover .btn-delete {
  opacity: 1;
}

/* 滚动条样式 */
.sessions-list::-webkit-scrollbar {
  width: 6px;
}

.sessions-list::-webkit-scrollbar-track {
  background: transparent;
}

.sessions-list::-webkit-scrollbar-thumb {
  background: var(--scrollbar-thumb-color);
  border-radius: 3px;
}

.sessions-list::-webkit-scrollbar-thumb:hover {
  background: var(--scrollbar-thumb-hover-color);
}
</style>