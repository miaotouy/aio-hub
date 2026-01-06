<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { getRegisteredTools } from "../router";
import * as LucideIcons from "lucide-vue-next";

const router = useRouter();
const tools = ref<any[]>([]);

onMounted(() => {
  tools.value = getRegisteredTools();
});

const handleToolClick = (tool: any) => {
  if (tool.route && tool.route.path) {
    router.push(tool.route.path);
  }
};

// 获取图标组件
const getIcon = (iconName: string) => {
  return (LucideIcons as any)[iconName] || LucideIcons.HelpCircle;
};
</script>

<template>
  <div class="home-container">
    <div class="content safe-area-bottom">
      <div class="header">
        <h2 class="greeting">欢迎使用 AIO Hub</h2>
        <p class="subtitle">一体化工具集合</p>
      </div>

      <div class="tools-grid">
        <div
          v-for="tool in tools"
          :key="tool.id"
          class="tool-card"
          v-ripple
          @click="handleToolClick(tool)"
        >
          <div class="tool-icon">
            <component :is="getIcon(tool.icon)" :size="32" />
          </div>
          <div class="tool-name">{{ tool.name }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-container {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-color);
  padding: 16px;
}

.content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.header {
  padding-top: 20px;
}

.greeting {
  font-size: 28px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px 0;
}

.subtitle {
  font-size: 14px;
  color: var(--text-color-light);
  margin: 0;
}

.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

.tool-card {
  background-color: var(--card-bg);
  border-radius: var(--app-radius-lg);
  padding: 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: background-color 0.2s;
  border: 1px solid var(--border-color);
}

.tool-card:active {
  background-color: rgba(var(--primary-color-rgb, 64, 158, 255), 0.1);
}

.tool-icon {
  font-size: 32px;
  color: var(--primary-color);
}

.tool-name {
  font-size: 14px;
  color: var(--text-color);
}
</style>
