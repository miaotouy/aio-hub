<template>
  <div class="macro-selector">
      <div class="macro-selector-header">
        <span class="title">可用宏列表</span>
        <el-input
          v-model="searchText"
          placeholder="搜索宏..."
          size="small"
          clearable
          style="width: 200px;"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
      </div>

      <div class="macro-selector-body">
        <!-- 值替换类 -->
        <div
          v-if="filteredMacros.value && filteredMacros.value.length > 0"
          class="macro-group"
        >
          <div class="macro-group-title">值替换</div>
          <div class="macro-list">
            <el-tooltip
              v-for="macro in filteredMacros.value"
              :key="macro.name"
              :content="macro.description"
              placement="right"
              effect="light"
            >
              <div class="macro-item" @click="handleInsertMacro(macro)">
                <span class="macro-name">{{ formatMacroName(macro.name) }}</span>
                <el-icon class="insert-icon"><Plus /></el-icon>
              </div>
            </el-tooltip>
          </div>
        </div>

        <!-- 变量操作类 -->
        <div
          v-if="filteredMacros.variable && filteredMacros.variable.length > 0"
          class="macro-group"
        >
          <div class="macro-group-title">变量操作</div>
          <div class="macro-list">
            <el-tooltip
              v-for="macro in filteredMacros.variable"
              :key="macro.name"
              :content="macro.description"
              placement="right"
              effect="light"
            >
              <div class="macro-item" @click="handleInsertMacro(macro)">
                <span class="macro-name">
                  {{ macro.example || formatMacroName(macro.name) }}
                </span>
                <el-icon class="insert-icon"><Plus /></el-icon>
              </div>
            </el-tooltip>
          </div>
        </div>

        <!-- 动态函数类 -->
        <div
          v-if="filteredMacros.function && filteredMacros.function.length > 0"
          class="macro-group"
        >
          <div class="macro-group-title">动态函数</div>
          <div class="macro-list">
            <el-tooltip
              v-for="macro in filteredMacros.function"
              :key="macro.name"
              :content="macro.description"
              placement="right"
              effect="light"
            >
              <div class="macro-item" @click="handleInsertMacro(macro)">
                <span class="macro-name">
                  {{ macro.example || formatMacroName(macro.name) }}
                </span>
                <el-icon class="insert-icon"><Plus /></el-icon>
              </div>
            </el-tooltip>
          </div>
        </div>

        <!-- 无结果提示 -->
        <div
          v-if="Object.keys(filteredMacros).length === 0"
          class="no-results"
        >
          未找到匹配的宏
        </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, Plus } from "@element-plus/icons-vue";
import { MacroRegistry, type MacroDefinition } from "../../macro-engine";

interface Emits {
  (e: "insert", macro: MacroDefinition): void;
}

const emit = defineEmits<Emits>();

// 搜索文本
const searchText = ref("");

// 获取所有宏并按类型分组
const groupedMacros = computed(() => {
  const registry = MacroRegistry.getInstance();
  const macros = registry.getAllMacros();

  return macros.reduce((acc, macro) => {
    if (!acc[macro.type]) {
      acc[macro.type] = [];
    }
    acc[macro.type].push(macro);
    return acc;
  }, {} as Record<string, MacroDefinition[]>);
});

// 过滤宏列表
const filteredMacros = computed(() => {
  if (!searchText.value.trim()) {
    return groupedMacros.value;
  }

  const searchLower = searchText.value.toLowerCase();
  const filtered: Record<string, MacroDefinition[]> = {};

  Object.entries(groupedMacros.value).forEach(([type, macros]) => {
    const matchedMacros = macros.filter(
      (macro) =>
        macro.name.toLowerCase().includes(searchLower) ||
        macro.description.toLowerCase().includes(searchLower)
    );

    if (matchedMacros.length > 0) {
      filtered[type] = matchedMacros;
    }
  });

  return filtered;
});

/**
 * 格式化宏名称
 */
function formatMacroName(name: string): string {
  return `{{${name}}}`;
}

/**
 * 插入宏
 */
function handleInsertMacro(macro: MacroDefinition) {
  emit("insert", macro);
}
</script>

<style scoped>
.macro-selector {
  display: flex;
  flex-direction: column;
  max-height: 500px;
}

.macro-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
}

.macro-selector-header .title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.macro-selector-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 200px;
}

.macro-group {
  margin-bottom: 16px;
}

.macro-group:last-child {
  margin-bottom: 0;
}

.macro-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  padding-left: 4px;
}

.macro-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.macro-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--el-fill-color-light);
}

.macro-item:hover {
  background-color: var(--el-color-primary-light-9);
  transform: translateX(2px);
}

.macro-item:hover .insert-icon {
  opacity: 1;
}

.macro-name {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: 13px;
  color: var(--el-text-color-primary);
  flex: 1;
}

.insert-icon {
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--el-color-primary);
  font-size: 16px;
}

.no-results {
  text-align: center;
  padding: 40px 20px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>