<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { Sunny, Moon } from '@element-plus/icons-vue';

const router = useRouter();
const isDarkTheme = ref(false);

const toggleTheme = () => {
  isDarkTheme.value = !isDarkTheme.value;
  document.body.classList.toggle('dark-theme', isDarkTheme.value);
  document.body.classList.toggle('light-theme', !isDarkTheme.value);
  localStorage.setItem('theme', isDarkTheme.value ? 'dark' : 'light');
};

onMounted(() => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) {
    isDarkTheme.value = savedTheme === 'dark';
  } else {
    isDarkTheme.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  document.body.classList.toggle('dark-theme', isDarkTheme.value);
  document.body.classList.toggle('light-theme', !isDarkTheme.value);
});

const handleSelect = (key: string) => {
  router.push(key);
};
</script>

<template>
  <el-container class="common-layout">
    <el-aside width="200px" class="main-sidebar">
      <h2 class="sidebar-title">咕咕工具箱</h2>
      <el-menu
        default-active="/"
        class="el-menu-vertical-demo"
        :collapse="false"
        @select="handleSelect"
      >
        <el-menu-item index="/">
          <el-icon><i-ep-home-filled /></el-icon>
          <span>主页</span>
        </el-menu-item>
        <el-menu-item index="/regex-applier">
          <el-icon><i-ep-magic-stick /></el-icon>
          <span>正则应用器</span>
        </el-menu-item>
        <el-menu-item index="/media-info-reader">
          <el-icon><i-ep-picture-filled /></el-icon>
          <span>媒体信息读取器</span>
        </el-menu-item>
        <el-menu-item index="/text-diff">
          <el-icon><i-ep-files /></el-icon>
          <span>文本/JSON对比</span>
        </el-menu-item>
        <!-- 更多工具项可以在这里添加 -->
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="main-header">
        <div class="header-title"></div>
        <div class="header-actions">
          <el-button :icon="isDarkTheme ? Sunny : Moon" circle @click="toggleTheme" class="theme-toggle-btn"></el-button>
        </div>
      </el-header>
      <el-main class="main-content">
        <router-view></router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<style>
/* Remove 'scoped' attribute from here */
.common-layout {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.main-sidebar {
  background-color: var(--sidebar-bg);
  color: var(--sidebar-text);
  padding-top: 20px;
  border-right: 1px solid var(--border-color);
  box-shadow: 2px 0 6px rgba(0, 0, 0, 0.05);
  display: flex;
  flex-direction: column;
}

.sidebar-title {
  text-align: center;
  margin-bottom: 30px;
  color: var(--sidebar-text);
  font-size: 24px;
  font-weight: bold;
}

.el-menu-vertical-demo {
  border-right: none;
  background-color: transparent; /* Element Plus menu background handled by sidebar-bg via global style */
}

.main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: var(--header-bg);
  border-bottom: 1px solid var(--border-color);
  padding: 0 20px;
  height: 60px; /* Standard header height */
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
}

.header-title {
  font-size: 20px;
  color: var(--text-color);
}

.theme-toggle-btn {
  border: none;
  background: transparent;
  color: var(--text-color);
}

.main-content {
  background-color: var(--bg-color);
  padding: 20px;
  overflow-y: auto; /* Enable scrolling for main content */
  flex-grow: 1;
}

/* 覆盖 Element Plus 默认样式以适应主题 */
/* :deep() selector is not valid in scoped styles without a global rule, or in non-scoped styles it is not needed */
.el-menu {
  background-color: transparent !important; /* 让侧边栏背景色通过 --sidebar-bg 控制 */
}
.el-menu-item,
.el-sub-menu__title {
  color: var(--sidebar-text) !important;
}
.el-menu-item:hover,
.el-sub-menu__title:hover {
  background-color: var(--primary-color-light) !important; /* Element Plus hover color, you might need to define primary-color-light */
}
.el-menu-item.is-active {
  background-color: var(--primary-color) !important;
  color: white !important;
}
</style>