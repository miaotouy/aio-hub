<template>
  <div class="component-tester">
    <header class="tool-header">
      <div class="title-area">
        <FlaskConical class="title-icon" />
        <h2 class="title">组件测试器</h2>
      </div>
      <div class="actions">
        <!-- 可以在这里放一些全局操作 -->
      </div>
    </header>

    <div class="tester-content">
      <el-tabs v-model="activeTab" type="border-card">
        <el-tab-pane label="原生元素" name="native">
          <NativeElements />
        </el-tab-pane>

        <el-tab-pane label="ElementPlus 组件" name="element-plus">
          <ElementPlusGallery />
        </el-tab-pane>

        <el-tab-pane label="窗口分离与同步" name="window-detach">
          <WindowDetachTester />
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
import { ref } from "vue";
import { FlaskConical } from "lucide-vue-next";
import NativeElements from "./components/NativeElements.vue";
import ElementPlusGallery from "./components/ElementPlusGallery.vue";
import WindowDetachTester from "./components/WindowDetachTester.vue";
import MessagingTest from "./components/MessagingTest.vue";
import ThemeColorPalette from "./components/ThemeColorPalette.vue";
import DocumentViewerTester from "./components/DocumentViewerTester.vue";

const activeTab = ref("window-detach");
</script>

<style scoped>
.component-tester {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  border-radius: 12px;
  overflow: hidden;
}

.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background-color: var(--card-bg);
  border-bottom: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
}

.title-area {
  display: flex;
  align-items: center;
  gap: 10px;
}

.title-icon {
  width: 20px;
  height: 20px;
  color: var(--primary-color);
}

.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-color);
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
