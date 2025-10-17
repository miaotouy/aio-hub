<template>
  <div class="home-page">
    <span class="title">All In One 工具箱</span>

    <!-- 搜索栏 -->
    <div class="search-bar">
      <input v-model="searchText" type="text" placeholder="搜索工具..." class="search-input" />
    </div>

    <!-- 分类标签 -->
    <div v-if="categories.length > 1" class="category-tabs">
      <button
        v-for="category in categories"
        :key="category"
        @click="selectedCategory = category"
        :class="{ active: selectedCategory === category }"
        class="category-tab"
      >
        {{ category }}
      </button>
    </div>

    <div class="tool-grid">
      <!-- 使用 component :is 动态渲染，已分离的工具使用 div，未分离的使用 router-link -->
      <component
        :is="isToolDetached(getToolIdFromPath(tool.path)) ? 'div' : 'router-link'"
        v-for="tool in filteredTools"
        :key="tool.path"
        :to="isToolDetached(getToolIdFromPath(tool.path)) ? undefined : tool.path"
        :class="[
          'tool-card',
          { 'tool-card-detached': isToolDetached(getToolIdFromPath(tool.path)) },
        ]"
        @click="handleToolClick(tool.path)"
      >
        <!-- 已分离徽章（带下拉菜单） -->
        <el-dropdown
          v-if="isToolDetached(getToolIdFromPath(tool.path))"
          class="detached-badge-dropdown"
          trigger="hover"
          @command="(command: string) => handleDropdownCommand(command, tool.path)"
        >
          <div class="detached-badge" @click.stop>
            <el-icon><i-ep-full-screen /></el-icon>
          </div>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="cancel"> 取消分离 </el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>

        <el-icon :size="48">
          <component :is="tool.icon" />
        </el-icon>
        <div class="tool-name">{{ tool.name }}</div>
        <div class="tool-description">{{ tool.description }}</div>
      </component>
    </div>

    <!-- 空状态 -->
    <div v-if="filteredTools.length === 0" class="empty-state">
      <div class="empty-icon">🔍</div>
      <div class="empty-text">
        {{ visibleTools.length === 0 ? "没有可显示的工具" : "未找到匹配的工具" }}
      </div>
      <el-button v-if="visibleTools.length === 0" type="primary" @click="router.push('/settings')">
        前往设置页面配置工具
      </el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { toolsConfig } from "../config/tools";
import { loadAppSettingsAsync, type AppSettings } from "../utils/appSettings";
import { useDetachedTools } from "../composables/useDetachedTools";
import { ElMessage } from "element-plus";

const router = useRouter();
const { isToolDetached, focusWindow, closeToolWindow, initializeListeners } = useDetachedTools();

// 搜索文本
const searchText = ref("");

// 选中的分类
const selectedCategory = ref("全部");

// 从路径提取工具ID（与设置页面保持一致）
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 当前设置
const settings = ref<AppSettings>({
  sidebarCollapsed: false,
  theme: "auto",
  trayEnabled: false,
  toolsVisible: {},
  toolsOrder: [],
  version: "1.0.0",
});

// 获取所有分类
const categories = computed(() => {
  const cats = new Set<string>(["全部"]);
  toolsConfig.forEach((tool) => {
    if (tool.category) {
      cats.add(tool.category);
    }
  });
  return Array.from(cats);
});

// 计算可见的工具列表（包括已分离的工具，用于显示）
const visibleTools = computed(() => {
  if (!settings.value.toolsVisible) {
    // 如果没有配置，显示所有工具
    return toolsConfig;
  }

  return toolsConfig.filter((tool) => {
    const toolId = getToolIdFromPath(tool.path);
    // 默认显示未配置的工具
    return settings.value.toolsVisible![toolId] !== false;
  });
});

// 过滤后的工具列表（应用搜索和分类筛选）
const filteredTools = computed(() => {
  let result = [...visibleTools.value];

  // 分类过滤
  if (selectedCategory.value !== "全部") {
    result = result.filter((tool) => tool.category === selectedCategory.value);
  }

  // 搜索过滤
  if (searchText.value.trim()) {
    const search = searchText.value.toLowerCase();
    result = result.filter(
      (tool) =>
        tool.name.toLowerCase().includes(search) || tool.description?.toLowerCase().includes(search)
    );
  }

  return result;
});
// 处理工具卡片点击
const handleToolClick = async (toolPath: string) => {
  const toolId = getToolIdFromPath(toolPath);

  // 如果工具已分离，聚焦其窗口（此时是 div，不会触发导航）
  if (isToolDetached(toolId)) {
    await focusWindow(toolId);
  }
  // 如果工具未分离，让 router-link 正常导航（无需额外处理）
};

// 处理下拉菜单命令
const handleDropdownCommand = async (command: string, toolPath: string) => {
  if (command === "cancel") {
    const toolId = getToolIdFromPath(toolPath);

    try {
      const success = await closeToolWindow(toolId);
      if (success) {
        ElMessage.success("已取消分离");
      } else {
        ElMessage.error("取消分离失败");
      }
    } catch (error) {
      console.error("取消分离时出错:", error);
      ElMessage.error("取消分离时出错");
    }
  }
};

// 监听localStorage变化以实时更新（保留以防万一，但主要依赖路由变化）
const handleStorageChange = async () => {
  settings.value = await loadAppSettingsAsync();
};

onMounted(async () => {
  // 初始化分离工具监听器
  await initializeListeners();

  // 初始化时加载设置
  settings.value = await loadAppSettingsAsync();
  // 监听storage事件，以便在设置页面保存后实时更新
  window.addEventListener("storage", handleStorageChange);
});

// 组件卸载时清理
onUnmounted(() => {
  window.removeEventListener("storage", handleStorageChange);
});

// 也可以通过路由守卫在从设置页返回时重新加载
watch(
  () => router.currentRoute.value.path,
  async (newPath, oldPath) => {
    if (oldPath === "/settings" && newPath === "/") {
      settings.value = await loadAppSettingsAsync();
    }
  }
);
</script>

<style scoped>
.home-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  /* 顶部对齐 */
  height: 100%;
  text-align: center;
  padding: 40px 20px 20px 20px;
  /* 统一设置内边距：上40px，左右20px，下20px */
  box-sizing: border-box;
  /* 确保 padding 包含在 height 内 */
  overflow-y: auto;
  /* 如果内容超出，允许滚动 */
}

.title {
  font-size: 2.5em;
  font-weight: bold;
  margin-bottom: 20px;
  color: var(--text-color);
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  /* 响应式网格布局 */
  gap: 25px;
  /* 间距 */
  padding: 20px;
  max-width: 1200px;
  /* 控制最大宽度 */
  width: 100%;
  box-sizing: border-box;
  /* 确保 padding 包含在 width 内 */
}

.tool-card {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 25px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
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
}

/* 搜索栏 */
.search-bar {
  width: 100%;
  max-width: 600px;
  margin-bottom: 1.5rem;
}

.search-input {
  width: 100%;
  padding: 0.75rem 1rem;
  background: var(--input-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  font-size: 1rem;
  box-sizing: border-box;
  transition: all 0.2s;
}

.search-input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
}

/* 分类标签 */
.category-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  justify-content: center;
}

.category-tab {
  padding: 0.6rem 1.2rem;
  background: var(--card-bg);
  color: var(--text-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s;
  font-weight: 500;
}

.category-tab:hover {
  border-color: var(--primary-color);
  background: var(--input-bg);
  transform: translateY(-2px);
}

.category-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
  box-shadow: 0 4px 12px rgba(var(--primary-color-rgb), 0.3);
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
  background: linear-gradient(135deg, var(--card-bg) 0%, rgba(var(--primary-color-rgb), 0.05) 100%);
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
</style>
