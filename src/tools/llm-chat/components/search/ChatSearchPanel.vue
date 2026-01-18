<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from "vue";
import { Search, X, User, Bot, Clock, ChevronRight, Filter } from "lucide-vue-next";
import type { ChatMessageNode } from "../../types";
import { format } from "date-fns";

interface Props {
  messages: ChatMessageNode[];
}

interface Emits {
  (e: "select", messageId: string): void;
  (e: "close"): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

const searchQuery = ref("");
const searchInput = ref<HTMLInputElement | null>(null);
const selectedIndex = ref(0);
const resultsList = ref<HTMLElement | null>(null);

// 筛选状态
const filterRole = ref<string | null>(null); // 'user' | 'assistant' | null

// 搜索逻辑
const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return [];

  const query = searchQuery.value.toLowerCase();
  const results: {
    id: string;
    role: string;
    displayName: string;
    timestamp: string;
    content: string;
    snippet: string;
  }[] = [];

  // 从后往前搜，通常用户更关心最近的内容
  for (let i = props.messages.length - 1; i >= 0; i--) {
    const msg = props.messages[i];
    const content = msg.content || "";
    const reasoning = msg.metadata?.reasoningContent || "";
    const fullText = (content + " " + reasoning).toLowerCase();

    if (fullText.includes(query)) {
      // 角色筛选
      if (filterRole.value && msg.role !== filterRole.value) continue;

      // 提取摘要
      const index = fullText.indexOf(query);
      const start = Math.max(0, index - 30);
      const end = Math.min(fullText.length, index + query.length + 50);
      let snippet = (content + " " + reasoning).substring(start, end);

      if (start > 0) snippet = "..." + snippet;
      if (end < fullText.length) snippet = snippet + "...";

      // 获取显示名称
      let displayName = "";
      if (msg.role === "user") {
        displayName =
          msg.metadata?.userProfileDisplayName || msg.metadata?.userProfileName || "用户";
      } else if (msg.role === "assistant") {
        displayName =
          msg.metadata?.agentDisplayName ||
          msg.metadata?.agentName ||
          msg.metadata?.modelDisplayName ||
          "助手";
      } else if (msg.role === "system") {
        displayName = "系统";
      }

      // 如果有自定义消息名称，且不是默认角色名，则使用它
      if (msg.name && !["用户", "助手", "系统"].includes(msg.name)) {
        displayName = msg.name;
      }

      results.push({
        id: msg.id,
        role: msg.role,
        displayName: displayName || (msg.role === "user" ? "用户" : "助手"),
        timestamp: msg.timestamp || new Date().toISOString(),
        content: content,
        snippet: snippet,
      });
    }

    if (results.length >= 50) break; // 最多展示 50 条
  }

  return results;
});

// 监听搜索词变化，重置选中项
import { watch } from "vue";
watch(searchQuery, () => {
  selectedIndex.value = 0;
});

// 键盘导航
const handleKeyDown = (e: KeyboardEvent) => {
  if (e.key === "Escape") {
    emit("close");
  } else if (e.key === "ArrowDown") {
    e.preventDefault();
    selectedIndex.value = (selectedIndex.value + 1) % searchResults.value.length;
    scrollToSelected();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    selectedIndex.value =
      (selectedIndex.value - 1 + searchResults.value.length) % searchResults.value.length;
    scrollToSelected();
  } else if (e.key === "Enter") {
    if (searchResults.value[selectedIndex.value]) {
      handleSelect(searchResults.value[selectedIndex.value].id);
    }
  }
};

const scrollToSelected = () => {
  nextTick(() => {
    const activeItem = resultsList.value?.querySelector(".search-result-item.active");
    if (activeItem) {
      activeItem.scrollIntoView({ block: "nearest" });
    }
  });
};

const handleSelect = (id: string) => {
  emit("select", id);
  emit("close");
};

onMounted(() => {
  searchInput.value?.focus();
  window.addEventListener("keydown", handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener("keydown", handleKeyDown);
});

const formatTime = (ts: string) => {
  try {
    return format(new Date(ts), "MM-dd HH:mm");
  } catch {
    return ts;
  }
};

// 高亮关键词
const highlightText = (text: string, query: string) => {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query})`, "gi"));
  return parts
    .map((part) =>
      part.toLowerCase() === query.toLowerCase() ? `<mark class="highlight">${part}</mark>` : part
    )
    .join("");
};
</script>

<template>
  <Transition name="search-fade" appear>
    <div class="search-overlay" @click.self="emit('close')">
      <div class="search-container" :class="{ 'has-results': searchQuery.trim() }">
        <!-- 简洁搜索框 -->
        <div class="search-bar">
          <div class="search-input-wrapper">
            <Search class="search-icon" :size="20" />
            <input
              ref="searchInput"
              v-model="searchQuery"
              type="text"
              placeholder="搜索聊天记录..."
              class="search-input"
            />
          </div>

          <div class="search-actions">
            <!-- 角色筛选 -->
            <el-dropdown trigger="click" @command="(c: any) => (filterRole = c)">
              <button class="action-btn" :class="{ active: filterRole }" title="筛选角色">
                <Filter :size="18" />
                <span v-if="filterRole" class="filter-dot"></span>
              </button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item :command="null" :disabled="!filterRole"
                    >全部角色</el-dropdown-item
                  >
                  <el-dropdown-item command="user">仅用户</el-dropdown-item>
                  <el-dropdown-item command="assistant">仅助手</el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>

            <div class="divider"></div>

            <button class="action-btn close" @click="emit('close')" title="关闭 (Esc)">
              <X :size="18" />
            </button>
          </div>
        </div>

        <!-- 动态结果容器 -->
        <div v-if="searchQuery.trim()" class="results-container">
          <div ref="resultsList" class="search-results">
            <div v-if="searchResults.length === 0" class="no-results">
              <p>未找到与 "{{ searchQuery }}" 匹配的内容</p>
              <span v-if="filterRole" class="filter-hint">当前已开启角色筛选</span>
            </div>

            <div
              v-for="(result, index) in searchResults"
              :key="result.id"
              class="search-result-item"
              :class="{ active: index === selectedIndex }"
              @click="handleSelect(result.id)"
              @mouseenter="selectedIndex = index"
            >
              <div class="result-meta">
                <span class="role-tag" :class="result.role">
                  <User v-if="result.role === 'user'" :size="12" />
                  <Bot v-else :size="12" />
                  {{ result.displayName }}
                </span>
                <span class="time-tag">
                  <Clock :size="12" />
                  {{ formatTime(result.timestamp) }}
                </span>
              </div>
              <div class="result-snippet" v-html="highlightText(result.snippet, searchQuery)"></div>
              <ChevronRight class="arrow-icon" :size="16" />
            </div>
          </div>

          <div class="search-footer">
            <div class="key-hint">
              <span><kbd>↑↓</kbd> 选择</span>
              <span><kbd>Enter</kbd> 跳转</span>
              <span><kbd>Esc</kbd> 关闭</span>
            </div>
            <div v-if="searchResults.length > 0" class="results-count">
              找到 {{ searchResults.length }} 条结果
            </div>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.search-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: center;
  padding-top: 80px;
  z-index: 1000;
}

.search-container {
  width: 640px;
  max-width: 90vw;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.3);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  height: fit-content;
  backdrop-filter: blur(var(--ui-blur));
}

.search-container.has-results {
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.4);
}

.search-bar {
  display: flex;
  align-items: center;
  padding: 14px 18px;
  gap: 12px;
  background: var(--card-bg);
  z-index: 10;
}

.search-input-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 12px;
}

.search-icon {
  color: var(--el-color-primary);
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-color);
  font-size: 18px;
  font-weight: 400;
}

.search-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.action-btn {
  background: transparent;
  border: none;
  color: var(--text-color-secondary);
  cursor: pointer;
  padding: 6px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  position: relative;
}

.action-btn:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.action-btn.active {
  color: var(--el-color-primary);
  background: rgba(var(--el-color-primary-rgb), 0.1);
}

.filter-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 6px;
  height: 6px;
  background: var(--el-color-primary);
  border-radius: 50%;
  border: 2px solid var(--card-bg);
}

.divider {
  width: 1px;
  height: 20px;
  background: var(--border-color);
  margin: 0 4px;
}

.results-container {
  border-top: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  max-height: 500px;
  backdrop-filter: blur(var(--ui-blur));
  animation: resultsSlideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes resultsSlideDown {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

/* 面板整体渐变缩放动画 */
.search-fade-enter-active,
.search-fade-leave-active {
  transition: all 0.2s ease;
}

.search-fade-enter-from,
.search-fade-leave-to {
  opacity: 0;
  transform: scale(0.98) translateY(-10px);
}

.search-results {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.no-results {
  padding: 60px 20px;
  text-align: center;
  color: var(--text-color-secondary);
}

.no-results p {
  font-size: 15px;
  margin-bottom: 8px;
}

.filter-hint {
  font-size: 12px;
  opacity: 0.7;
}

.search-result-item {
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  position: relative;
  transition: all 0.2s;
  margin-bottom: 4px;
}

.search-result-item:hover,
.search-result-item.active {
  background: var(--hover-bg);
}

.search-result-item.active {
  outline: 1px solid var(--el-color-primary);
}

.result-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 6px;
}

.role-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.role-tag.user {
  background: rgba(var(--el-color-primary-rgb), 0.1);
  color: var(--el-color-primary);
}

.role-tag.assistant {
  background: rgba(var(--el-color-success-rgb), 0.1);
  color: var(--el-color-success);
}

.time-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-secondary);
}

.result-snippet {
  font-size: 13px;
  color: var(--text-color);
  line-height: 1.5;
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
}

:deep(.highlight) {
  background: var(--el-color-warning-light-7);
  color: var(--el-color-warning);
  font-weight: bold;
  padding: 0 2px;
  border-radius: 2px;
}

.arrow-icon {
  position: absolute;
  right: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-color-secondary);
  opacity: 0;
  transition: opacity 0.2s;
}

.search-result-item:hover .arrow-icon,
.search-result-item.active .arrow-icon {
  opacity: 1;
}

.search-footer {
  padding: 10px 18px;
  background: var(--hover-bg);
  border-top: 1px solid var(--border-color);
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  color: var(--text-color-secondary);
  opacity: 0.8;
}

.key-hint {
  display: flex;
  gap: 16px;
}

.key-hint span {
  display: flex;
  align-items: center;
  gap: 6px;
}

kbd {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  padding: 1px 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 10px;
  box-shadow: 0 1px 0 rgba(0, 0, 0, 0.1);
}
</style>
