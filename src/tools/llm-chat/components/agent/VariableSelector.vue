<template>
  <div class="variable-selector">
    <div class="variable-selector-header">
      <span class="title">可用变量列表</span>
      <el-input v-model="searchText" placeholder="搜索变量..." size="small" clearable style="width: 200px">
        <template #prefix>
          <el-icon><Search /></el-icon>
        </template>
      </el-input>
    </div>

    <div class="variable-selector-body">
      <!-- 根级变量 -->
      <div v-if="filteredVariables.root && filteredVariables.root.length > 0" class="variable-group">
        <div class="variable-group-title">根级变量</div>
        <div class="variable-list">
          <el-tooltip
            v-for="variable in filteredVariables.root"
            :key="variable.path"
            :content="getVariableTooltip(variable)"
            placement="right"
            effect="light"
          >
            <div class="variable-item" @click="handleInsertVariable(variable)">
              <span class="variable-name">{{ formatVariableName(variable.path) }}</span>
              <el-tag v-if="variable.type" size="small" class="variable-type-tag">
                {{ variable.type }}
              </el-tag>
              <el-icon class="insert-icon"><Plus /></el-icon>
            </div>
          </el-tooltip>
        </div>
      </div>

      <!-- 分组变量 -->
      <div v-for="group in filteredVariables.groups" :key="group.name" class="variable-group">
        <div class="variable-group-title">{{ group.name }}</div>
        <div class="variable-list">
          <el-tooltip
            v-for="variable in group.variables"
            :key="variable.path"
            :content="getVariableTooltip(variable)"
            placement="right"
            effect="light"
          >
            <div class="variable-item" @click="handleInsertVariable(variable)">
              <span class="variable-name">{{ formatVariableName(variable.path) }}</span>
              <el-tag v-if="variable.type" size="small" class="variable-type-tag">
                {{ variable.type }}
              </el-tag>
              <el-icon class="insert-icon"><Plus /></el-icon>
            </div>
          </el-tooltip>
        </div>
      </div>

      <!-- 无结果提示 -->
      <div v-if="!hasAnyVariables" class="no-results">
        <template v-if="searchText">未找到匹配的变量</template>
        <template v-else>暂无可用变量</template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { Search, Plus } from "@element-plus/icons-vue";
import type { VariableTreeNode } from "../../types/sessionVariable";

interface VariableItem {
  path: string;
  type?: string;
  description?: string;
  initialValue?: any;
}

interface VariableGroup {
  name: string;
  variables: VariableItem[];
}

interface Props {
  /**
   * 变量树数据
   */
  variables: VariableTreeNode[];
}

interface Emits {
  (e: "insert", variablePath: string): void;
}

const props = defineProps<Props>();
const emit = defineEmits<Emits>();

// 搜索文本
const searchText = ref("");

/**
 * 将变量树扁平化为可选择的变量列表
 */
const flattenedVariables = computed(() => {
  const result: { root: VariableItem[]; groups: VariableGroup[] } = {
    root: [],
    groups: [],
  };

  const flatten = (nodes: VariableTreeNode[], parentPath = "", groupName?: string) => {
    nodes.forEach((node) => {
      const currentPath = parentPath ? `${parentPath}.${node.key}` : node.key;

      if (node.type === "variable") {
        const variable: VariableItem = {
          path: currentPath,
          type: typeof node.initialValue,
          description: node.description,
          initialValue: node.initialValue,
        };

        if (groupName) {
          // 添加到对应分组
          let group = result.groups.find((g) => g.name === groupName);
          if (!group) {
            group = { name: groupName, variables: [] };
            result.groups.push(group);
          }
          group.variables.push(variable);
        } else {
          // 添加到根级
          result.root.push(variable);
        }
      } else if (node.type === "group" && node.children) {
        // 递归处理子节点
        flatten(node.children, currentPath, node.key);
      }
    });
  };

  flatten(props.variables);
  return result;
});

/**
 * 过滤变量列表
 */
const filteredVariables = computed(() => {
  if (!searchText.value.trim()) {
    return flattenedVariables.value;
  }

  const searchLower = searchText.value.toLowerCase();
  const result: { root: VariableItem[]; groups: VariableGroup[] } = {
    root: [],
    groups: [],
  };

  // 过滤根级变量
  result.root = flattenedVariables.value.root.filter(
    (v) => v.path.toLowerCase().includes(searchLower) || v.description?.toLowerCase().includes(searchLower)
  );

  // 过滤分组变量
  flattenedVariables.value.groups.forEach((group) => {
    const matchedVariables = group.variables.filter(
      (v) =>
        v.path.toLowerCase().includes(searchLower) ||
        v.description?.toLowerCase().includes(searchLower) ||
        group.name.toLowerCase().includes(searchLower)
    );

    if (matchedVariables.length > 0) {
      result.groups.push({
        name: group.name,
        variables: matchedVariables,
      });
    }
  });

  return result;
});

/**
 * 是否有任何变量
 */
const hasAnyVariables = computed(() => {
  return filteredVariables.value.root.length > 0 || filteredVariables.value.groups.length > 0;
});

/**
 * 格式化变量名称为插入格式
 */
function formatVariableName(path: string): string {
  return `<svar name="${path}" op="=" value="" />`;
}

/**
 * 获取变量提示信息
 */
function getVariableTooltip(variable: VariableItem): string {
  const parts: string[] = [];

  parts.push(`路径: ${variable.path}`);

  if (variable.type) {
    parts.push(`类型: ${variable.type}`);
  }

  if (variable.initialValue !== undefined) {
    const valueStr = JSON.stringify(variable.initialValue);
    parts.push(`初始值: ${valueStr.length > 50 ? valueStr.slice(0, 50) + "..." : valueStr}`);
  }

  if (variable.description) {
    parts.push(`说明: ${variable.description}`);
  }

  return parts.join("\n");
}

/**
 * 插入变量
 */
function handleInsertVariable(variable: VariableItem) {
  const insertText = formatVariableName(variable.path);
  emit("insert", insertText);
}
</script>

<style scoped>
.variable-selector {
  display: flex;
  flex-direction: column;
  max-height: 500px;
}

.variable-selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  margin-bottom: 12px;
}

.variable-selector-header .title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.variable-selector-body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 200px;
}

.variable-group {
  margin-bottom: 16px;
}

.variable-group:last-child {
  margin-bottom: 0;
}

.variable-group-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
  padding-left: 4px;
}

.variable-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.variable-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  background-color: var(--el-fill-color-light);
  gap: 8px;
}

.variable-item:hover {
  background-color: color-mix(in srgb, var(--el-color-primary-light-5) 20%, transparent);
  transform: translateX(2px);
}

.variable-item:hover .insert-icon {
  opacity: 1;
}

.variable-name {
  font-family: "Consolas", "Monaco", "Courier New", monospace;
  font-size: 13px;
  color: var(--el-text-color-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.variable-type-tag {
  flex-shrink: 0;
}

.insert-icon {
  opacity: 0;
  transition: opacity 0.2s;
  color: var(--el-color-primary);
  font-size: 16px;
  flex-shrink: 0;
}

.no-results {
  text-align: center;
  padding: 40px 20px;
  color: var(--el-text-color-secondary);
  font-size: 14px;
}
</style>
