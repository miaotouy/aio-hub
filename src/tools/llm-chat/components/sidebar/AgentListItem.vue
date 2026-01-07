<script setup lang="ts">
import { computed, ref } from "vue";
import {
  Edit,
  Delete,
  MoreFilled,
  Download,
  CopyDocument,
  DocumentCopy,
  FolderOpened,
  Refresh,
} from "@element-plus/icons-vue";
import { invoke } from "@tauri-apps/api/core";
import Avatar from "@/components/common/Avatar.vue";
import { resolveAvatarPath } from "../../composables/useResolvedAvatar";
import { useAgentStorageSeparated } from "../../composables/useAgentStorageSeparated";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent } from "../../types";
import type { MatchDetail } from "../../composables/useLlmSearch";
import AgentUpgradeDialog from "../agent/AgentUpgradeDialog.vue";

const props = defineProps<{
  agent: ChatAgent;
  selected: boolean;
  matches?: MatchDetail[];
}>();

defineEmits<{
  (e: "select", id: string): void;
  (e: "edit", agent: ChatAgent): void;
  (e: "duplicate", agent: ChatAgent): void;
  (e: "export", agent: ChatAgent): void;
  (e: "copy-config", agent: ChatAgent, format: "json" | "yaml"): void;
  (e: "delete", agent: ChatAgent): void;
}>();

const isHovered = ref(false);
const isMenuOpen = ref(false);
const upgradeDialogVisible = ref(false);

const avatarSrc = computed(() => {
  return resolveAvatarPath(props.agent, "agent");
});

// 字段标签映射
const fieldLabels: Record<string, string> = {
  name: "名称",
  displayName: "显示名称",
  description: "描述",
  presetMessage: "预设消息",
  presetMessageName: "预设消息名",
  content: "消息内容",
  reasoningContent: "推理内容",
};

const getFieldLabel = (field: string): string => {
  return fieldLabels[field] || field;
};

const handleVisibleChange = (visible: boolean) => {
  isMenuOpen.value = visible;
};

// 只有在 hover 或菜单打开时才显示操作按钮区域
// 只有在确实需要交互时才渲染 el-dropdown，极大提升长列表性能
const showActions = computed(() => isHovered.value || isMenuOpen.value);

// 打开智能体目录并选中配置文件
const handleOpenDirectory = async () => {
  try {
    const { getAgentConfigPath } = useAgentStorageSeparated();
    const configPath = await getAgentConfigPath(props.agent.id);
    await invoke("open_file_directory", { filePath: configPath });
  } catch (error) {
    customMessage.error("打开目录失败");
  }
};
</script>

<template>
  <div
    class="agent-item"
    :class="{ selected }"
    @click="$emit('select', agent.id)"
    @mouseenter="isHovered = true"
    @mouseleave="isHovered = false"
  >
    <Avatar
      :src="avatarSrc || ''"
      :alt="agent.displayName || agent.name"
      :class="['agent-icon', { selected }]"
    />
    
    <div class="agent-info">
      <div class="agent-name">{{ agent.displayName || agent.name }}</div>
      
      <!-- 搜索匹配详情 -->
      <div v-if="matches && matches.length > 0" class="match-details">
        <div v-for="(match, index) in matches.slice(0, 3)" :key="index" class="match-item">
          <span class="match-field">{{ getFieldLabel(match.field) }}{{ match.role ? `(${match.role})` : '' }}:</span>
          <span class="match-context" :title="match.context">{{ match.context }}</span>
        </div>
        <div v-if="matches.length > 3" class="match-more">
          +{{ matches.length - 3 }} 处匹配
        </div>
      </div>

      <!-- 只在选中且无搜索结果时显示详细信息 -->
      <div v-else-if="selected && agent.description" class="agent-desc">
        {{ agent.description }}
      </div>
    </div>

    <!-- 三点菜单 -->
    <!-- 性能优化：使用 v-if 延迟渲染 el-dropdown -->
    <div class="agent-actions" @click.stop>
      <el-dropdown 
        v-if="showActions" 
        trigger="click" 
        @visible-change="handleVisibleChange"
      >
        <el-button text circle :icon="MoreFilled" class="action-btn" />
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="$emit('edit', agent)">
              <el-icon><Edit /></el-icon>
              编辑
            </el-dropdown-item>
            <el-dropdown-item @click="$emit('duplicate', agent)">
              <el-icon><CopyDocument /></el-icon>
              创建副本
            </el-dropdown-item>
            <el-dropdown-item @click="upgradeDialogVisible = true">
              <el-icon><Refresh /></el-icon>
              覆盖配置升级...
            </el-dropdown-item>
            <el-dropdown-item @click="$emit('copy-config', agent, 'json')" divided>
              <el-icon><DocumentCopy /></el-icon>
              复制为 JSON
            </el-dropdown-item>
            <el-dropdown-item @click="$emit('copy-config', agent, 'yaml')">
              <el-icon><DocumentCopy /></el-icon>
              复制为 YAML
            </el-dropdown-item>
            <el-dropdown-item @click="$emit('export', agent)" divided>
              <el-icon><Download /></el-icon>
              导出...
            </el-dropdown-item>
            <el-dropdown-item @click="handleOpenDirectory">
              <el-icon><FolderOpened /></el-icon>
              打开目录
            </el-dropdown-item>
            <el-dropdown-item @click="$emit('delete', agent)" divided>
              <el-icon><Delete /></el-icon>
              删除
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 升级对话框 -->
    <AgentUpgradeDialog
      v-model:visible="upgradeDialogVisible"
      :agent="agent"
    />
  </div>
</template>

<style scoped>
.agent-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--container-bg);
  border-left: 3px solid transparent;
  backdrop-filter: blur(var(--ui-blur));
  position: relative; /* 确保 hover 状态正确 */
}

.agent-item:hover {
  background-color: var(--hover-bg);
}

.agent-item.selected {
  background-color: rgba(var(--primary-color-rgb), 0.1);
  border-left-color: var(--primary-color);
}

.agent-icon {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 6px;
  transition: all 0.2s;
  font-size: 24px;
}

.agent-icon.selected {
  width: 48px;
  height: 48px;
  font-size: 32px;
  border-radius: 8px;
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.agent-desc {
  font-size: 11px;
  color: var(--text-color-light);
  margin-top: 4px;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.match-details {
  margin-top: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.match-item {
  display: flex;
  gap: 4px;
  margin-bottom: 2px;
  align-items: baseline;
}

.match-field {
  flex-shrink: 0;
  color: var(--text-color-light);
  font-size: 10px;
}

.match-context {
  color: var(--text-color-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.match-more {
  font-size: 10px;
  color: var(--primary-color);
  margin-top: 2px;
}

.agent-actions {
  display: flex;
  align-items: center;
  min-width: 28px; /* 预留空间防止抖动 */
  height: 28px;
}

.action-btn {
  width: 28px;
  height: 28px;
  font-size: 16px;
}
</style>