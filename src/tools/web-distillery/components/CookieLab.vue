<script setup lang="ts">
import { ref, onMounted } from "vue";
import { Cookie, RefreshCw, Plus, Key, Info } from "lucide-vue-next";
import { webviewBridge } from "../core/webview-bridge";
import { useWebDistilleryStore } from "../stores/store";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import InfoCard from "@/components/common/InfoCard.vue";

const errorHandler = createModuleErrorHandler("web-distillery/cookie-lab");
const store = useWebDistilleryStore();
const cookies = ref("");
const isLoading = ref(false);
const newCookie = ref("");

async function fetchCookies() {
  if (!store.isWebviewCreated) {
    return;
  }

  isLoading.value = true;
  try {
    // 触发提取
    await webviewBridge.getCookies();
    // 等待事件回传
    const result = await webviewBridge.waitForCookiesExtracted(3000);
    cookies.value = result.cookies;
  } catch (err: any) {
    errorHandler.handle(err, {
      userMessage: "获取 Cookie 失败",
      showToUser: false, // 静默处理，避免在未就绪时弹出错误
    });
  } finally {
    isLoading.value = false;
  }
}

async function addCookie() {
  if (!store.isWebviewCreated) {
    customMessage.warning("请先在工作台开启浏览器模式");
    return;
  }
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
  if (store.isWebviewCreated) {
    fetchCookies();
  }
});
</script>

<template>
  <div class="cookie-lab">
    <InfoCard>
      <template #header>
        <div class="lab-header">
          <div class="header-title">
            <Cookie :size="14" class="title-icon" />
            <span>身份卡片 (Cookie)</span>
          </div>
          <el-button v-if="store.isWebviewCreated" text size="small" :loading="isLoading" @click="fetchCookies">
            <RefreshCw :size="14" />
          </el-button>
        </div>
      </template>

      <div v-if="!store.isWebviewCreated" class="not-ready-state">
        <el-icon :size="24"><Info /></el-icon>
        <p>浏览器环境未就绪</p>
        <span>请先在“蒸馏工作台”输入 URL 并开启“交互模式”以管理身份信息。</span>
      </div>

      <template v-else>
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
      </template>
    </InfoCard>
  </div>
</template>

<style scoped>
.cookie-lab {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.lab-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
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
  min-height: 120px;
  max-height: 400px;
  overflow-y: auto;
  padding: 8px;
  margin-top: 12px;
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

.not-ready-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
  color: var(--text-color-light);
  gap: 12px;
}

.not-ready-state p {
  font-weight: 600;
  margin: 0;
  color: var(--text-color);
}

.not-ready-state span {
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.8;
}
</style>
