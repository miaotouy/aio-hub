<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Cookie, RefreshCw, Plus, Key } from "lucide-vue-next";
import { webviewBridge } from "../core/webview-bridge";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("web-distillery/cookie-lab");
const cookies = ref("");
const isLoading = ref(false);
const newCookie = ref("");

async function fetchCookies() {
  isLoading.value = true;
  try {
    // 触发提取
    await webviewBridge.getCookies();
    // 等待事件回传
    const result = await webviewBridge.waitForCookiesExtracted(3000);
    cookies.value = result.cookies;
  } catch (err: any) {
    errorHandler.error(err, "获取 Cookie 失败");
  } finally {
    isLoading.value = false;
  }
}

async function addCookie() {
  if (!newCookie.value.trim()) return;
  try {
    await webviewBridge.setCookie(newCookie.value.trim());
    newCookie.value = "";
    customMessage.success("Cookie 已注入");
    await fetchCookies(); // 刷新
  } catch (err: any) {
    errorHandler.error(err, "注入失败");
  }
}

onMounted(() => {
  fetchCookies();
});
</script>

<template>
  <div class="cookie-lab">
    <div class="lab-header">
      <div class="header-title">
        <Cookie :size="14" class="title-icon" />
        <span>Cookie 实验室</span>
      </div>
      <el-button text size="small" :loading="isLoading" @click="fetchCookies">
        <RefreshCw :size="14" />
      </el-button>
    </div>

    <!-- 注入新 Cookie -->
    <div class="input-group">
      <el-input v-model="newCookie" size="small" placeholder="key=value; domain=..." @keyup.enter="addCookie">
        <template #append>
          <el-button @click="addCookie">
            <Plus :size="14" />
          </el-button>
        </template>
      </el-input>
    </div>

    <!-- Cookie 列表预览 -->
    <div class="cookie-content">
      <div v-if="!cookies" class="empty-state">
        <p>无活跃 Cookie</p>
      </div>
      <div v-else class="cookie-raw">
        <div v-for="(val, i) in cookies.split(';')" :key="i" class="cookie-item">
          <Key :size="10" class="item-icon" />
          <span class="item-text">{{ val.trim() }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cookie-lab {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.lab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-light);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.title-icon {
  color: var(--warning-color);
}

.input-group {
  margin-bottom: 4px;
}

.cookie-content {
  background-color: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 4px;
  min-height: 60px;
  max-height: 200px;
  overflow-y: auto;
  padding: 8px;
}

.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: var(--text-color-light);
}

.cookie-raw {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.cookie-item {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11px;
  color: var(--text-color);
  word-break: break-all;
  line-height: 1.4;
}

.item-icon {
  margin-top: 3px;
  color: var(--text-color-light);
  opacity: 0.6;
}
.item-text {
  flex: 1;
}
</style>
