<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useDark, useToggle } from "@vueuse/core";
import { Sunny, Moon, Expand, Fold } from "@element-plus/icons-vue";
import { toolsConfig } from "./config/tools";
import { loadAppSettings, updateAppSettings } from "./utils/appSettings";
import TitleBar from "./components/TitleBar.vue";

const router = useRouter();
const route = useRoute();
const isDark = useDark();
const toggleDark = useToggle(isDark);
const isCollapsed = ref(false); // 控制侧边栏收起状态

const toggleSidebar = () => {
  isCollapsed.value = !isCollapsed.value;
  // 使用新的设置管理器保存状态
  updateAppSettings({ sidebarCollapsed: isCollapsed.value });
};

onMounted(() => {
  // 使用新的设置管理器加载状态
  const settings = loadAppSettings();
  isCollapsed.value = settings.sidebarCollapsed;
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
          <el-menu-item v-for="tool in toolsConfig" :key="tool.path" :index="tool.path">
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
