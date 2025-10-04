<template>
  <div class="home-page">
    <span class="title">All In One 工具箱</span>
    <div class="tool-grid">
      <router-link v-for="tool in toolsConfig" :key="tool.path" :to="tool.path" class="tool-card">
        <el-icon :size="48">
          <component :is="tool.icon" />
        </el-icon>
        <div class="tool-name">{{ tool.name }}</div>
        <div class="tool-description">{{ tool.description }}</div>
      </router-link>
    </div>
  </div>
</template>

<script setup lang="ts">
import { toolsConfig } from "./config/tools";
import { ElIcon } from "element-plus"; // 确保正确导入 ElIcon 组件，虽然在模板中直接使用 component :is 也可以

// toolsConfig 直接从外部导入，无需在 setup 中声明 ref
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
  padding-top: 40px;
  /* 增加顶部内边距 */
  box-sizing: border-box;
  /* 确保 padding 包含在 height 内 */
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
</style>
