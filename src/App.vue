<script setup lang="ts">
import { ref, onMounted, computed, watch, onUnmounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useDark, useToggle } from "@vueuse/core";
import { Sunny, Moon, Expand, Fold } from "@element-plus/icons-vue";
import { toolsConfig } from "./config/tools";
import { loadAppSettingsAsync, updateAppSettingsAsync, type AppSettings } from "./utils/appSettings";
import TitleBar from "./components/TitleBar.vue";

const router = useRouter();
const route = useRoute();
const isDark = useDark();
const toggleDark = useToggle(isDark);
const isCollapsed = ref(false); // 控制侧边栏收起状态

// 应用设置
const appSettings = ref<AppSettings>({
  sidebarCollapsed: false,
  toolsVisible: {}
});

// 从路径提取工具ID
const getToolIdFromPath = (path: string): string => {
  // 从 /regex-apply 转换为 regexApply
  return path.substring(1).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
};

// 计算可见的工具列表
const visibleTools = computed(() => {
  if (!appSettings.value.toolsVisible) {
    return toolsConfig; // 如果没有设置，显示所有工具
  }
  
  return toolsConfig.filter(tool => {
    const toolId = getToolIdFromPath(tool.path);
    // 默认为 true，如果未设置则显示
    return appSettings.value.toolsVisible![toolId] !== false;
  });
});

const toggleSidebar = async () => {
  isCollapsed.value = !isCollapsed.value;
  // 使用新的设置管理器保存状态（异步保存）
  updateAppSettingsAsync({ sidebarCollapsed: isCollapsed.value });
};

// 监听设置变化（用于响应设置页面的更改）
const loadSettings = async () => {
  const settings = await loadAppSettingsAsync();
  appSettings.value = settings;
  isCollapsed.value = settings.sidebarCollapsed;
};

// 存储事件处理函数的引用，用于清理
let handleSettingsChange: ((event: Event) => void) | null = null;

onMounted(async () => {
  // 初始加载设置
  await loadSettings();
  
  // 监听设置变化事件（来自设置页面）- 这是主要的同步机制
  handleSettingsChange = (event: Event) => {
    const customEvent = event as CustomEvent<AppSettings>;
    if (customEvent.detail) {
      appSettings.value = customEvent.detail;
      isCollapsed.value = customEvent.detail.sidebarCollapsed;
    }
  };
  
  window.addEventListener('app-settings-changed', handleSettingsChange);
});

// 监听路由变化，仅在离开设置页面时更新一次
watch(() => route.path, async (_, oldPath) => {
  if (oldPath === '/settings') {
    // 离开设置页面时从文件系统加载最新设置，确保数据同步
    // 使用 setTimeout 避免与事件处理冲突
    setTimeout(async () => {
      await loadSettings();
    }, 100);
  }
});

// 清理事件监听器
onUnmounted(() => {
  // 移除事件监听器
  if (handleSettingsChange) {
    window.removeEventListener('app-settings-changed', handleSettingsChange);
  }
});


const handleSelect = (key: string) => {
  router.push(key);
};
</script>

<template>
  <!-- 自定义标题栏 -->
  <TitleBar />
  
  <!-- 主布局容器，需要添加padding-top来避让标题栏 -->
  <el-container class="common-layout">
    <el-aside
      :width="isCollapsed ? '64px' : '220px'"
      :class="['main-sidebar', { 'is-collapsed': isCollapsed }]"
    >
      <!-- 上部分：标题和导航 -->
      <div class="sidebar-top">
        <!-- 侧边栏头部：根据isCollapsed显示不同内容 -->
        <div v-if="!isCollapsed" class="sidebar-header" @click="toggleDark()">
          <div class="header-text-wrapper">
            <h2 class="sidebar-title">AIO工具箱</h2>
          </div>
          <el-icon class="theme-icon">
            <component :is="isDark ? Sunny : Moon" />
          </el-icon>
        </div>
        <el-tooltip
          v-else
          effect="dark"
          content="切换主题"
          placement="right"
          :hide-after="0"
        >
          <div class="sidebar-header-collapsed" @click="toggleDark()">
            <el-icon class="theme-icon-only">
              <component :is="isDark ? Sunny : Moon" />
            </el-icon>
          </div>
        </el-tooltip>

        <el-menu
          :default-active="route.path"
          class="el-menu-vertical-demo"
          :collapse="isCollapsed"
          @select="handleSelect"
        >
          <el-menu-item index="/">
            <el-icon><i-ep-home-filled /></el-icon>
            <template #title>主页</template>
          </el-menu-item>
          <el-menu-item v-for="tool in visibleTools" :key="tool.path" :index="tool.path">
            <el-icon><component :is="tool.icon" /></el-icon>
            <template #title>{{ tool.name }}</template>
          </el-menu-item>
        </el-menu>
      </div>

      <!-- 下部分：收起按钮 -->
      <div class="sidebar-bottom">
        <div class="sidebar-actions">
          <el-tooltip
            effect="dark"
            :content="isCollapsed ? '展开侧边栏' : '收起侧边栏'"
            placement="right"
            :hide-after="0"
          >
            <el-button
              :icon="isCollapsed ? Expand : Fold"
              circle
              @click="toggleSidebar"
              class="action-btn collapse-btn"
            />
          </el-tooltip>
        </div>
      </div>
    </el-aside>

    <el-container>
      <el-main class="main-content">
        <router-view></router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style>
.common-layout {
  height: calc(100vh - 32px); /* 减去标题栏高度 */
  width: 100vw;
  overflow: hidden; /* 隐藏整个布局的滚动条 */
  margin-top: 32px; /* 为标题栏留出空间 */
}

.main-sidebar {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-text);
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
  transition: width 0.3s ease; /* 添加宽度过渡效果 */
  overflow-x: hidden; /* 隐藏侧边栏的横向滚动条 */
}

/* 侧边栏三段式布局 */
.sidebar-top {
  flex: 1; /* 占据剩余空间 */
  display: flex;
  flex-direction: column;
  padding-top: 20px;
  overflow-x: hidden; /* 隐藏 sidebar-top 的横向滚动条 */
}

.sidebar-bottom {
  flex: 0 0 auto; /* 不伸缩，保持内容尺寸 */
  padding: 15px 0; /* 垂直内边距15px，水平0 */
  display: flex;
  justify-content: center;
  overflow-x: hidden; /* 隐藏 sidebar-bottom 的横向滚动条 */
}

/* 标题样式 */
.sidebar-header {
  margin-bottom: 30px;
  height: 40px; /* 固定高度，避免收起时跳动 */
  display: flex;
  align-items: center; /* 垂直居中 */
  justify-content: space-between; /* 文本和图标分别在两端 */
  cursor: pointer; /* 表示可点击 */
  user-select: none; /* 防止双击选择文字 */
  padding: 0 20px; /* 增加点击区域的左右内边距，方便点击 */
  box-sizing: border-box; /* 确保padding不会撑大元素 */
  overflow-x: hidden; /* 隐藏 sidebar-header 的横向滚动条 */
}

.sidebar-header .header-text-wrapper {
  display: flex;
  align-items: center;
  flex-grow: 1; /* 让文本区域占据剩余空间 */
  justify-content: center; /* 让标题在文本区域内居中 */
  overflow-x: hidden; /* 隐藏 header-text-wrapper 的横向滚动条 */
}

.sidebar-header .theme-icon {
  font-size: 20px; /* 图标大小 */
  color: var(--sidebar-text); /* 图标颜色与文字一致 */
  transition: color 0.3s ease;
}

.sidebar-header .theme-icon:hover {
  color: var(--primary-color); /* 悬停颜色 */
}

.sidebar-title {
  color: var(--sidebar-text);
  font-size: 24px;
  font-weight: bold;
  margin: 0;
  white-space: nowrap; /* 防止文字换行 */
  overflow: hidden; /* 隐藏溢出文字 */
  transition: opacity 0.3s ease;
}

/* 新增的收起状态下头部样式 */
.sidebar-header-collapsed {
  margin-bottom: 30px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center; /* 图标居中 */
  cursor: pointer;
  user-select: none;
  padding: 0 20px;
  box-sizing: border-box;
  overflow-x: hidden;
}

.sidebar-header-collapsed .theme-icon-only {
  font-size: 20px;
  color: var(--sidebar-text);
  transition: color 0.3s ease;
}

.sidebar-header-collapsed .theme-icon-only:hover {
  color: var(--primary-color);
}

.el-menu-vertical-demo {
  border-right: none;
  background-color: transparent;
  flex-grow: 1; /* 让菜单占据sidebar-top剩余空间 */
  overflow-x: hidden; /* 隐藏菜单的横向滚动条 */
}

.el-menu-vertical-demo:not(.el-menu--collapse) {
  width: 240px; /* 展开时的菜单宽度，与侧边栏宽度一致 */
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  height: 60px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.header-title {
  font-size: 20px;
  color: var(--text-color);
}

.sidebar-actions {
  display: flex;
  justify-content: center;
  gap: 10px; /* 按钮间距 */
  transition: flex-direction 0.3s ease;
}

.main-sidebar.is-collapsed .sidebar-actions {
  flex-direction: column;
  align-items: center; /* 水平居中 */
  gap: 15px; /* 垂直间距 */
}

/*
  修复收起时，菜单图标不居中的问题
  Element Plus 的 el-menu-item 内部有一个 div，需要让这个 div 居中
*/
.el-menu--collapse .el-menu-item > div {
  justify-content: center;
}

.action-btn {
  border: none;
  background: transparent;
  color: var(--text-color);
  padding: 8px; /* 增加点击区域 */
}

.action-btn:hover {
  background-color: var(--primary-color-light);
}

.main-content {
  background-color: var(--bg-color);
  padding: 0;
  overflow-y: auto;
  flex-grow: 1;
  height: 100%;
  box-sizing: border-box;
}

/* 覆盖 Element Plus 默认样式以适应主题 */
.el-menu {
  background-color: transparent !important;
}
.el-menu-item,
.el-sub-menu__title {
  color: var(--sidebar-text) !important;
}
.el-menu-item:hover,
.el-sub-menu__title:hover {
  background-color: var(--primary-color-light) !important;
}
.el-menu-item.is-active {
  background-color: var(--primary-color) !important;
  color: white !important;
}

/* 确保整个应用没有默认边距 */
body {
  margin: 0;
  padding: 0;
  overflow: hidden;
}

/* 为透明窗口添加背景 */
#app {
  background: var(--bg-color);
  min-height: 100vh;
}
</style>
