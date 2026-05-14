<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { Cookie, ShieldCheck, ShieldOff } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { cookieProfileStore } from "../../core/cookie-profile-store";
import { iframeBridge } from "../../core/iframe-bridge";
import type { CookieProfile } from "../../types";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("web-distillery/identity-panel");
const store = useWebDistilleryStore();

const matchedProfiles = ref<CookieProfile[]>([]);
const isLoading = ref(false);

const currentUrl = computed(() => store.url);

async function refreshProfiles() {
  const url = currentUrl.value;
  if (!url) {
    matchedProfiles.value = [];
    return;
  }
  isLoading.value = true;
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    await cookieProfileStore.load();
    matchedProfiles.value = await cookieProfileStore.getMatchingProfilesForUrl(fullUrl);
  } catch {
    matchedProfiles.value = [];
  } finally {
    isLoading.value = false;
  }
}

async function handleToggle(profileId: string) {
  const result = await errorHandler.wrapAsync(() => cookieProfileStore.toggleActive(profileId), {
    userMessage: "切换身份失败",
  });
  if (result !== null) {
    await refreshProfiles();
    await syncCookiesToProxy();
    // 刷新 iframe 页面，让新 cookies 生效
    if (store.isWebviewCreated) {
      await iframeBridge.evalScript("location.reload()").catch(() => {});
    }
  }
}

async function syncCookiesToProxy() {
  const url = currentUrl.value;
  if (!url) return;
  try {
    const fullUrl = url.startsWith("http") ? url : `https://${url}`;
    const active = await cookieProfileStore.getActiveProfileForUrl(fullUrl);
    if (active) {
      const cookieStr = active.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });
      // 同步 localStorage 到代理层（用于 SPA token 恢复）
      if (active.localStorage && Object.keys(active.localStorage).length > 0) {
        await invoke("distillery_set_proxy_local_storage", {
          data: JSON.stringify(active.localStorage),
        });
      } else {
        await invoke("distillery_set_proxy_local_storage", { data: null });
      }
    } else {
      await invoke("distillery_set_proxy_cookies", { cookies: null });
      await invoke("distillery_set_proxy_local_storage", { data: null });
    }
  } catch {
    // 静默处理
  }
}

watch(currentUrl, () => refreshProfiles(), { immediate: true });

onMounted(() => refreshProfiles());
</script>

<template>
  <div v-if="matchedProfiles.length > 0" class="identity-panel">
    <div class="panel-header">
      <Cookie :size="12" class="header-icon" />
      <span class="header-title">身份卡片</span>
    </div>
    <div class="profile-list">
      <button
        v-for="profile in matchedProfiles"
        :key="profile.id"
        class="profile-item"
        :class="{ active: profile.isActive }"
        :title="profile.isActive ? '点击停用' : '点击激活'"
        @click="handleToggle(profile.id)"
      >
        <component :is="profile.isActive ? ShieldCheck : ShieldOff" :size="12" class="profile-icon" />
        <span class="profile-name">{{ profile.name }}</span>
        <span v-if="profile.isActive" class="active-badge">已激活</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.identity-panel {
  padding: 8px 12px;
  border-bottom: var(--border-width) solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.panel-header {
  display: flex;
  align-items: center;
  gap: 5px;
}

.header-icon {
  color: var(--el-color-warning);
  flex-shrink: 0;
}

.header-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--el-text-color-secondary);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.profile-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  border: var(--border-width) solid var(--border-color);
  background: transparent;
  cursor: pointer;
  font-size: 12px;
  color: var(--el-text-color-regular);
  transition: all 0.15s;
  text-align: left;
  width: 100%;
}

.profile-item:hover {
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.08));
  border-color: var(--el-color-primary-light-5);
}

.profile-item.active {
  border-color: var(--el-color-primary);
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.1));
}

.profile-icon {
  flex-shrink: 0;
  color: var(--el-text-color-placeholder);
}

.profile-item.active .profile-icon {
  color: var(--el-color-primary);
}

.profile-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.active-badge {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background-color: rgba(var(--el-color-primary-rgb), calc(var(--card-opacity) * 0.15));
  color: var(--el-color-primary);
  font-weight: 600;
  flex-shrink: 0;
}
</style>