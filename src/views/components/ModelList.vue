<script setup lang="ts">
import { computed } from "vue";
import { Plus, Delete, Edit, View, Search, Tools, Document, ArrowRight } from "@element-plus/icons-vue";
import type { LlmModelInfo } from "../../types/llm-profiles";
import { useModelIcons } from "../../composables/useModelIcons";

interface Props {
  models: LlmModelInfo[];
  editable?: boolean;
  expandState?: Record<string, boolean>;
}

const props = withDefaults(defineProps<Props>(), {
  editable: true,
  expandState: () => ({}),
});

interface Emits {
  (e: "add"): void;
  (e: "edit", index: number): void;
  (e: "delete", index: number): void;
  (e: "fetch"): void;
  (e: "update:expandState", state: Record<string, boolean>): void;
}

const emit = defineEmits<Emits>();

// 按分组组织模型（带索引）
const modelGroups = computed(() => {
  const groups = new Map<string, Array<{ model: LlmModelInfo; index: number }>>();

  props.models.forEach((model, index) => {
    // 使用 getModelGroup 获取分组名称（优先使用图标配置中的 groupName）
    const group = getModelGroup(model);
    if (!groups.has(group)) {
      groups.set(group, []);
    }
    groups.get(group)!.push({ model, index });
  });

  const result = Array.from(groups.entries()).map(([name, items]) => ({
    name,
    models: items,
  }));

  // 如果没有保存的展开状态，默认展开所有分组
  if (Object.keys(props.expandState || {}).length === 0 && result.length > 0) {
    const newState: Record<string, boolean> = {};
    result.forEach(group => {
      newState[group.name] = true;
    });
    emit('update:expandState', newState);
  }

  return result;
});

// 切换分组展开状态
const toggleGroup = (groupName: string) => {
  const newState = { ...props.expandState };
  newState[groupName] = !newState[groupName];
  emit('update:expandState', newState);
};

// 判断分组是否展开
const isGroupExpanded = (groupName: string): boolean => {
  return props.expandState?.[groupName] ?? true;
};

// 使用统一的图标获取方法和分组方法
const { getModelIcon, getModelGroup } = useModelIcons();
</script>

<template>
  <div class="model-list">
    <div class="list-header">
      <span class="model-count">已添加 {{ models.length }} 个模型</span>
      <div class="list-actions">
        <el-button v-if="editable" size="small" @click="emit('fetch')">
          从 API 获取
        </el-button>
        <el-button v-if="editable" type="primary" size="small" :icon="Plus" @click="emit('add')">
          手动添加
        </el-button>
      </div>
    </div>

    <div v-if="models.length === 0" class="list-empty">
      <p>还没有添加任何模型</p>
      <p class="hint">点击"手动添加"或"从 API 获取"来添加模型</p>
    </div>

    <div v-else class="model-groups">
      <div
        v-for="group in modelGroups"
        :key="group.name"
        class="model-group"
      >
        <!-- 分组标题 -->
        <div class="group-header" @click="toggleGroup(group.name)">
          <div class="group-title">
            <el-icon class="expand-icon" :class="{ expanded: isGroupExpanded(group.name) }">
              <ArrowRight />
            </el-icon>
            <span class="group-name">{{ group.name }}</span>
            <span class="group-count">{{ group.models.length }}</span>
          </div>
        </div>

        <!-- 分组内容 -->
        <transition name="group-collapse">
          <div v-show="isGroupExpanded(group.name)" class="group-content">
            <div
              v-for="item in group.models"
              :key="item.model.id"
              class="model-item"
            >
              <!-- Logo -->
              <div class="model-logo">
                <img
                  v-if="getModelIcon(item.model)"
                  :src="getModelIcon(item.model)!"
                  :alt="item.model.name"
                  @error="(e) => ((e.target as HTMLImageElement).style.display = 'none')"
                />
                <div v-else class="logo-placeholder">
                  {{ item.model.name.substring(0, 2).toUpperCase() }}
                </div>
              </div>

              <!-- 模型信息 -->
              <div class="model-info">
                <div class="model-name">{{ item.model.name }}</div>
                <div class="model-id">{{ item.model.id }}</div>
              </div>

              <!-- 能力图标 -->
              <div class="model-capabilities">
                <el-tooltip v-if="item.model.capabilities?.vision" content="视觉能力" placement="top">
                  <el-icon class="capability-icon vision"><View /></el-icon>
                </el-tooltip>
                <el-tooltip v-if="item.model.capabilities?.webSearch" content="联网搜索" placement="top">
                  <el-icon class="capability-icon web-search"><Search /></el-icon>
                </el-tooltip>
                <el-tooltip v-if="item.model.capabilities?.toolUse" content="工具调用" placement="top">
                  <el-icon class="capability-icon tool-use"><Tools /></el-icon>
                </el-tooltip>
                <el-tooltip v-if="item.model.capabilities?.codeExecution" content="代码执行" placement="top">
                  <el-icon class="capability-icon code-exec"><Document /></el-icon>
                </el-tooltip>
              </div>

              <!-- 操作按钮 -->
              <div v-if="editable" class="model-actions">
                <el-button
                  size="small"
                  :icon="Edit"
                  @click="emit('edit', item.index)"
                />
                <el-button
                  size="small"
                  type="danger"
                  :icon="Delete"
                  @click="emit('delete', item.index)"
                />
              </div>
            </div>
          </div>
        </transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.model-list {
  width: 100%;
}

.list-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.model-count {
  font-size: 14px;
  color: var(--text-color);
}

.list-actions {
  display: flex;
  gap: 8px;
}

.list-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-color-light);
  background: var(--container-bg);
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
}

.list-empty .hint {
  font-size: 12px;
  margin-top: 8px;
}

.model-groups {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.model-group {
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  padding: 8px 12px;
  background: var(--container-bg);
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;
}

.group-header:hover {
  background: var(--card-bg);
}

.group-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-icon {
  transition: transform 0.3s ease;
  color: var(--text-color-secondary);
}

.expand-icon.expanded {
  transform: rotate(90deg);
}

.group-name {
  font-weight: 600;
  font-size: 14px;
  color: var(--text-color);
}

.group-count {
  font-size: 12px;
  color: var(--text-color-light);
  padding: 1px 6px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 10px;
  line-height: 1.4;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 18px;
}

.group-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: transparent;
}

/* 折叠动画 */
.group-collapse-enter-active,
.group-collapse-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.group-collapse-enter-from,
.group-collapse-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}

.group-collapse-enter-to,
.group-collapse-leave-from {
  opacity: 1;
  max-height: 1000px;
}

.model-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color-light);
  background: var(--card-bg);
  transition: all 0.2s;
}

.model-item:hover {
  border-color: var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.model-logo {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.model-logo img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 4px;
}

.logo-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  color: #ffffff;
  font-weight: 600;
  font-size: 14px;
  border-radius: 4px;
}

.model-info {
  flex: 1;
  min-width: 0;
}

.model-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 2px;
  line-height: 1.4;
}

.model-id {
  font-size: 12px;
  color: var(--text-color-light);
  font-family: monospace;
  line-height: 1.4;
}

.model-capabilities {
  display: flex;
  align-items: center;
  gap: 8px;
}

.capability-icon {
  font-size: 18px;
  cursor: help;
  flex-shrink: 0;
}

.capability-icon.vision {
  color: #409eff;
}

.capability-icon.web-search {
  color: #67c23a;
}

.capability-icon.tool-use {
  color: #e6a23c;
}

.capability-icon.code-exec {
  color: #f56c6c;
}

.model-actions {
  display: flex;
  gap: 4px;
}
</style>