<script setup lang="ts">
import { ref } from 'vue';
import { InfoFilled } from '@element-plus/icons-vue';

// 占位符数据
const settings = ref({
  // 托盘设置
  trayEnabled: false,
  
  // 主题设置
  theme: 'auto', // auto, light, dark
  
  // 工具模块显示
  toolsVisible: {
    regexApply: true,
    mediaInfoReader: true,
    textDiff: true,
    jsonFormatter: true,
    codeFormatter: true,
    symlinkMover: true,
    directoryTree: true,
    apiTester: true,
    llmProxy: true,
    gitAnalyzer: true,
  }
});

// 占位符函数
const handleSave = () => {
  console.log('保存设置（功能待实现）', settings.value);
};

const handleReset = () => {
  console.log('重置设置（功能待实现）');
};

const showAbout = () => {
  console.log('显示关于页面（功能待实现）');
};
</script>

<template>
  <div class="settings-page">
    <div class="settings-container">
      <h1 class="page-title">设置</h1>
      
      <!-- 通用设置 -->
      <section class="settings-section">
        <h2 class="section-title">通用设置</h2>
        
        <div class="setting-item">
          <div class="setting-label">
            <span>最小化到托盘</span>
            <el-tooltip content="功能待实现" placement="top">
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-switch v-model="settings.trayEnabled" disabled />
        </div>
      </section>
      
      <!-- 工具模块设置 -->
      <section class="settings-section">
        <h2 class="section-title">工具模块</h2>
        
        <div class="setting-item">
          <div class="setting-label">
            <span>模块显示与排序</span>
            <el-tooltip content="功能待实现" placement="top">
              <el-icon class="info-icon"><InfoFilled /></el-icon>
            </el-tooltip>
          </div>
          <el-button disabled size="small">管理模块</el-button>
        </div>
        
        <div class="tools-list">
          <div v-for="(_, key) in settings.toolsVisible" :key="key" class="tool-item">
            <el-checkbox v-model="settings.toolsVisible[key]" disabled>
              {{ key }}
            </el-checkbox>
          </div>
        </div>
      </section>
      
      <!-- 关于 -->
      <section class="settings-section">
        <h2 class="section-title">关于</h2>
        
        <div class="setting-item">
          <div class="setting-label">
            <span>应用信息</span>
          </div>
          <el-button @click="showAbout" disabled size="small">查看详情</el-button>
        </div>
        
        <div class="about-info">
          <p>AIO工具箱</p>
          <p class="version">版本：1.0.0（占位符）</p>
        </div>
      </section>
      
      <!-- 操作按钮 -->
      <div class="actions">
        <el-button @click="handleReset" disabled>重置设置</el-button>
        <el-button type="primary" @click="handleSave" disabled>保存</el-button>
      </div>
      
      <!-- 提示信息 -->
      <div class="placeholder-notice">
        <el-alert
          title="占位符页面"
          type="info"
          :closable="false"
          show-icon
        >
          <template #default>
            当前设置页面为占位符，所有功能尚未实现。未来将包括：
            <ul>
              <li>托盘最小化功能</li>
              <li>主题色自定义</li>
              <li>工具模块显示开关和排序</li>
              <li>关于页面</li>
            </ul>
          </template>
        </el-alert>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-page {
  height: 100%;
  overflow-y: auto;
  padding: 20px;
  background: var(--bg-color);
  box-sizing: border-box;
}

.settings-container {
  max-width: 800px;
  margin: 0 auto;
}

.page-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 30px;
}

.settings-section {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 24px;
  margin-bottom: 20px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 20px 0;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--border-color);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color-light);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.tools-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.tool-item {
  padding: 8px;
}

.about-info {
  margin-top: 16px;
  padding: 16px;
  background: var(--bg-color);
  border-radius: 6px;
}

.about-info p {
  margin: 4px 0;
  color: var(--text-color);
}

.about-info .version {
  font-size: 13px;
  color: var(--text-color-secondary);
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.placeholder-notice {
  margin-top: 32px;
}

.placeholder-notice ul {
  margin: 12px 0 0 0;
  padding-left: 20px;
}

.placeholder-notice li {
  margin: 4px 0;
}

/* 暗色主题适配 */
:root.dark .settings-page {
  background: var(--bg-color);
}

:root.dark .settings-section {
  background: var(--card-bg);
  border-color: var(--border-color);
}

:root.dark .about-info {
  background: var(--bg-color);
}
</style>