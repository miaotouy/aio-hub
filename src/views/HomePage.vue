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

<template>
  <div class="home-page">
    <!-- 实际内容 -->
    <!-- 固定的头部区域 -->
    <div class="header-section">
      <!-- 快速入口槽 -->
      <div class="quick-access-section">
        <div class="quick-access-cards">
          <component
            :is="
              detachedManager.isDetached(getToolIdFromPath(tool.path))
                ? 'div'
                : 'router-link'
            "
            v-for="tool in visiblePinnedTools"
            :key="tool.path"
            :to="
              detachedManager.isDetached(getToolIdFromPath(tool.path))
                ? undefined
                : tool.path
            "
            class="quick-card"
            @click="handleToolClick(tool.path)"
          >
            <span class="quick-card-icon">
              <component :is="tool.icon" />
            </span>
            <span class="quick-card-name">{{ tool.name }}</span>
          </component>

          <!-- 编辑按钮 -->
          <el-popover
            v-model:visible="quickEditVisible"
            placement="bottom"
            :width="300"
            trigger="click"
            popper-class="quick-edit-popover"
          >
            <template #reference>
              <button class="quick-card quick-card-edit" title="自定义快捷入口">
                <span class="quick-card-icon quick-card-edit-icon">
                  <el-icon><i-ep-edit /></el-icon>
                </span>
                <span class="quick-card-name">自定义</span>
              </button>
            </template>
            <div class="quick-edit-panel">
              <div class="quick-edit-header">
                <span class="quick-edit-title">自定义快捷入口</span>
                <span class="quick-edit-hint">最多选 6 个</span>
              </div>
              <el-select
                v-model="pendingPinnedPaths"
                multiple
                :multiple-limit="6"
                placeholder="选择要固定的工具"
                class="quick-edit-select"
                @change="savePinnedTools"
              >
                <el-option
                  v-for="tool in visibleTools"
                  :key="tool.path"
                  :label="tool.name"
                  :value="tool.path"
                />
              </el-select>
            </div>
          </el-popover>
        </div>
      </div>

      <!-- 搜索栏 -->
      <div class="search-bar">
        <input
          v-model="searchText"
          type="text"
          placeholder="搜索工具..."
          class="search-input"
        />
      </div>
    </div>

    <!-- 可滚动的内容区域 -->
    <div class="content-section">
      <div class="portal-layout">
        <!-- 垂直分类侧边栏 -->
        <div v-if="categories.length > 1" class="category-sidebar">
          <button
            v-for="category in categories"
            :key="category"
            @click="selectedCategory = category"
            :class="{ active: selectedCategory === category }"
            class="sidebar-item"
          >
            <span class="category-name">{{ category }}</span>
            <span class="category-badge">{{ getCategoryCount(category) }}</span>
          </button>
        </div>

        <!-- 工具网格容器 -->
        <div class="tool-grid-container">
          <div v-if="filteredTools.length > 0" class="tool-grid">
            <!-- 使用 component :is 动态渲染，已分离的工具使用 div，未分离的使用 router-link -->
            <component
              :is="
                detachedManager.isDetached(getToolIdFromPath(tool.path))
                  ? 'div'
                  : 'router-link'
              "
              v-for="tool in filteredTools"
              :key="tool.path"
              :to="
                detachedManager.isDetached(getToolIdFromPath(tool.path))
                  ? undefined
                  : tool.path
              "
              :class="[
                'tool-card',
                {
                  'tool-card-detached': detachedManager.isDetached(
                    getToolIdFromPath(tool.path)
                  ),
                },
              ]"
              @click="handleToolClick(tool.path)"
            >
              <!-- 已分离徽章（带下拉菜单） -->
              <el-dropdown
                v-if="detachedManager.isDetached(getToolIdFromPath(tool.path))"
                class="detached-badge-dropdown"
                trigger="hover"
                @command="
                  (command: string) => handleDropdownCommand(command, tool.path)
                "
              >
                <div class="detached-badge" @click.stop>
                  <el-icon><i-ep-full-screen /></el-icon>
                </div>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="cancel">
                      取消分离
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>

              <!-- 统一的图标容器 -->
              <span class="icon-wrapper">
                <component :is="tool.icon" />
              </span>
              <div class="tool-name">{{ tool.name }}</div>
              <div class="tool-description">{{ tool.description }}</div>
            </component>
          </div>

          <!-- 空状态 -->
          <div v-else class="empty-state">
            <div class="empty-icon">🔍</div>
            <div class="empty-text">
              {{
                visibleTools.length === 0
                  ? "没有可显示的工具"
                  : "未找到匹配的工具"
              }}
            </div>
            <el-button
              v-if="visibleTools.length === 0"
              type="primary"
              @click="router.push('/settings')"
            >
              前往设置页面配置工具
            </el-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useDetachedManager } from "../composables/useDetachedManager";
import { useToolsStore } from "@/stores/tools";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { customMessage } from "@/utils/customMessage";

const router = useRouter();
const toolsStore = useToolsStore();
const appSettingsStore = useAppSettingsStore();
const detachedManager = useDetachedManager();

// 搜索文本
const searchText = ref("");

// 选中的分类
const selectedCategory = ref("全部");

// 快速入口编辑 popover 可见状态
const quickEditVisible = ref(false);
// 编辑中的待选槽位路径（与 store 独立，保存时再同步）
const pendingPinnedPaths = ref<string[]>([]);

// 获取分类下的工具数量
const getCategoryCount = (category: string): number => {
  if (category === "全部") {
    return visibleTools.value.length;
  }
  return visibleTools.value.filter((tool) => {
    if (!tool.category) return false;
    if (Array.isArray(tool.category)) {
      return tool.category.includes(category);
    }
    return tool.category === category;
  }).length;
};

// 从路径提取工具ID（与设置页面保持一致）
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-applier 转换为 regexApply
  return path
    .substring(1)
    .replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 使用 store 中的设置
const settings = computed(() => appSettingsStore.settings);
// 获取所有分类
const categories = computed(() => {
  const cats = new Set<string>(["全部"]);
  toolsStore.orderedTools.forEach((tool) => {
    if (tool.category) {
      if (Array.isArray(tool.category)) {
        tool.category.forEach((cat) => cats.add(cat));
      } else {
        cats.add(tool.category);
      }
    }
  });
  return Array.from(cats);
});

// 计算可见的工具列表（包括已分离的工具，用于显示）
const visibleTools = computed(() => {
  if (!settings.value.toolsVisible) {
    // 如果没有配置，显示所有工具（使用排序后的列表）
    return toolsStore.orderedTools;
  }

  return toolsStore.orderedTools.filter((tool) => {
    const toolId = getToolIdFromPath(tool.path);
    // 明确处理 undefined：默认显示（true）
    const isVisible = settings.value.toolsVisible![toolId];
    return isVisible !== false;
  });
});

// 快速入口仅显示当前允许在主页展示的工具
const visiblePinnedTools = computed(() => {
  const visiblePaths = new Set(visibleTools.value.map((tool) => tool.path));
  return toolsStore.pinnedQuickAccessTools.filter((tool) =>
    visiblePaths.has(tool.path)
  );
});

// 保存快速入口槽的修改
function savePinnedTools() {
  toolsStore.updatePinnedQuickAccess(pendingPinnedPaths.value);
}

// 打开编辑 popover 时同步当前槽位到待编辑状态
watch(quickEditVisible, (visible) => {
  if (visible) {
    pendingPinnedPaths.value = [...toolsStore.pinnedQuickAccessPaths];
  }
});

// 过滤后的工具列表（应用搜索和分类筛选）
const filteredTools = computed(() => {
  let result = [...visibleTools.value];

  // 分类过滤
  if (selectedCategory.value !== "全部") {
    result = result.filter((tool) => {
      if (!tool.category) return false;
      if (Array.isArray(tool.category)) {
        return tool.category.includes(selectedCategory.value);
      }
      return tool.category === selectedCategory.value;
    });
  }

  // 搜索过滤
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    result = result.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search) ||
        tool.description?.toLowerCase().includes(search)
    );
  }

  return result;
});
// 处理工具卡片点击
const handleToolClick = async (toolPath: string) => {
  const toolId = getToolIdFromPath(toolPath);

  // 如果工具已分离，聚焦其窗口（此时是 div，不会触发导航）
  if (detachedManager.isDetached(toolId)) {
    await detachedManager.focusWindow(toolId);
    return;
  }

  // 仅记录实际进入主页标签页的工具
  toolsStore.addRecentTool(toolPath);

  // 显式打开标签（虽然 App.vue 也有监听，但这里显式调用更安全）
  toolsStore.openTool(toolPath);
  // 如果工具未分离，让 router-link 正常导航（无需额外处理）
};

// 处理下拉菜单命令
const handleDropdownCommand = async (command: string, toolPath: string) => {
  if (command === "cancel") {
    const toolId = getToolIdFromPath(toolPath);

    try {
      const success = await detachedManager.closeWindow(toolId);
      if (success) {
        customMessage.success("已取消分离");
      } else {
        customMessage.error("取消分离失败");
      }
    } catch (error) {
      console.error("取消分离时出错:", error);
      customMessage.error("取消分离时出错");
    }
  }
};

onMounted(async () => {
  // 初始化统一的分离窗口管理器
  await detachedManager.initialize();
});
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  text-align: center;
  box-sizing: border-box;
  overflow: hidden; /* 防止整体滚动 */
}

/* 固定头部区域 */
.header-section {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 20px 15px 20px;
  box-sizing: border-box;
  width: 100%;
}

/* 可滚动内容区域 */
.content-section {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  /* padding 移到内层，避免 overflow:hidden 裁掉卡片 hover 阴影 */
  padding: 0 0 20px 0;
  box-sizing: border-box;
  width: 100%;
}

/* 快速入口槽区域 */
.quick-access-section {
  display: flex;
  justify-content: center;
  width: 100%;
  max-width: 1200px;
  margin-bottom: 15px;
}

.quick-access-cards {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
  align-items: flex-start;
}

/* 快捷方式矩形卡片 */
.quick-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 80px;
  height: 80px;
  border-radius: 12px;
  background: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  text-decoration: none;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s ease;
  box-sizing: border-box;
  /* reset button 默认样式 */
  font-family: inherit;
  font-size: inherit;
  padding: 0;
}

.quick-card:hover {
  border-color: var(--primary-color);
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(var(--primary-color-rgb), 0.15);
}

.quick-card-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  font-size: 28px;
  line-height: 1;
  color: var(--primary-color);
}

.quick-card-icon svg,
.quick-card-icon img {
  width: 1em;
  height: 1em;
}

.quick-card-name {
  font-size: 0.75rem;
  color: var(--text-color);
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 68px;
  line-height: 1.2;
}

/* 编辑按钮卡片 */
.quick-card-edit {
  border-style: dashed;
  background: transparent;
}

.quick-card-edit:hover {
  background: color-mix(in srgb, var(--primary-color) 8%, transparent);
}

.quick-card-edit-icon {
  color: var(--text-color-light);
  font-size: 22px;
  width: 22px;
  height: 22px;
}

.quick-card-edit .quick-card-name {
  color: var(--text-color-light);
}

/* 快速入口编辑面板 */
.quick-edit-panel {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.quick-edit-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.quick-edit-title {
  font-size: 0.9rem;
  font-weight: bold;
  color: var(--text-color);
}

.quick-edit-hint {
  font-size: 0.75rem;
  color: var(--text-color-light);
}

.quick-edit-select {
  width: 100%;
}

/* 门户新布局 */
.portal-layout {
  display: flex;
  flex-direction: row;
  width: 100%;
  max-width: 1200px;
  height: 100%;
  gap: 20px;
  align-items: flex-start;
  overflow: hidden;
  /* 内侧留出水平边距，让卡片 hover 阴影不被裁掉 */
  padding: 0 20px;
  box-sizing: border-box;
}

/* 垂直分类侧边栏 */
.category-sidebar {
  width: 140px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  max-height: 100%;
  padding: 4px 8px 0 4px;
  text-align: left;
  box-sizing: border-box;
}

.sidebar-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: 10px 12px;
  background: transparent;
  border: none;
  border-radius: 6px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  text-align: left;
  box-sizing: border-box;
}

.sidebar-item:hover {
  background: var(--input-bg);
}

.sidebar-item.active {
  background: color-mix(in srgb, var(--primary-color) 15%, transparent);
  color: var(--primary-color);
  font-weight: bold;
  border-left: 3px solid var(--primary-color);
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
}

.category-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  margin-right: 8px;
}

.category-badge {
  font-size: 0.75rem;
  padding: 2px 6px;
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-color-light);
  flex-shrink: 0;
}

.sidebar-item.active .category-badge {
  background: var(--primary-color);
  color: white;
}

/* 工具网格容器 */
.tool-grid-container {
  flex: 1;
  overflow-y: auto;
  height: 100%;
  display: flex;
  flex-direction: column;
  /* 右侧留出滚动条空间，同时让顶部有内边距给卡片 hover 留空间 */
  padding: 4px 4px 0 4px;
  box-sizing: border-box;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  padding: 0 0 20px 0;
  width: 100%;
  box-sizing: border-box;
}

.tool-card {
  background-color: var(--card-bg);
  border: var(--border-width) solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  padding: 25px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  /* 顶部对齐，保证图标和名字位置一致 */
  text-decoration: none;
  /* 移除 router-link 下划线 */
  color: var(--text-color);
  transition: all 0.3s ease;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  /* 轻微阴影 */
  cursor: pointer;
}

.tool-card:hover {
  transform: translateY(-5px);
  /* 悬停上浮效果 */
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
  border-color: var(--primary-color);
}

.el-icon {
  margin-bottom: 15px;
  color: var(--primary-color);
  /* 图标颜色 */
}

.tool-name {
  font-size: 1.2em;
  font-weight: bold;
  margin-bottom: 8px;
  color: var(--text-color);
}
.tool-description {
  font-size: 0.9em;
  color: var(--text-color-light);
  text-align: center;
  line-height: 1.5;
  /* 固定高度为3行，超出部分省略 */
  display: -webkit-box;
  line-clamp: 3;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  min-height: calc(1.5em * 3); /* 确保至少占据3行高度 */
}

/* 搜索栏 */
.search-bar {
  width: 100%;
  max-width: 1200px;
  margin-bottom: 10px;
  backdrop-filter: blur(var(--ui-blur));
  padding: 0 10px;
  box-sizing: border-box;
}

.search-input {
  width: 100%;
  padding: 0.6rem 1rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: var(--border-width) solid var(--border-color);
  border-radius: 8px;
  font-size: 0.95rem;
  box-sizing: border-box;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
}

/* 空状态 */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 3rem 1rem;
  color: var(--text-color-secondary);
  margin-top: 2rem;
}

.empty-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-text {
  font-size: 1rem;
  margin-bottom: 1.5rem;
}

/* 已分离工具的样式 */
.tool-card-detached {
  position: relative;
  border-color: var(--primary-color);
  background: linear-gradient(
    135deg,
    var(--card-bg) 0%,
    rgba(var(--primary-color-rgb), 0.05) 100%
  );
}

.tool-card-detached::before {
  content: "";
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  border: 2px solid var(--primary-color);
  border-radius: 12px;
  opacity: 0.3;
  pointer-events: none;
}

.detached-badge-dropdown {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
}

.detached-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  color: white;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  cursor: pointer;
  transition: all 0.2s ease;
}

.detached-badge:hover {
  transform: scale(1.1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.25);
}

.detached-badge .el-icon {
  font-size: 16px;
  margin: 0;
}

/* 统一的图标容器样式 - 大尺寸 */
.icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  font-size: 48px;
  line-height: 1;
  margin-bottom: 15px;
  color: var(--primary-color);
}

.icon-wrapper svg,
.icon-wrapper img {
  width: 1em;
  height: 1em;
}
</style>
