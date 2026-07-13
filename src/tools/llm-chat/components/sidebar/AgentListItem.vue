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
import { resolveAgentAvatarPath } from "@/tools/agent-manager/utils/agentAssetUtils";
import { useAgentStorage } from "@/tools/agent-manager/composables/storage/useAgentStorage";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { customMessage } from "@/utils/customMessage";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";
import {
  useLlmSearch,
  type MatchDetail,
} from "../../composables/chat/useLlmSearch";
import AgentUpgradeDialog from "@/tools/agent-manager/components/management/AgentUpgradeDialog.vue";

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
const isRefreshing = ref(false);
const upgradeDialogVisible = ref(false);
const contextMenuRef = ref<any>(null);
const clickMenuRef = ref<any>(null);
const agentStore = useAgentStore();

const avatarSrc = computed(() => {
  return resolveAgentAvatarPath(props.agent);
});

const { getFieldLabel, formatMatchContext } = useLlmSearch();

const handleVisibleChange = (visible: boolean, source: "context" | "click") => {
  isMenuOpen.value = visible;
  if (visible) {
    // 如果一个菜单打开，确保另一个关闭
    if (source === "context") {
      clickMenuRef.value?.handleClose();
    } else {
      contextMenuRef.value?.handleClose();
    }
  }
};

// 只有在 hover 或菜单打开时才显示操作按钮区域
// 只有在确实需要交互时才渲染 el-dropdown，极大提升长列表性能
const showActions = computed(() => isHovered.value || isMenuOpen.value);

const filteredMatches = computed(() => {
  if (!props.matches) return [];
  return props.matches
    .filter((m) => m.field !== "name" && m.field !== "displayName")
    .slice(0, 3)
    .map((m) => ({
      ...m,
      parts: formatMatchContext(m, 35),
    }));
});

// 打开智能体目录并选中配置文件
const handleOpenDirectory = async () => {
  try {
    const { getAgentConfigPath } = useAgentStorage();
    const configPath = await getAgentConfigPath(props.agent.id);
    await invoke("open_file_directory", { filePath: configPath });
  } catch (error) {
    customMessage.error("打开目录失败");
  }
};

const handleRefreshFromFile = async () => {
  if (isRefreshing.value) return;

  const name = props.agent.displayName || props.agent.name;
  isRefreshing.value = true;

  try {
    const result = await agentStore.refreshAgentFromFile(props.agent.id);

    if (result.agent) {
      customMessage.success(`智能体 "${name}" 已从配置文件刷新`);
    } else if (result.missing) {
      customMessage.warning(`智能体 "${name}" 的配置文件不存在，未刷新`);
    } else if (result.removed) {
      customMessage.warning(`智能体 "${name}" 的配置文件不存在，已从列表移除`);
    } else {
      customMessage.error(`刷新智能体 "${name}" 失败`);
    }
  } catch (error) {
    customMessage.error(`刷新智能体 "${name}" 失败`);
  } finally {
    isRefreshing.value = false;
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
      <div v-if="filteredMatches.length > 0" class="match-details">
        <div
          v-for="(match, index) in filteredMatches"
          :key="index"
          class="match-item"
        >
          <span class="match-field"
            >{{ getFieldLabel(match.field)
            }}{{ match.role ? `(${match.role})` : "" }}:</span
          >
          <div class="match-context" :title="match.context">
            <template v-for="(part, pIdx) in match.parts" :key="pIdx">
              <span v-if="part.isMatch" class="highlight">{{ part.text }}</span>
              <span v-else>{{ part.text }}</span>
            </template>
          </div>
        </div>
        <div v-if="matches && matches.length > 3" class="match-more">
          +{{ matches.length - 3 }} 处匹配
        </div>
      </div>

      <!-- 只在选中且无搜索结果时显示详细信息 -->
      <div v-else-if="selected && agent.description" class="agent-desc">
        {{ agent.description }}
      </div>
    </div>

    <!-- 操作菜单（支持右键） -->
    <el-dropdown
      v-if="showActions"
      ref="contextMenuRef"
      trigger="contextmenu"
      class="agent-context-menu"
      @visible-change="(v: boolean) => handleVisibleChange(v, 'context')"
    >
      <!-- 整个列表项作为右键触发区域，绝对定位覆盖 -->
      <div class="context-menu-trigger" />

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
          <el-dropdown-item
            @click="handleRefreshFromFile"
            :disabled="isRefreshing"
          >
            <el-icon><Refresh /></el-icon>
            从配置文件刷新
          </el-dropdown-item>
          <el-dropdown-item
            @click="$emit('copy-config', agent, 'json')"
            divided
          >
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

    <!-- 三点按钮菜单（支持点击） -->
    <div class="agent-actions" @click.stop>
      <el-dropdown
        v-if="showActions"
        ref="clickMenuRef"
        trigger="click"
        @visible-change="(v: boolean) => handleVisibleChange(v, 'click')"
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
            <el-dropdown-item
              @click="handleRefreshFromFile"
              :disabled="isRefreshing"
            >
              <el-icon><Refresh /></el-icon>
              从配置文件刷新
            </el-dropdown-item>
            <el-dropdown-item
              @click="$emit('copy-config', agent, 'json')"
              divided
            >
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
    <AgentUpgradeDialog v-model:visible="upgradeDialogVisible" :agent="agent" />
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
  border: var(--border-width) solid var(--border-color);
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
  display: flex;
  align-items: center;
}

.highlight {
  color: var(--primary-color);
  background-color: rgba(var(--primary-color-rgb), 0.15);
  padding: 0 2px;
  border-radius: 2px;
  font-weight: 500;
}

.match-more {
  font-size: 10px;
  color: var(--primary-color);
  margin-top: 2px;
}

.agent-actions {
  display: flex;
  align-items: center;
  min-width: 28px;
  height: 28px;
  position: relative;
  z-index: 2; /* 确保在右键触发层之上 */
}

.action-btn {
  width: 28px;
  height: 28px;
  font-size: 16px;
}

/* 右键菜单触发器 */
.agent-context-menu {
  position: absolute;
  inset: 0;
  z-index: 1;
}

.context-menu-trigger {
  width: 100%;
  height: 100%;
}
</style>
