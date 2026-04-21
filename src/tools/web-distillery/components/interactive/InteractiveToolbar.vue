<script setup lang="ts">
import { ref } from "vue";
import { RotateCw, Save, Cookie, Network, ExternalLink } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";

const emit = defineEmits(["save", "open-cookie", "open-api", "load-url"]);
const store = useWebDistilleryStore();
const urlInput = ref(store.url);

const handleRefresh = () => {
  const url = urlInput.value.trim() || store.url;
  if (url) {
    emit("load-url", url);
  }
};

const handleGo = () => {
  const url = urlInput.value.trim();
  if (url) {
    emit("load-url", url);
  }
};
</script>

<template>
  <div class="interactive-toolbar">
    <div class="toolbar-center">
      <el-input v-model="urlInput" placeholder="输入网址开始交互式提取..." @keyup.enter="handleGo">
        <template #prefix>
          <el-icon><ExternalLink /></el-icon>
        </template>
        <template #suffix>
          <el-button link @click="handleRefresh">
            <el-icon><RotateCw /></el-icon>
          </el-button>
        </template>
      </el-input>
    </div>

    <div class="toolbar-right">
      <el-button-group>
        <el-button @click="emit('open-cookie')">
          <el-icon><Cookie /></el-icon>
          <span>Cookie</span>
        </el-button>
        <el-button @click="emit('open-api')">
          <el-icon><Network /></el-icon>
          <span>API</span>
        </el-button>
      </el-button-group>

      <el-button type="primary" @click="emit('save')">
        <el-icon><Save /></el-icon>
        <span>保存配方</span>
      </el-button>
    </div>
  </div>
</template>

<style scoped>
.interactive-toolbar {
  height: 56px;
  padding: 0 16px;
  display: flex;
  align-items: center;
  gap: 16px;
  background-color: var(--sidebar-bg);
  border-bottom: var(--border-width) solid var(--border-color);
  flex-shrink: 0;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-center {
  flex: 1;
  max-width: 800px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

:deep(.el-input__wrapper) {
  background-color: var(--input-bg);
}
</style>
