<script setup lang="ts">
import { computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useTheme } from '../composables/useTheme';
import TitleBar from '../components/TitleBar.vue';

const route = useRoute();
const router = useRouter();
const { currentTheme } = useTheme();

const toolTitle = computed(() => route.query.title as string || '工具窗口');

// 判断是否需要显示标题栏（拖拽指示器不需要）
const showTitleBar = computed(() => route.path !== '/drag-indicator');

onMounted(() => {
  // 如果有 toolPath 参数，导航到对应的工具页面
  const toolPath = route.query.toolPath as string;
  if (toolPath) {
    router.replace(toolPath);
  }
});
</script>

<template>
  <div class="detached-container" :class="`theme-${currentTheme}`">
    <TitleBar v-if="showTitleBar" :title="toolTitle" />
    
    <div class="tool-content" :class="{ 'no-titlebar': !showTitleBar }">
      <router-view />
    </div>
  </div>
</template>

<style scoped>
.detached-container {
  width: 100vw;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-color);
  color: var(--text-color);
  overflow: hidden;
}

.tool-content {
  flex: 1;
  overflow: auto;
  padding-top: 32px;
}

.tool-content.no-titlebar {
  padding-top: 0;
}


</style>