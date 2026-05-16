<template>
  <div class="search-input">
    <!-- 搜索/替换主区域 -->
    <div class="search-input__main">
      <!-- 左侧 chevron 切换按钮 -->
      <button class="search-input__replace-toggle" @click="showReplace = !showReplace">
        <ChevronRight :size="16" :class="{ rotated: showReplace }" />
      </button>

      <!-- 右侧输入区 -->
      <div class="search-input__inputs">
        <!-- 搜索行 -->
        <div class="search-input__row">
          <div class="search-input__field">
            <textarea
              ref="searchTextarea"
              v-model="pattern"
              class="search-input__textarea"
              placeholder="搜索内容..."
              rows="1"
              @keydown="onSearchKeydown"
              @input="autoResize"
            />
          </div>
          <div class="search-input__toggles">
            <el-tooltip content="大小写敏感 (Aa)" :show-after="500">
              <button
                class="search-input__toggle"
                :class="{ active: caseSensitive }"
                @click="caseSensitive = !caseSensitive"
              >
                Aa
              </button>
            </el-tooltip>
            <el-tooltip content="正则表达式 (.*)" :show-after="500">
              <button class="search-input__toggle" :class="{ active: isRegex }" @click="isRegex = !isRegex">.*</button>
            </el-tooltip>
            <el-tooltip content="全词匹配 (W)" :show-after="500">
              <button class="search-input__toggle" :class="{ active: wholeWord }" @click="wholeWord = !wholeWord">
                W
              </button>
            </el-tooltip>
          </div>
        </div>

        <!-- 替换行 -->
        <div v-if="showReplace" class="search-input__row">
          <div class="search-input__field">
            <textarea
              v-model="replacement"
              class="search-input__textarea"
              placeholder="替换为..."
              rows="1"
              @keydown="onReplaceKeydown"
              @input="autoResize"
            />
          </div>
          <div class="search-input__toggles">
            <el-tooltip content="保留大小写 (AB)" :show-after="500">
              <button
                class="search-input__toggle"
                :class="{ active: preserveCase }"
                @click="preserveCase = !preserveCase"
              >
                AB
              </button>
            </el-tooltip>
            <el-tooltip content="替换全部" :show-after="500">
              <button class="search-input__toggle action" :disabled="!canReplace" @click="$emit('replaceAll')">
                <Replace :size="14" />
              </button>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>

    <!-- 过滤器 -->
    <div class="search-input__filters">
      <div class="search-input__filter-row">
        <label class="search-input__filter-label">包含:</label>
        <input
          v-model="includeGlobs"
          class="search-input__filter-input"
          placeholder="*.md, *.txt"
          @keydown="onIncludeKeydown"
        />
      </div>
      <div class="search-input__filter-row">
        <label class="search-input__filter-label">排除:</label>
        <input
          v-model="excludeGlobs"
          class="search-input__filter-input"
          placeholder="node_modules, *.lock"
          @keydown="onExcludeKeydown"
        />
      </div>
      <div class="search-input__filter-row">
        <el-tooltip content="尊重搜索目录内的 .gitignore 规则" :show-after="500">
          <label class="search-input__filter-toggle" @click="useGitignore = !useGitignore">
            <span class="search-input__filter-checkbox" :class="{ active: useGitignore }">✓</span>
            <span>使用 .gitignore</span>
          </label>
        </el-tooltip>
      </div>

      <!-- 折叠设置区域 -->
      <div
        class="search-input__settings-header"
        @click="uiState.showAdvancedSettings.value = !uiState.showAdvancedSettings.value"
      >
        <ChevronRight :size="14" :class="{ rotated: uiState.showAdvancedSettings.value }" />
        <span>搜索设置</span>
      </div>
      <div class="search-input__settings-body" :class="{ expanded: uiState.showAdvancedSettings.value }">
        <div class="search-input__settings-content">
          <div class="search-input__filter-row search-input__filter-row--split">
            <el-tooltip content="搜索时自动展开文件（关闭可提升大量结果时的渲染性能）" :show-after="500">
              <label
                class="search-input__filter-toggle"
                @click="uiState.autoExpandResults.value = !uiState.autoExpandResults.value"
              >
                <span class="search-input__filter-checkbox" :class="{ active: uiState.autoExpandResults.value }"
                  >✓</span
                >
                <span>自动展开</span>
              </label>
            </el-tooltip>
            <el-tooltip content="搜索结果数量上限（0 = 无限制）" :show-after="500">
              <div class="search-input__max-results">
                <label class="search-input__filter-label">上限:</label>
                <input
                  v-model.number="uiState.maxResults.value"
                  class="search-input__max-results-input"
                  type="number"
                  min="0"
                  step="1000"
                  placeholder="10000"
                />
              </div>
            </el-tooltip>
          </div>
          <div class="search-input__filter-row search-input__filter-row--split">
            <el-tooltip content="在结果中显示匹配行的上下文（类似 grep -C）" :show-after="500">
              <label
                class="search-input__filter-toggle"
                @click="uiState.contextLinesEnabled.value = !uiState.contextLinesEnabled.value"
              >
                <span class="search-input__filter-checkbox" :class="{ active: uiState.contextLinesEnabled.value }"
                  >✓</span
                >
                <span>扩展上下文</span>
              </label>
            </el-tooltip>
            <el-tooltip content="匹配行前后各显示的行数（1-10）" :show-after="500">
              <div class="search-input__max-results">
                <label class="search-input__filter-label">行数:</label>
                <input
                  v-model.number="uiState.contextLinesCount.value"
                  class="search-input__max-results-input"
                  type="number"
                  min="1"
                  max="10"
                  step="1"
                  placeholder="2"
                  :disabled="!uiState.contextLinesEnabled.value"
                />
              </div>
            </el-tooltip>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from "vue";
import { ChevronRight, Replace } from "lucide-vue-next";
import { useInputHistory, useAutoSaveHistory } from "../composables/useInputHistory";
import { useDirSearchUiState } from "../composables/useDirSearchUiState";

const pattern = defineModel<string>("pattern", { required: true });
const replacement = defineModel<string>("replacement", { required: true });
const isRegex = defineModel<boolean>("isRegex", { required: true });
const caseSensitive = defineModel<boolean>("caseSensitive", { required: true });
const wholeWord = defineModel<boolean>("wholeWord", { required: true });
const includeGlobs = defineModel<string>("includeGlobs", { required: true });
const excludeGlobs = defineModel<string>("excludeGlobs", { required: true });
const useGitignore = defineModel<boolean>("useGitignore", { required: true });
const showReplace = defineModel<boolean>("showReplace", { required: true });
const preserveCase = defineModel<boolean>("preserveCase", { required: true });

const emit = defineEmits<{
  search: [];
  replaceAll: [];
}>();

const searchTextarea = ref<HTMLTextAreaElement | null>(null);
const canReplace = computed(() => pattern.value.length > 0);

// 历史记录集成
const uiState = useDirSearchUiState();

// 1. 键盘回溯 (ArrowUp/Down)
const { onKeydown: onSearchHistoryKeydown } = useInputHistory(uiState.searchHistory, pattern);
const { onKeydown: onReplaceHistoryKeydown } = useInputHistory(uiState.replacementHistory, replacement);
const { onKeydown: onIncludeHistoryKeydown } = useInputHistory(uiState.includeHistory, includeGlobs);
const { onKeydown: onExcludeHistoryKeydown } = useInputHistory(uiState.excludeHistory, excludeGlobs);

// 2. 自动保存 (停止输入 2.5s 后)
useAutoSaveHistory(uiState.searchHistory, pattern, { maxLength: 20 });
useAutoSaveHistory(uiState.replacementHistory, replacement, { maxLength: 20 });
useAutoSaveHistory(uiState.includeHistory, includeGlobs, { maxLength: 10 });
useAutoSaveHistory(uiState.excludeHistory, excludeGlobs, { maxLength: 10 });

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    emit("search");
    return;
  }
  // 历史记录导航
  onSearchHistoryKeydown(e);
}

function onReplaceKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    emit("replaceAll");
    return;
  }
  // 历史记录导航
  onReplaceHistoryKeydown(e);
}

function onIncludeKeydown(e: KeyboardEvent) {
  onIncludeHistoryKeydown(e);
}

function onExcludeKeydown(e: KeyboardEvent) {
  onExcludeHistoryKeydown(e);
}

function autoResize(e: Event) {
  const target = e.target as HTMLTextAreaElement;
  target.style.height = "auto";
  target.style.height = Math.min(target.scrollHeight, 120) + "px";
}

onMounted(() => {
  nextTick(() => {
    searchTextarea.value?.focus();
  });
});
</script>

<style scoped>
.search-input {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  border-bottom: 1px solid var(--border-color);
}

.search-input__main {
  display: flex;
  align-items: stretch;
  gap: 4px;
}

.search-input__replace-toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  min-height: 26px;
  flex-shrink: 0;
  border: none;
  background: transparent;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  border-radius: 3px;
  padding: 0;
  transition: color 0.15s;
}

.search-input__replace-toggle:hover {
  color: var(--el-text-color-primary);
  background-color: var(--container-bg);
}

.search-input__replace-toggle .rotated {
  transform: rotate(90deg);
}

.search-input__replace-toggle svg {
  transition: transform 0.2s;
}

.search-input__inputs {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.search-input__row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.search-input__field {
  flex: 1;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  transition: border-color 0.2s;
}

.search-input__field:focus-within {
  border-color: var(--el-color-primary);
}

.search-input__textarea {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--el-text-color-primary);
  font-size: 13px;
  font-family: var(--el-font-family);
  padding: 5px 8px;
  resize: none;
  line-height: 1.4;
  min-height: 26px;
  max-height: 120px;
  overflow-y: auto;
  box-sizing: border-box;
}

.search-input__textarea::placeholder {
  color: var(--el-text-color-placeholder);
}

.search-input__toggles {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

.search-input__toggle {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 4px;
  border: 1px solid transparent;
  border-radius: 4px;
  background: transparent;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  font-weight: 600;
  font-family: monospace;
  cursor: pointer;
  transition: all 0.15s;
}

.search-input__toggle:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
  color: var(--el-text-color-primary);
}

.search-input__toggle.active {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-primary);
  border-color: var(--el-color-primary);
}

.search-input__toggle.action {
  color: var(--el-text-color-regular);
}

.search-input__toggle.action:hover:not(:disabled) {
  color: var(--el-color-primary);
}

.search-input__toggle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.search-input__filters {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-input__filter-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.search-input__filter-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  min-width: 32px;
}

.search-input__filter-input {
  flex: 1;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--el-text-color-primary);
  font-size: 12px;
  padding: 3px 8px;
  outline: none;
  transition: border-color 0.2s;
}

.search-input__filter-input:focus {
  border-color: var(--el-color-primary);
}

.search-input__filter-input::placeholder {
  color: var(--el-text-color-placeholder);
}

.search-input__filter-row--split {
  justify-content: space-between;
}

/* 折叠设置区域 */
.search-input__settings-header {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
  margin-top: 2px;
}

.search-input__settings-header:hover {
  color: var(--el-text-color-primary);
}

.search-input__settings-header svg {
  transition: transform 0.2s;
}

.search-input__settings-header .rotated {
  transform: rotate(90deg);
}

.search-input__settings-body {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.2s ease-out;
}

.search-input__settings-body.expanded {
  max-height: 120px;
}

.search-input__settings-content {
  padding: 4px 0 2px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.search-input__max-results {
  display: flex;
  align-items: center;
  gap: 4px;
}

.search-input__max-results-input {
  width: 64px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--input-bg);
  color: var(--el-text-color-primary);
  font-size: 12px;
  padding: 2px 6px;
  outline: none;
  text-align: right;
  transition: border-color 0.2s;
  appearance: textfield;
  -moz-appearance: textfield;
}

.search-input__max-results-input::-webkit-inner-spin-button,
.search-input__max-results-input::-webkit-outer-spin-button {
  appearance: none;
  -webkit-appearance: none;
  margin: 0;
}

.search-input__max-results-input:focus {
  border-color: var(--el-color-primary);
}

.search-input__filter-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
}

.search-input__filter-toggle:hover {
  color: var(--el-text-color-primary);
}

.search-input__filter-checkbox {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  border: 1px solid var(--border-color);
  border-radius: 3px;
  font-size: 10px;
  color: transparent;
  transition: all 0.15s;
}

.search-input__filter-checkbox.active {
  background-color: var(--el-color-primary);
  border-color: var(--el-color-primary);
  color: #fff;
}
</style>
