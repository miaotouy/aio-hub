<template>
  <section class="knowledge-shell">
    <header class="knowledge-navigation">
      <div class="product-title">
        <Database :size="18" />
        <span>Knowledge</span>
      </div>
      <el-segmented v-model="activeView" :options="viewOptions" />
    </header>
    <KeepAlive>
      <WorkspaceView v-if="activeView === 'workspace'" />
      <SettingsView v-else />
    </KeepAlive>
  </section>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { Database } from "lucide-vue-next";
import WorkspaceView from "./views/WorkspaceView.vue";
import SettingsView from "./views/SettingsView.vue";

type KnowledgeView = "workspace" | "settings";

const activeView = ref<KnowledgeView>("workspace");
const viewOptions = [
  { label: "工作区", value: "workspace" },
  { label: "设置", value: "settings" },
];
</script>

<style scoped>
.knowledge-shell {
  container-name: knowledge-shell;
  container-type: inline-size;
  display: grid;
  grid-template-rows: 48px minmax(0, 1fr);
  width: 100%;
  height: 100%;
  min-height: 0;
  background: var(--el-bg-color-page);
}

.knowledge-navigation {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 16px;
  border-bottom: var(--border-width) solid var(--border-color);
  background: var(--sidebar-bg);
}

.product-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--el-text-color-primary);
  font-size: 14px;
  font-weight: 650;
}

@container knowledge-shell (max-width: 560px) {
  .knowledge-navigation {
    padding-inline: 10px;
  }

  .product-title span {
    display: none;
  }
}
</style>
