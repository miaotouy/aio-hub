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
import { useLlmChatUiState } from "@/tools/llm-chat/composables/ui/useLlmChatUiState";
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import { useMeasuredVirtualizer } from "@/composables/useMeasuredVirtualizer";
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { useLlmChatStore } from "../../stores/llmChatStore";
import type { ChatSessionIndex } from "../../types";
import {
  useLlmSearch,
  type SearchMatchMode,
} from "../../composables/chat/useLlmSearch";
import { Plus, Search, Loading } from "@element-plus/icons-vue";
import SessionItem from "../sidebar/SessionItem.vue";
import SessionActionDialogs from "../sidebar/SessionActionDialogs.vue";
import { useTopicNamer } from "../../composables/chat/useTopicNamer";
import { useChatSettings } from "../../composables/settings/useChatSettings";
import { useMessageInputStore } from "../../stores/messageInputStore";

const inputStore = useMessageInputStore();
const emit = defineEmits<{ complete: [] }>();
const agentStore = useAgentStore();
const chatStore = useLlmChatStore();
const searchQuery = ref("");
const { settings } = useChatSettings();
const { isGenerating } = useTopicNamer();
const sessionActionsRef = ref<InstanceType<typeof SessionActionDialogs> | null>(
  null
);

// 后端搜索功能
const {
  isSearching,
  showLoadingIndicator,
  sessionResults,
  matchMode,
  search,
  clearSearch,
  getFieldLabel,
  getRoleLabel,
} = useLlmSearch({ debounceMs: 300, scope: "session" });

// 搜索模式配置
const matchModeOptions: {
  value: SearchMatchMode;
  label: string;
  desc: string;
}[] = [
  { value: "exact", label: "精确", desc: "完整短语匹配" },
  { value: "and", label: "全部", desc: "所有关键词都须出现" },
  { value: "or", label: "任一", desc: "任一关键词出现即可" },
];

const currentModeLabel = computed(
  () =>
    matchModeOptions.find((o) => o.value === matchMode.value)?.label ?? "精确"
);

const handleMatchModeChange = (mode: SearchMatchMode) => {
  matchMode.value = mode;
  if (searchQuery.value.trim().length >= 2) {
    search(searchQuery.value.trim());
  }
};

// 是否处于搜索模式（有搜索词且长度>=2）
const isInSearchMode = computed(() => searchQuery.value.trim().length >= 2);

// 监听搜索词变化
watch(searchQuery, (newQuery) => {
  const trimmed = newQuery.trim();
  if (trimmed.length >= 2) {
    search(trimmed);
  } else {
    clearSearch();
  }
});

// 本地过滤和排序逻辑（用于非搜索模式或过渡）
const localFilteredSessions = computed(() => {
  let result = chatStore.sessions;

  if (searchQuery.value.trim()) {
    const query = searchQuery.value.toLowerCase();
    result = result.filter((session) =>
      session.name.toLowerCase().includes(query)
    );
  }

  // 默认按更新时间降序排序
  return [...result].sort((a, b) => {
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });
});

// 搜索模式下的会话列表（基于后端搜索结果）
const searchResultSessions = computed(() => {
  if (!isInSearchMode.value) return [];

  const sessions: ChatSessionIndex[] = [];
  const sessionMap = new Map(chatStore.sessions.map((s) => [s.id, s]));

  for (const result of sessionResults.value) {
    const session = sessionMap.get(result.id);
    if (session) {
      sessions.push(session);
    }
  }
  return sessions;
});

// 最终显示的会话列表
const displaySessions = computed(() => {
  if (isInSearchMode.value) {
    if (searchResultSessions.value.length > 0) {
      return searchResultSessions.value;
    }
    // 正在搜索时，显示前端过滤结果作为过渡
    if (isSearching.value) {
      return localFilteredSessions.value;
    }
    return [];
  }
  return localFilteredSessions.value;
});

// 搜索结果 ID 到匹配详情的映射
const searchMatchesMap = computed(() => {
  const map = new Map<string, any[]>();
  for (const result of sessionResults.value) {
    map.set(result.id, result.matches);
  }
  return map;
});
const listRef = ref<HTMLElement | null>(null);
const virtualizer = useMeasuredVirtualizer(displaySessions, {
  getItemKey: (session) => session.id,
  getScrollElement: () => listRef.value,
  estimateSize: () => 52,
});
const virtualSessions = computed(() =>
  virtualizer.value
    .getVirtualItems()
    .map((item) => ({ ...item, session: displaySessions.value[item.index] }))
);
const totalSize = computed(() => virtualizer.value.getTotalSize());

const { selectAgent } = useLlmChatUiState();

// 处理会话点击
const handleSessionClick = (session: ChatSessionIndex) => {
  if (
    settings.value.uiPreferences.autoSwitchAgentOnSessionChange &&
    session.displayAgentId
  ) {
    const agent = agentStore.getAgentById(session.displayAgentId);
    if (agent) {
      selectAgent(session.displayAgentId, {
        syncCurrentSessionGreetings: false,
      });
    }
  }
  inputStore.handleSwitchSession(session.id);
  emit("complete");
};

const handleNewSession = () => {
  if (inputStore.handleNewSession()) emit("complete");
};

// 自动定位到当前会话
const scrollToCurrentSession = () => {
  const index = displaySessions.value.findIndex(
    (s) => s.id === chatStore.currentSessionId
  );
  if (index === -1) return;

  virtualizer.value.scrollToIndex(index, { align: "center" });
};

let disposed = false;
watch(
  displaySessions,
  async (sessions) => {
    if (!sessions.length) return;
    await nextTick();
    if (!disposed) scrollToCurrentSession();
  },
  { immediate: true, flush: "post" }
);
onBeforeUnmount(() => {
  disposed = true;
  if (isSearching.value) clearSearch();
});
</script>

<template>
  <div class="mini-session-list">
    <div class="list-container" ref="listRef">
      <div v-if="chatStore.sessions.length === 0" class="empty-state">
        <p>暂无会话</p>
      </div>
      <div v-else-if="displaySessions.length === 0" class="empty-state">
        <p>无匹配结果</p>
      </div>

      <div
        v-else
        class="virtual-list-content"
        :style="{ height: `${totalSize}px` }"
      >
        <div
          v-for="{ session, index, start } in virtualSessions"
          :key="session.id"
          :data-index="index"
          :ref="(el) => virtualizer.measureElement(el as HTMLElement)"
          class="virtual-list-row"
          :style="{ transform: `translateY(${start}px)` }"
        >
          <SessionItem
            :session="session"
            :active="session.id === chatStore.currentSessionId"
            :is-generating="isGenerating(session.id)"
            :matches="
              isInSearchMode ? searchMatchesMap.get(session.id) : undefined
            "
            :get-field-label="getFieldLabel"
            :get-role-label="getRoleLabel"
            compact
            @click="handleSessionClick"
            @command="sessionActionsRef?.handleMenuCommand"
            @toggle-favorite="sessionActionsRef?.handleToggleFavorite"
          />
        </div>
      </div>
    </div>

    <SessionActionDialogs
      ref="sessionActionsRef"
      @delete="chatStore.deleteSession"
      @rename="
        ({ sessionId, newName }) =>
          chatStore.updateSession(sessionId, { name: newName })
      "
    />

    <div class="header">
      <el-tooltip content="新建对话" placement="top" :show-after="500">
        <el-button
          :icon="Plus"
          size="small"
          circle
          data-testid="chat-new-session"
          @click="handleNewSession"
        />
      </el-tooltip>
      <el-input
        v-model="searchQuery"
        placeholder="搜索会话..."
        :prefix-icon="Search"
        size="small"
        clearable
        class="search-input"
      >
        <template #suffix v-if="showLoadingIndicator">
          <el-icon class="is-loading"><Loading /></el-icon>
        </template>
      </el-input>
      <el-dropdown
        trigger="click"
        @command="handleMatchModeChange"
        placement="top-end"
      >
        <div>
          <el-tooltip
            :content="`搜索模式: ${matchModeOptions.find((o) => o.value === matchMode)?.desc}`"
            placement="top"
            :show-after="400"
          >
            <el-button
              size="small"
              :type="matchMode !== 'exact' ? 'primary' : ''"
              plain
              class="match-mode-btn"
            >
              {{ currentModeLabel }}
            </el-button>
          </el-tooltip>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item
              v-for="opt in matchModeOptions"
              :key="opt.value"
              :command="opt.value"
              :class="{ 'is-active': matchMode === opt.value }"
            >
              <span>{{ opt.label }}</span>
              <span class="mode-desc">{{ opt.desc }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
  </div>
</template>

<style scoped>
.mini-session-list {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  width: 100%;
}

.header {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 8px;
  padding: 8px 0 0;
  border-top: var(--border-width) solid var(--border-color);
  align-items: center;
}

.search-input {
  flex: 1 1 160px;
  min-width: min(100%, 120px);
}

.match-mode-btn {
  min-width: 36px;
  padding: 0 6px;
  font-size: 11px;
}

.mode-desc {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-color-light);
}

.list-container {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px;
}

.empty-state {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100px;
  color: var(--text-color-light);
  font-size: 12px;
}

.virtual-list-content {
  position: relative;
  width: 100%;
}

.virtual-list-row {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
}
</style>
