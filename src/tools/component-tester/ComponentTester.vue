<template>
  <div class="component-tester">
    <ComponentHeader title="组件测试器" />
    
    <div class="tester-content">
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="原生元素" name="native">
          <NativeElements />
        </el-tab-pane>
        
        <el-tab-pane label="ElementPlus 组件" name="element-plus">
          <ElementPlusGallery />
        </el-tab-pane>
        
        <el-tab-pane label="消息提示" name="messaging">
          <MessagingTest />
        </el-tab-pane>
        
        <el-tab-pane label="主题色板" name="colors">
          <ThemeColorPalette />
        </el-tab-pane>
        
        <el-tab-pane label="文档查看器" name="document-viewer">
          <DocumentViewerTester />
        </el-tab-pane>
      </el-tabs>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import ComponentHeader from '@/components/ComponentHeader.vue';
import NativeElements from './components/NativeElements.vue';
import ElementPlusGallery from './components/ElementPlusGallery.vue';
import MessagingTest from './components/MessagingTest.vue';
import ThemeColorPalette from './components/ThemeColorPalette.vue';
import DocumentViewerTester from './components/DocumentViewerTester.vue';

const activeTab = ref('native');
</script>

<style scoped>
.component-tester {
  height: 100%;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
}

.tester-content {
  flex: 1;
  overflow: hidden;
}

.tester-content :deep(.el-tabs) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tester-content :deep(.el-tabs__content) {
  flex: 1;
  overflow: auto;
  padding: 20px;
}

.tester-content :deep(.el-tab-pane) {
  height: 100%;
}
</style>