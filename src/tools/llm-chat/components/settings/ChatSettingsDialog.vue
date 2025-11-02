<template>
  <BaseDialog
    :visible="props.visible"
    @update:visible="(val) => emit('update:visible', val)"
    title="聊天设置"
    width="80vw"
    :close-on-backdrop-click="false"
    @close="handleClosed"
  >
    <template #content>
      <div class="settings-content">
      <!-- UI 偏好设置 -->
      <el-form :model="localSettings" label-width="120px" label-position="left">
        <div class="settings-section">
          <div class="section-title">
            <el-icon><Setting /></el-icon>
            <span>界面偏好</span>
          </div>

          <el-form-item label="显示时间戳">
            <el-switch v-model="localSettings.uiPreferences.showTimestamp" />
            <div class="form-hint">在消息中显示发送时间</div>
          </el-form-item>

          <el-form-item label="显示 Token 统计">
            <el-switch v-model="localSettings.uiPreferences.showTokenCount" />
            <div class="form-hint">显示消息的 Token 使用情况</div>
          </el-form-item>

          <el-form-item label="显示模型信息">
            <el-switch v-model="localSettings.uiPreferences.showModelInfo" />
            <div class="form-hint">在消息中显示使用的模型</div>
          </el-form-item>

          <el-form-item label="自动滚动">
            <el-switch v-model="localSettings.uiPreferences.autoScroll" />
            <div class="form-hint">新消息出现时自动滚动到底部</div>
          </el-form-item>

          <el-form-item label="字体大小">
            <el-slider
              v-model="localSettings.uiPreferences.fontSize"
              :min="12"
              :max="20"
              :step="1"
              :show-tooltip="true"
              :format-tooltip="(val: number) => `${val}px`"
            />
            <div class="form-hint">当前: {{ localSettings.uiPreferences.fontSize }}px</div>
          </el-form-item>

          <el-form-item label="行高">
            <el-slider
              v-model="localSettings.uiPreferences.lineHeight"
              :min="1.2"
              :max="2.0"
              :step="0.1"
              :show-tooltip="true"
            />
            <div class="form-hint">当前: {{ localSettings.uiPreferences.lineHeight }}</div>
          </el-form-item>
        </div>

        <el-divider />

        <!-- 消息管理设置 -->
        <div class="settings-section">
          <div class="section-title">
            <el-icon><Delete /></el-icon>
            <span>消息管理</span>
          </div>

          <el-form-item label="删除消息确认">
            <el-switch v-model="localSettings.messageManagement.confirmBeforeDeleteMessage" />
            <div class="form-hint">删除单条消息前显示确认对话框</div>
          </el-form-item>

          <el-form-item label="删除会话确认">
            <el-switch v-model="localSettings.messageManagement.confirmBeforeDeleteSession" />
            <div class="form-hint">删除整个会话前显示确认对话框</div>
          </el-form-item>

          <el-form-item label="清空所有确认">
            <el-switch v-model="localSettings.messageManagement.confirmBeforeClearAll" />
            <div class="form-hint">清空所有会话前显示确认对话框</div>
          </el-form-item>
        </div>

        <el-divider />

        <!-- 快捷键设置 -->
        <div class="settings-section">
          <div class="section-title">
            <el-icon><Tickets /></el-icon>
            <span>快捷键</span>
          </div>

          <el-form-item label="发送消息">
            <el-radio-group v-model="localSettings.shortcuts.send">
              <el-radio value="ctrl+enter">Ctrl/Cmd + Enter</el-radio>
              <el-radio value="enter">Enter</el-radio>
            </el-radio-group>
            <div class="form-hint">
              换行键将自动设置为 {{
                localSettings.shortcuts.send === 'ctrl+enter' ? 'Enter' : 'Shift + Enter'
              }}
            </div>
          </el-form-item>
        </div>
      </el-form>
      </div>
    </template>

    <template #footer>
      <div class="settings-footer-content">
        <el-button @click="handleReset">
          <el-icon><RefreshLeft /></el-icon>
          恢复默认
        </el-button>
        <div class="footer-actions">
          <span v-if="isSaving" class="auto-save-indicator">
            <el-icon class="is-loading"><Loading /></el-icon>
            自动保存中...
          </span>
          <el-button @click="handleClose">关闭</el-button>
        </div>
      </div>
    </template>
  </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { useDebounceFn } from '@vueuse/core';
import { ElMessageBox } from 'element-plus';
import { Setting, Delete, Tickets, RefreshLeft, Loading } from '@element-plus/icons-vue';
import BaseDialog from '@/components/common/BaseDialog.vue';
import { customMessage } from '@/utils/customMessage';
import { useChatSettings, type ChatSettings } from '../../composables/useChatSettings';
import { createModuleLogger } from '@utils/logger';

const logger = createModuleLogger('ChatSettingsDialog');

interface Props {
  visible: boolean;
}

interface Emits {
  (e: 'update:visible', value: boolean): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const { settings, loadSettings, updateSettings, resetSettings, isLoaded } = useChatSettings();

// 本地编辑的设置副本
const localSettings = ref<ChatSettings>({
  uiPreferences: {
    showTimestamp: false,
    showTokenCount: true,
    showModelInfo: true,
    autoScroll: true,
    fontSize: 14,
    lineHeight: 1.6,
  },
  messageManagement: {
    confirmBeforeDeleteMessage: false,
    confirmBeforeDeleteSession: true,
    confirmBeforeClearAll: true,
  },
  shortcuts: {
    send: 'ctrl+enter',
    newLine: 'enter',
  },
});

// 保存状态
const isSaving = ref(false);
// 是否正在加载设置（用于避免在初始加载时触发自动保存）
const isLoadingSettings = ref(false);

// 加载设置
const loadLocalSettings = async () => {
  isLoadingSettings.value = true;
  try {
    if (!isLoaded.value) {
      await loadSettings();
    }
    // 深拷贝设置
    localSettings.value = JSON.parse(JSON.stringify(settings.value));
    logger.info('加载本地设置', { settings: localSettings.value });
  } finally {
    // 等待下一个 tick 后才允许自动保存，确保初始加载不会触发保存
    await nextTick();
    isLoadingSettings.value = false;
  }
};

// 当对话框打开时加载设置
watch(
  () => props.visible,
  async (visible) => {
    if (visible) {
      await loadLocalSettings();
    }
  },
  { immediate: true }
);

// 自动更新换行快捷键（不触发自动保存）
watch(
  () => localSettings.value.shortcuts.send,
  (sendKey) => {
    localSettings.value.shortcuts.newLine = sendKey === 'ctrl+enter' ? 'enter' : 'shift+enter';
  }
);

// 自动保存函数（带防抖）
const autoSave = useDebounceFn(async () => {
  // 如果正在加载设置，不触发保存
  if (isLoadingSettings.value) {
    return;
  }
  
  try {
    isSaving.value = true;
    await updateSettings(localSettings.value);
    logger.info('设置已自动保存');
  } catch (error) {
    logger.error('自动保存设置失败', error as Error);
    customMessage.error('自动保存设置失败');
  } finally {
    isSaving.value = false;
  }
}, 500); // 500ms 防抖

// 监听设置变化，自动保存
watch(
  () => localSettings.value,
  () => {
    autoSave();
  },
  { deep: true }
);

// 关闭对话框
const handleClose = () => {
  emit('update:visible', false);
};

// 恢复默认
const handleReset = async () => {
  try {
    await ElMessageBox.confirm('确定要恢复默认设置吗？', '确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    });
    
    await resetSettings();
    await loadLocalSettings();
    customMessage.success('已恢复默认设置');
  } catch {
    // 用户取消
  }
};

// 对话框关闭时重置状态
const handleClosed = () => {
  isSaving.value = false;
};
</script>

<style scoped>
.settings-content {
  max-height: 70vh;
  overflow-y: auto;
  padding-right: 8px;
}

.settings-section {
  margin-bottom: 24px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 16px;
}

.section-title .el-icon {
  color: var(--primary-color);
}

.form-hint {
  font-size: 12px;
  color: var(--text-color-secondary);
  margin-top: 4px;
  padding-left: 8px;
  line-height: 1.4;
}

.settings-footer-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.footer-actions {
  display: flex;
  gap: 12px;
  align-items: center;
}

.auto-save-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-color-secondary);
}

.auto-save-indicator .el-icon {
  font-size: 14px;
}

/* Element Plus 表单项间距调整 */
:deep(.el-form-item) {
  margin-bottom: 20px;
}

:deep(.el-form-item__label) {
  font-weight: 500;
}

/* 滑块样式调整 */
:deep(.el-slider) {
  margin-right: 12px;
}
</style>