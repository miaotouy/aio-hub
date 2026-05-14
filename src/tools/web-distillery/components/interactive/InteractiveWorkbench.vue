<script setup lang="ts">
import { ref, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import InteractiveToolbar from "./InteractiveToolbar.vue";
import BrowserViewport from "./BrowserViewport.vue";
import ToolPanel from "./ToolPanel.vue";
import PickerStatusBar from "./PickerStatusBar.vue";
import RecipeMetaDrawer from "./RecipeMetaDrawer.vue";
import CookieLab from "../CookieLab.vue";
import ApiSniffer from "../ApiSniffer.vue";
import BaseDialog from "@/components/common/BaseDialog.vue";
import { useWebDistilleryStore } from "../../stores/store";
import { iframeBridge } from "../../core/iframe-bridge";
import { cookieProfileStore } from "../../core/cookie-profile-store";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import { customMessage } from "@/utils/customMessage";

const store = useWebDistilleryStore();
const errorHandler = createModuleErrorHandler("web-distillery/interactive-workbench");
const logger = createModuleLogger("web-distillery/interactive-workbench");

const viewportRef = ref<InstanceType<typeof BrowserViewport> | null>(null);
const metaDrawerVisible = ref(false);
const cookieDialogVisible = ref(false);
const apiDialogVisible = ref(false);

// 追踪代理层 Cookie Jar 是否有过内容（用于检测登录成功）
let lastKnownCookies: string | null = null;
let unsubNavigation: (() => void) | null = null;

/**
 * 从 iframe 中采集 localStorage 快照（静默，失败返回 undefined）
 */
async function captureLocalStorage(): Promise<Record<string, string> | undefined> {
  if (!store.isWebviewCreated) return undefined;
  try {
    return await iframeBridge.getLocalStorage();
  } catch {
    // 超时或 iframe 不可用时静默跳过
    return undefined;
  }
}

/**
 * 自动同步代理层 Cookie Jar + localStorage 到身份卡片。
 * 当检测到页面导航变化时（如登录后跳转），从代理层读取累积的 cookies，
 * 如果之前没有 cookies 而现在有了（说明登录成功），自动创建/更新身份卡片。
 */
async function syncProxyCookiesToProfile() {
  try {
    const proxyCookies = await invoke<string | null>("distillery_get_proxy_cookies");

    if (!proxyCookies || proxyCookies === lastKnownCookies) {
      return; // 没有变化
    }

    lastKnownCookies = proxyCookies;
    const url = store.url;
    if (!url) return;

    await cookieProfileStore.load();
    const existingProfile = await cookieProfileStore.getActiveProfileForUrl(url);

    let hostname = "";
    try {
      hostname = new URL(url).hostname;
    } catch {
      hostname = "unknown";
    }

    // 解析代理层 cookies 为 CookieEntry 数组
    const parsed = proxyCookies
      .split(";")
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const eqIndex = pair.indexOf("=");
        if (eqIndex < 0) return null;
        const name = pair.slice(0, eqIndex).trim();
        const value = pair.slice(eqIndex + 1).trim();
        if (!name) return null;
        return { name, value, domain: hostname, path: "/" };
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    if (parsed.length === 0) return;

    // 同时采集 localStorage（用于 SPA token 恢复）
    const localStorageData = await captureLocalStorage();

    if (existingProfile) {
      // 合并到已有 Profile
      const merged = [...existingProfile.cookies];
      const nameMap = new Map(merged.map((c, i) => [c.name, i]));
      for (const c of parsed) {
        const idx = nameMap.get(c.name);
        if (idx !== undefined) {
          merged[idx] = { ...merged[idx], value: c.value };
        } else {
          merged.push(c);
          nameMap.set(c.name, merged.length - 1);
        }
      }
      const updates: Parameters<typeof cookieProfileStore.update>[1] = { cookies: merged };
      if (localStorageData && Object.keys(localStorageData).length > 0) {
        updates.localStorage = localStorageData;
      }
      await cookieProfileStore.update(existingProfile.id, updates);
      logger.info("Auto-synced proxy cookies to existing profile", {
        profileName: existingProfile.name,
        cookieCount: parsed.length,
        localStorageKeys: localStorageData ? Object.keys(localStorageData).length : 0,
      });
    } else {
      // 自动创建新 Profile
      const cookieStr = parsed.map((c) => `${c.name}=${c.value}`).join("; ");
      const profile = await cookieProfileStore.captureFromBrowser(cookieStr, url);
      // 如果有 localStorage，也保存到新 Profile 中
      if (localStorageData && Object.keys(localStorageData).length > 0) {
        await cookieProfileStore.update(profile.id, { localStorage: localStorageData });
      }
      await cookieProfileStore.toggleActive(profile.id);
      customMessage.success(`检测到登录成功，已自动创建身份卡片 "${profile.name}"`);
      logger.info("Auto-created identity card from proxy cookies", {
        profileName: profile.name,
        cookieCount: profile.cookies.length,
        localStorageKeys: localStorageData ? Object.keys(localStorageData).length : 0,
      });
    }
  } catch (err) {
    // 静默处理 — 自动同步失败不应打扰用户
    errorHandler.handle(err, {
      userMessage: "自动同步 Cookie 失败",
      showToUser: false,
    });
  }
}

// 注册导航变化监听
function setupNavigationListener() {
  if (unsubNavigation) unsubNavigation();
  unsubNavigation = iframeBridge.onNavigationChange((_url, _title) => {
    // 页面导航发生变化，可能是登录成功后的跳转
    // 延迟执行以确保代理层已处理完所有 Set-Cookie 响应
    setTimeout(syncProxyCookiesToProfile, 500);
  });
}

const handleLoadUrl = async (url: string) => {
  const container = viewportRef.value?.containerRef;
  if (!container) {
    customMessage.error("浏览器视口未就绪");
    return;
  }

  store.setLoading(true);
  try {
    store.setUrl(url);

    // Step 1: 注入 cookies + localStorage 到代理（在创建 iframe 之前）
    await cookieProfileStore.load();
    const activeProfile = await cookieProfileStore.getActiveProfileForUrl(url);
    if (activeProfile) {
      const cookieStr = activeProfile.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });

      // 同步 localStorage 到代理层
      if (activeProfile.localStorage && Object.keys(activeProfile.localStorage).length > 0) {
        await invoke("distillery_set_proxy_local_storage", {
          data: JSON.stringify(activeProfile.localStorage),
        });
      } else {
        await invoke("distillery_set_proxy_local_storage", { data: null });
      }

      logger.info("Injected cookies for interactive browsing", {
        profileName: activeProfile.name,
        domain: activeProfile.domain,
        cookieCount: activeProfile.cookies.length,
        localStorageKeys: activeProfile.localStorage ? Object.keys(activeProfile.localStorage).length : 0,
      });
    } else {
      await invoke("distillery_set_proxy_cookies", { cookies: null });
      await invoke("distillery_set_proxy_local_storage", { data: null });
    }

    // iframeBridge.create() 内部会自动调用 init()，无需重复调用
    await iframeBridge.create({
      url,
      container,
      hidden: false,
    });
    store.initRecipeDraft();

    // 设置导航监听：自动检测登录成功并同步 cookies
    lastKnownCookies = null; // 重置追踪状态
    setupNavigationListener();
  } catch (err) {
    errorHandler.error(err, "网页加载失败");
  } finally {
    store.setLoading(false);
  }
};

/** Step 3: 保存当前 iframe 中的 cookies + localStorage 到 Profile */
const handleSaveCookies = async () => {
  if (!store.isWebviewCreated) {
    customMessage.warning("请先打开一个页面");
    return;
  }

  try {
    // 同时采集 cookies 和 localStorage
    await iframeBridge.getCookies();
    const [result, localStorageData] = await Promise.all([
      iframeBridge.waitForCookiesExtracted(5000),
      captureLocalStorage(),
    ]);

    // 即使没有 document.cookie，也可能有代理层 Cookie Jar + localStorage
    const proxyCookies = await invoke<string | null>("distillery_get_proxy_cookies");
    const effectiveCookies = result.cookies || proxyCookies || "";

    if (!effectiveCookies && (!localStorageData || Object.keys(localStorageData).length === 0)) {
      customMessage.info("当前页面没有可保存的身份数据");
      return;
    }

    const url = result.url || store.url;
    await cookieProfileStore.load();
    const existingProfile = await cookieProfileStore.getActiveProfileForUrl(url);

    if (existingProfile) {
      // 更新已有 Profile：合并 cookies（按 name 去重，新值覆盖旧值）
      let hostname = existingProfile.domain;
      try {
        hostname = new URL(url).hostname;
      } catch {
        // keep existing
      }

      const parsed = effectiveCookies
        .split(";")
        .map((pair) => pair.trim())
        .filter(Boolean)
        .map((pair) => {
          const eqIndex = pair.indexOf("=");
          if (eqIndex < 0) return null;
          const name = pair.slice(0, eqIndex).trim();
          const value = pair.slice(eqIndex + 1).trim();
          if (!name) return null;
          return { name, value, domain: hostname, path: "/" };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      // 合并：新的覆盖旧的
      const merged = [...existingProfile.cookies];
      const nameMap = new Map(merged.map((c, i) => [c.name, i]));
      for (const c of parsed) {
        const idx = nameMap.get(c.name);
        if (idx !== undefined) {
          merged[idx] = { ...merged[idx], value: c.value };
        } else {
          merged.push(c);
          nameMap.set(c.name, merged.length - 1);
        }
      }

      const updates: Parameters<typeof cookieProfileStore.update>[1] = { cookies: merged };
      if (localStorageData && Object.keys(localStorageData).length > 0) {
        updates.localStorage = localStorageData;
      }
      await cookieProfileStore.update(existingProfile.id, updates);

      const savedItems: string[] = [];
      if (parsed.length > 0) savedItems.push(`${parsed.length} 条 Cookie`);
      if (localStorageData && Object.keys(localStorageData).length > 0) {
        savedItems.push(`${Object.keys(localStorageData).length} 条 localStorage`);
      }
      customMessage.success(`已更新身份卡片 "${existingProfile.name}"（${savedItems.join("，")}）`);

      // 同步更新代理
      const cookieStr = merged.map((c) => `${c.name}=${c.value}`).join("; ");
      await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });
    } else {
      // 创建新 Profile
      const profile = await cookieProfileStore.captureFromBrowser(effectiveCookies, url);
      // 保存 localStorage
      if (localStorageData && Object.keys(localStorageData).length > 0) {
        await cookieProfileStore.update(profile.id, { localStorage: localStorageData });
      }
      // 自动激活
      await cookieProfileStore.toggleActive(profile.id);

      const savedItems: string[] = [];
      if (profile.cookies.length > 0) savedItems.push(`${profile.cookies.length} 条 Cookie`);
      if (localStorageData && Object.keys(localStorageData).length > 0) {
        savedItems.push(`${Object.keys(localStorageData).length} 条 localStorage`);
      }
      customMessage.success(`已创建并激活身份卡片 "${profile.name}"（${savedItems.join("，")}）`);

      // 同步更新代理
      const cookieStr = profile.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
      await invoke("distillery_set_proxy_cookies", { cookies: cookieStr });
    }
  } catch (err) {
    errorHandler.error(err, "保存身份数据失败");
  }
};

const handleSave = () => {
  metaDrawerVisible.value = true;
};

const openCookieLab = () => {
  cookieDialogVisible.value = true;
};

const openApiSniffer = () => {
  apiDialogVisible.value = true;
};

onUnmounted(async () => {
  if (unsubNavigation) {
    unsubNavigation();
    unsubNavigation = null;
  }
  await iframeBridge.destroy().catch(() => {});
});
</script>

<template>
  <div class="interactive-workbench">
    <!-- 顶部工具栏 -->
    <InteractiveToolbar
      @save="handleSave"
      @open-cookie="openCookieLab"
      @open-api="openApiSniffer"
      @load-url="handleLoadUrl"
      @save-cookies="handleSaveCookies"
    />

    <div class="workbench-body">
      <!-- 左侧主区域：浏览器视口 + 状态栏 -->
      <div class="main-viewport-container">
        <BrowserViewport ref="viewportRef" />
        <PickerStatusBar />
      </div>

      <!-- 右侧工具面板 -->
      <ToolPanel />
    </div>

    <!-- 配方元信息编辑抽屉 -->
    <RecipeMetaDrawer v-model="metaDrawerVisible" />

    <!-- Cookie 实验室弹窗 -->
    <BaseDialog v-model="cookieDialogVisible" title="身份卡片 (Cookie Lab)" width="900px" height="70vh">
      <CookieLab />
    </BaseDialog>

    <!-- API 嗅探弹窗 -->
    <BaseDialog v-model="apiDialogVisible" title="API 嗅探 (API Sniffer)" width="1000px" height="80vh">
      <ApiSniffer />
    </BaseDialog>
  </div>
</template>

<style scoped>
.interactive-workbench {
  width: 100%;
  height: 100%;
  background-color: var(--container-bg);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.workbench-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.main-viewport-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 50%;
  border-right: var(--border-width) solid var(--border-color);
  background-color: var(--card-bg);
}
</style>
