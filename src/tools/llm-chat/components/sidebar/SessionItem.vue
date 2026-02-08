<script setup lang="ts">
import { computed } from "vue";
import {
  Delete,
  MoreFilled,
  Edit,
  MagicStick,
  FolderOpened,
  Operation,
} from "@element-plus/icons-vue";
import type { ChatSession } from "../../types";
import type { MatchDetail } from "../../composables/chat/useLlmSearch";
import Avatar from "@/components/common/Avatar.vue";
import { resolveAvatarPath } from "../../composables/ui/useResolvedAvatar";
import { formatRelativeTime } from "@/utils/time";
import { useAgentStore } from "../../stores/agentStore";

interface Props {
  session: ChatSession;
  active: boolean;
  isGenerating: boolean;
  matches?: MatchDetail[];
  getFieldLabel: (field: any) => string;
  getRoleLabel: (role: any) => string;
}

const props = defineProps<Props>();
const emit = defineEmits<{
  (e: "click", session: ChatSession): void;
  (e: "command", command: string, session: ChatSession): void;
}>();

const agentStore = useAgentStore();

const displayAgent = computed(() => {
  if (!props.session.displayAgentId) return null;
  return agentStore.getAgentById(props.session.displayAgentId);
});

const messageCount = computed(() => {
  if (typeof props.session.messageCount === "number") {
    return props.session.messageCount;
  }
  return props.session.nodes ? Object.keys(props.session.nodes).length - 1 : 0;
});

const filteredMatches = computed(() => {
  if (!props.matches) return [];
  return props.matches.filter((m) => m.field !== "name").slice(0, 3);
});

const handleCommand = (command: string) => {
  emit("command", command, props.session);
};
</script>

<template>
  <div :class="['session-item', { active }]" @click="emit('click', session)">
    <div class="session-content">
      <div class="session-title">
        <template v-if="displayAgent">
          <el-tooltip
            :content="`当前使用: ${displayAgent.displayName || displayAgent.name}`"
            placement="top"
            :show-after="50"
          >
            <Avatar
              :src="resolveAvatarPath(displayAgent, 'agent') || ''"
              :alt="displayAgent.displayName || displayAgent.name"
              :size="20"
              shape="square"
              :radius="4"
            />
          </el-tooltip>
        </template>
        <span :class="['title-text', { generating: isGenerating }]">
          {{ session.name }}
        </span>
      </div>

      <!-- 搜索匹配详情 -->
      <div v-if="filteredMatches.length > 0" class="match-details">
        <div v-for="(match, index) in filteredMatches" :key="index" class="match-item">
          <span class="match-field">
            {{ getFieldLabel(match.field) }}{{ match.role ? `(${getRoleLabel(match.role)})` : "" }}:
          </span>
          <span class="match-context" :title="match.context">{{ match.context }}</span>
        </div>
        <div v-if="matches && matches.length > 3" class="match-more">
          +{{ matches.length - 3 }} 处匹配
        </div>
      </div>

      <div class="session-info">
        <span class="message-count">{{ messageCount }} 条</span>
        <span class="session-time">{{ formatRelativeTime(session.updatedAt) }}</span>
        <el-dropdown @command="handleCommand" trigger="click" class="menu-dropdown">
          <div @click.stop>
            <el-tooltip content="更多操作" placement="top" :show-after="500">
              <el-button :icon="MoreFilled" size="small" text class="btn-menu" />
            </el-tooltip>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="generate-name" :icon="MagicStick" :disabled="isGenerating">
                {{ isGenerating ? "生成中..." : "生成标题" }}
              </el-dropdown-item>
              <el-dropdown-item command="rename" :icon="Edit"> 重命名 </el-dropdown-item>
              <el-dropdown-item command="export" :icon="Operation"> 导出会话 </el-dropdown-item>
              <el-dropdown-item command="open-directory" :icon="FolderOpened">
                打开目录
              </el-dropdown-item>
              <el-dropdown-item command="delete" :icon="Delete"> 删除会话 </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </div>
    </div>
  </div>
</template>

<style scoped>
.session-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  margin-bottom: 4px;
  min-height: 67px;
  box-sizing: border-box;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
  backdrop-filter: blur(var(--ui-blur));
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
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
}

.title-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
  position: relative;
}

.match-details {
  margin: 2px 0 4px 0;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.match-item {
  display: flex;
  gap: 4px;
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

/* 生成中的标题 - 扫光动画 */
.title-text.generating {
  background: linear-gradient(
    90deg,
    var(--text-color) 0%,
    var(--text-color) 40%,
    var(--primary-color) 50%,
    var(--text-color) 60%,
    var(--text-color) 100%
  );
  background-size: 200% 100%;
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  animation: shimmer 2s infinite linear;
}

@keyframes shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.session-item:has(.title-text.generating) {
  animation: pulse-border 2s infinite ease-in-out;
}

@keyframes pulse-border {
  0%,
  100% {
    border-color: var(--border-color);
  }
  50% {
    border-color: var(--primary-color);
    box-shadow: 0 0 8px rgba(var(--primary-color-rgb), 0.3);
  }
}

.session-info {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-color-light);
}

.menu-dropdown {
  margin-left: auto;
}

.message-count {
  background-color: var(--container-bg);
  padding: 1px 6px;
  border-radius: 3px;
}

.btn-menu {
  opacity: 0;
  transition: all 0.2s;
}

.session-item:hover .btn-menu {
  opacity: 1;
}
</style>
