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
            />
          </div>
          <div class="search-input__toggles">
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
        <input v-model="includeGlobs" class="search-input__filter-input" placeholder="*.md, *.txt" />
      </div>
      <div class="search-input__filter-row">
        <label class="search-input__filter-label">排除:</label>
        <input v-model="excludeGlobs" class="search-input__filter-input" placeholder="node_modules, *.lock" />
      </div>
      <div class="search-input__filter-row">
        <el-tooltip content="尊重搜索目录内的 .gitignore 规则" :show-after="500">
          <label class="search-input__filter-toggle" @click="useGitignore = !useGitignore">
            <span class="search-input__filter-checkbox" :class="{ active: useGitignore }">✓</span>
            <span>使用 .gitignore</span>
          </label>
        </el-tooltip>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted } from "vue";
import { ChevronRight, Replace } from "lucide-vue-next";

const pattern = defineModel<string>("pattern", { required: true });
const replacement = defineModel<string>("replacement", { required: true });
const isRegex = defineModel<boolean>("isRegex", { required: true });
const caseSensitive = defineModel<boolean>("caseSensitive", { required: true });
const wholeWord = defineModel<boolean>("wholeWord", { required: true });
const includeGlobs = defineModel<string>("includeGlobs", { required: true });
const excludeGlobs = defineModel<string>("excludeGlobs", { required: true });
const useGitignore = defineModel<boolean>("useGitignore", { required: true });
const showReplace = defineModel<boolean>("showReplace", { required: true });

const emit = defineEmits<{
  search: [];
  replaceAll: [];
}>();

const searchTextarea = ref<HTMLTextAreaElement | null>(null);
const canReplace = computed(() => pattern.value.length > 0);

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    emit("search");
  }
}

function onReplaceKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && e.ctrlKey) {
    e.preventDefault();
    emit("replaceAll");
  }
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
