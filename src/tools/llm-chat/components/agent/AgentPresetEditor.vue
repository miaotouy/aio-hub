<template>
  <div class="agent-preset-editor" :class="{ compact: props.compact }">
    <!-- 头部操作栏 -->
    <div v-if="!props.compact" class="editor-header">
      <div class="header-title">
        <span>预设消息配置</span>
        <el-tooltip content="预设消息将作为所有对话的上下文基础" placement="top">
          <el-icon><QuestionFilled /></el-icon>
        </el-tooltip>
      </div>
      <div class="header-actions">
        <el-button size="small" @click="handleExport">
          <el-icon><Download /></el-icon>
          导出
        </el-button>
        <el-button size="small" @click="handleImport">
          <el-icon><Upload /></el-icon>
          导入
        </el-button>
        <el-button type="primary" size="small" @click="handleAddMessage">
          <el-icon><Plus /></el-icon>
          添加消息
        </el-button>
      </div>
    </div>

    <!-- 消息列表滚动容器 -->
    <div class="messages-container" :style="{ height: containerHeight }">
      <div class="messages-scroll-wrapper">
        <VueDraggableNext
          v-model="localMessages"
          item-key="id"
          handle=".drag-handle"
          @start="onDragStart"
          @end="onDragEnd"
          class="messages-list"
          ghost-class="ghost-message"
          drag-class="drag-message"
          :force-fallback="true"
        >
          <div
            v-for="(element, index) in localMessages"
            :key="element.id"
            class="message-card-wrapper"
          >
            <!-- 历史消息占位符 - 紧凑模式 -->
            <div
              v-if="element.type === 'chat_history' && props.compact"
              class="message-card message-card-compact history-placeholder-compact"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 历史图标 -->
              <div class="role-icon">
                <el-icon color="var(--el-color-warning)">
                  <ChatDotRound />
                </el-icon>
              </div>

              <!-- 文本 -->
              <div class="message-text-compact placeholder-text">
                💬 聊天历史插入位置
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions-compact">
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>

            <!-- 历史消息占位符 - 正常模式 -->
            <div
              v-else-if="element.type === 'chat_history'"
              class="message-card history-placeholder"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 消息内容 -->
              <div class="message-content">
                <!-- 角色标签 -->
                <div class="message-role">
                  <el-tag
                    type="warning"
                    size="small"
                    effect="plain"
                  >
                    <el-icon style="margin-right: 4px">
                      <ChatDotRound />
                    </el-icon>
                    历史消息占位符
                  </el-tag>
                </div>

                <!-- 消息文本预览 -->
                <div class="message-text placeholder-text">
                  实际的聊天历史将在此处插入
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions">
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
              </div>
            </div>

            <!-- 普通预设消息 - 紧凑模式 -->
            <div
              v-else-if="props.compact"
              class="message-card message-card-compact"
              :class="{ disabled: element.isEnabled === false }"
              @click="handleEditMessage(index)"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 角色图标 -->
              <div class="role-icon">
                <el-icon :color="getRoleColor(element.role)">
                  <component :is="getRoleIcon(element.role)" />
                </el-icon>
              </div>

              <!-- 消息文本预览（单行） -->
              <div class="message-text-compact">
                {{ truncateText(element.content, 60) }}
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions-compact" @click.stop>
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
                <el-button
                  link
                  size="small"
                  @click="handleEditMessage(index)"
                >
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button
                  link
                  size="small"
                  type="danger"
                  @click="handleDeleteMessage(index)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>

            <!-- 普通预设消息 - 正常模式 -->
            <div
              v-else
              class="message-card"
              :class="{ disabled: element.isEnabled === false }"
            >
              <!-- 拖拽手柄 -->
              <div class="drag-handle">
                <el-icon><Rank /></el-icon>
              </div>

              <!-- 消息内容 -->
              <div class="message-content">
                <!-- 角色标签 -->
                <div class="message-role">
                  <el-tag
                    :type="getRoleTagType(element.role)"
                    size="small"
                    effect="plain"
                  >
                    <el-icon style="margin-right: 4px">
                      <component :is="getRoleIcon(element.role)" />
                    </el-icon>
                    {{ getRoleLabel(element.role) }}
                  </el-tag>
                </div>

                <!-- 消息文本预览 -->
                <div class="message-text">
                  {{ truncateText(element.content, 120) }}
                </div>
              </div>

              <!-- 操作按钮 -->
              <div class="message-actions">
                <el-switch
                  v-model="element.isEnabled"
                  :active-value="true"
                  :inactive-value="false"
                  size="small"
                  @change="handleToggleEnabled(index)"
                />
                <el-button
                  link
                  size="small"
                  @click="handleEditMessage(index)"
                >
                  <el-icon><Edit /></el-icon>
                </el-button>
                <el-button
                  link
                  size="small"
                  type="danger"
                  @click="handleDeleteMessage(index)"
                >
                  <el-icon><Delete /></el-icon>
                </el-button>
              </div>
            </div>
          </div>
        </VueDraggableNext>

        <!-- 空状态 -->
        <div v-if="localMessages.length === 0" class="empty-state">
          <el-empty description="暂无预设消息，点击上方按钮添加">
            <el-button type="primary" @click="handleAddMessage">
              添加第一条消息
            </el-button>
          </el-empty>
        </div>
      </div>
    </div>

    <!-- 编辑对话框 -->
    <BaseDialog
      :visible="editDialogVisible"
      @update:visible="editDialogVisible = $event"
      :title="isEditMode ? '编辑消息' : '添加消息'"
      width="800px"
      height="auto"
    >
      <template #content>
        <el-form :model="editForm" label-width="80px">
        <el-form-item label="角色">
          <el-radio-group v-model="editForm.role">
            <el-radio value="system">
              <el-icon style="margin-right: 4px"><ChatDotRound /></el-icon>
              System
            </el-radio>
            <el-radio value="user">
              <el-icon style="margin-right: 4px"><User /></el-icon>
              User
            </el-radio>
            <el-radio value="assistant">
              <el-icon style="margin-right: 4px"><Service /></el-icon>
              Assistant
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="内容">
          <el-input
            v-model="editForm.content"
            type="textarea"
            :rows="16"
            placeholder="请输入消息内容..."
          />
          </el-form-item>
        </el-form>
      </template>
      <template #footer>
        <el-button @click="editDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="handleSaveMessage">
          {{ isEditMode ? '保存' : '添加' }}
        </el-button>
      </template>
    </BaseDialog>

    <!-- 导入文件选择器 -->
    <input
      ref="importFileInput"
      type="file"
      accept=".json"
      style="display: none"
      @change="handleFileSelected"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VueDraggableNext } from 'vue-draggable-next';
import type { ChatMessageNode, MessageRole } from '../../types';
import {
  QuestionFilled,
  Download,
  Upload,
  Plus,
  Rank,
  Edit,
  Delete,
  ChatDotRound,
  User,
  Service,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';

interface Props {
  modelValue?: ChatMessageNode[];
  height?: string;
  /** 紧凑模式：只显示一行，隐藏头部操作栏 */
  compact?: boolean;
}

interface Emits {
  (e: 'update:modelValue', value: ChatMessageNode[]): void;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: () => [],
  height: '500px',
  compact: false,
});

const emit = defineEmits<Emits>();

// 本地消息列表
const localMessages = ref<ChatMessageNode[]>([]);

// 编辑对话框状态
const editDialogVisible = ref(false);
const isEditMode = ref(false);
const editingIndex = ref(-1);
const editForm = ref({
  role: 'system' as MessageRole,
  content: '',
});

// 文件导入
const importFileInput = ref<HTMLInputElement | null>(null);

// 容器高度
// 容器高度
const containerHeight = computed(() => props.height);

// 监听外部变化
watch(
  () => props.modelValue,
  (newValue) => {
    // 确保所有消息都有唯一ID，并且存在历史消息占位符
    const CHAT_HISTORY_PLACEHOLDER_ID = 'chat-history-placeholder';
    
    // 从外部获取消息列表
    let existingMessages = [...(newValue || [])];
    
    // 检查是否已存在历史消息占位符
    const hasHistoryPlaceholder = existingMessages.some((msg) => msg.type === 'chat_history');
    
    // 如果不存在，创建一个
    if (!hasHistoryPlaceholder) {
      const historyPlaceholder: ChatMessageNode = {
        id: CHAT_HISTORY_PLACEHOLDER_ID,
        parentId: null,
        childrenIds: [],
        role: 'system',
        content: '聊天历史',
        type: 'chat_history',
        status: 'complete',
        isEnabled: true,
        timestamp: new Date().toISOString(),
      };
      // 将占位符添加到列表末尾，这样聊天记录默认会被插入到底部
      existingMessages = [...existingMessages, historyPlaceholder];
    }
    
    localMessages.value = existingMessages;
    
    // 如果我们添加了占位符，同步到外部
    if (!hasHistoryPlaceholder && existingMessages.length > 0) {
      emit('update:modelValue', existingMessages);
    }
  },
  { immediate: true, deep: true }
);
// 拖拽开始事件
function onDragStart() {
  // 可以在这里添加日志或其他逻辑
}

// 拖拽结束事件 - 同步到外部
function onDragEnd() {
  emit('update:modelValue', localMessages.value);
}

// 同步到外部的辅助函数
function syncToParent() {
  emit('update:modelValue', localMessages.value);
}

/**
 * 获取角色标签类型
 */
function getRoleTagType(role: MessageRole): 'success' | 'primary' | 'info' {
  const typeMap: Record<MessageRole, 'success' | 'primary' | 'info'> = {
    system: 'info',
    user: 'primary',
    assistant: 'success',
  };
  return typeMap[role];
}

/**
 * 获取角色图标
 */
function getRoleIcon(role: MessageRole) {
  const iconMap: Record<MessageRole, any> = {
    system: ChatDotRound,
    user: User,
    assistant: Service,
  };
  return iconMap[role];
}

/**
 * 获取角色标签文本
 */
function getRoleLabel(role: MessageRole): string {
  const labelMap: Record<MessageRole, string> = {
    system: 'System',
    user: 'User',
    assistant: 'Assistant',
  };
  return labelMap[role];
}

/**
 * 获取角色颜色（紧凑模式用）
 */
function getRoleColor(role: MessageRole): string {
  const colorMap: Record<MessageRole, string> = {
    system: 'var(--el-color-info)',
    user: 'var(--el-color-primary)',
    assistant: 'var(--el-color-success)',
  };
  return colorMap[role];
}

/**
 * 截断文本
 */
function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}

/**
 * 添加消息
 */
function handleAddMessage() {
  isEditMode.value = false;
  editForm.value = {
    role: 'system',
    content: '',
  };
  editDialogVisible.value = true;
}

/**
 * 编辑消息
 */
function handleEditMessage(index: number) {
  const message = localMessages.value[index];
  
  // 不允许编辑历史消息占位符
  if (message.type === 'chat_history') {
    ElMessage.warning('历史消息占位符不可编辑');
    return;
  }
  
  isEditMode.value = true;
  editingIndex.value = index;
  editForm.value = {
    role: message.role,
    content: message.content,
  };
  editDialogVisible.value = true;
}

/**
 * 保存消息
 */
function handleSaveMessage() {
  if (!editForm.value.content.trim()) {
    ElMessage.warning('消息内容不能为空');
    return;
  }

  if (isEditMode.value) {
    // 编辑模式：更新现有消息
    const message = localMessages.value[editingIndex.value];
    message.role = editForm.value.role;
    message.content = editForm.value.content;
  } else {
    // 添加模式：创建新消息
    const newMessage: ChatMessageNode = {
      id: `preset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      parentId: null,
      childrenIds: [],
      content: editForm.value.content,
      role: editForm.value.role,
      status: 'complete',
      type: 'message', // 明确标记为普通消息
      isEnabled: true,
      timestamp: new Date().toISOString(),
    };
    localMessages.value.push(newMessage);
  }

  editDialogVisible.value = false;
  syncToParent();
}

/**
 * 删除消息
 */
async function handleDeleteMessage(index: number) {
  const message = localMessages.value[index];
  
  // 不允许删除历史消息占位符
  if (message.type === 'chat_history') {
    ElMessage.warning('历史消息占位符不可删除');
    return;
  }
  
  try {
    await ElMessageBox.confirm(
      '确定要删除这条预设消息吗？',
      '确认删除',
      {
        type: 'warning',
      }
    );
    localMessages.value.splice(index, 1);
    syncToParent();
    ElMessage.success('删除成功');
  } catch {
    // 用户取消
  }
}

/**
 * 切换启用状态
 */
function handleToggleEnabled(_index: number) {
  // 状态已经通过 v-model 自动更新，需要手动同步
  syncToParent();
}


/**
 * 导出预设消息
 */
function handleExport() {
  if (localMessages.value.length === 0) {
    ElMessage.warning('没有可导出的预设消息');
    return;
  }

  const dataStr = JSON.stringify(localMessages.value, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `preset-messages-${new Date().toISOString().split('T')[0]}.json`;
  link.click();
  URL.revokeObjectURL(url);

  ElMessage.success('导出成功');
}

/**
 * 导入预设消息
 */
function handleImport() {
  importFileInput.value?.click();
}

/**
 * 处理文件选择
 */
async function handleFileSelected(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  try {
    const content = await file.text();
    const imported = JSON.parse(content) as ChatMessageNode[];

    // 简单验证
    if (!Array.isArray(imported)) {
      throw new Error('文件格式不正确');
    }

    localMessages.value = imported;
    syncToParent();
    ElMessage.success('导入成功');
  } catch (error) {
    ElMessage.error('导入失败：文件格式不正确');
    console.error('Import error:', error);
  } finally {
    // 清空 input，允许重复导入同一文件
    target.value = '';
  }
}
</script>

<style scoped>
.agent-preset-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid var(--el-border-color);
}

.header-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
}

.header-actions {
  display: flex;
  gap: 8px;
}

.messages-container {
  flex: 1;
  overflow: hidden;
  position: relative;
  min-height: 0; /* 确保 flex 子元素可以正确收缩 */
}

.messages-scroll-wrapper {
  height: 100%;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px;
  box-sizing: border-box;
}

.messages-list {
  display: flex;
  flex-direction: column;
  gap: 12px; /* 使用 gap 替代每个 wrapper 的 margin-bottom */
}

.message-card {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.message-card:hover {
  border-color: var(--el-color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.message-card.disabled {
  opacity: 0.5;
}

.message-card.history-placeholder {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
  border-style: dashed;
}

.message-card.history-placeholder:hover {
  border-color: var(--el-color-warning);
}

.placeholder-text {
  color: var(--el-text-color-secondary);
  font-style: italic;
}

.ghost-message {
  opacity: 0.5;
  background: var(--el-color-primary-light-9);
}

.drag-message {
  opacity: 0.8;
  transform: rotate(2deg);
  box-shadow: 0 5px 15px rgba(0, 0, 0, 0.3);
  transition: none !important;
}

.drag-handle {
  display: flex;
  align-items: center;
  cursor: grab;
  color: var(--el-text-color-secondary);
  padding: 4px;
  user-select: none;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-handle:hover {
  color: var(--el-color-primary);
}

.message-content {
  flex: 1;
  min-width: 0;
}

.message-role {
  margin-bottom: 8px;
}

.message-text {
  color: var(--el-text-color-regular);
  line-height: 1.6;
  word-break: break-word;
}

.message-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  min-height: 300px;
}

/* 紧凑模式样式 */
.agent-preset-editor.compact .messages-scroll-wrapper {
  padding: 8px;
}

.agent-preset-editor.compact .messages-list {
  gap: 8px; /* 紧凑模式下使用更小的间距 */
}

.message-card-compact {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 6px;
  transition: all 0.2s;
  cursor: pointer;
  min-height: 36px;
}

.message-card-compact:hover {
  border-color: var(--el-color-primary);
  background: var(--el-fill-color-light);
}

.message-card-compact.disabled {
  opacity: 0.5;
}

.message-card-compact .drag-handle {
  padding: 2px;
  font-size: 14px;
}

.role-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  flex-shrink: 0;
}

.message-text-compact {
  flex: 1;
  font-size: 13px;
  color: var(--el-text-color-regular);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
}

.message-actions-compact {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 紧凑模式下的空状态 */
.agent-preset-editor.compact .empty-state {
  min-height: 100px;
  font-size: 13px;
}

/* 紧凑模式下的历史消息占位符 */
.history-placeholder-compact {
  background: var(--el-color-warning-light-9);
  border-color: var(--el-color-warning-light-5);
  border-style: dashed;
}

.history-placeholder-compact:hover {
  border-color: var(--el-color-warning);
  background: var(--el-color-warning-light-8);
}

.history-placeholder-compact .placeholder-text {
  color: var(--el-color-warning-dark-2);
  font-weight: 500;
}
</style>