<script setup lang="ts">
import { ref } from 'vue';
import InstalledPlugins from './InstalledPlugins.vue';
import PluginMarket from './PluginMarket.vue';

// 当前激活的标签页
const activeTab = ref<'installed' | 'market'>('installed');
</script>

<template>
  <div class="plugin-manager">
    <div class="plugin-manager-header">
      <h1 class="page-title">扩展中心</h1>
      <p class="page-description">管理和安装插件以扩展应用功能</p>
    </div>

    <el-tabs v-model="activeTab" class="plugin-tabs">
      <el-tab-pane label="已安装" name="installed">
        <InstalledPlugins />
      </el-tab-pane>
      
      <el-tab-pane label="发现" name="market">
        <PluginMarket />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<style scoped>
.plugin-manager {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 20px;
  box-sizing: border-box;
  overflow: hidden;
}

.plugin-manager-header {
  flex-shrink: 0;
  margin-bottom: 20px;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.page-description {
  font-size: 14px;
  color: var(--text-color-secondary);
  margin: 0;
}

.plugin-tabs {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 让标签页内容可滚动 */
.plugin-tabs :deep(.el-tabs__content) {
  flex: 1;
  overflow: hidden;
}

.plugin-tabs :deep(.el-tab-pane) {
  height: 100%;
  overflow-y: auto;
}
</style>