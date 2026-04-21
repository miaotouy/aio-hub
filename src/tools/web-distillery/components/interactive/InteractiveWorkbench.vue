<script setup lang="ts">
import { ref, onUnmounted } from "vue";
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
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";

const store = useWebDistilleryStore();
const errorHandler = createModuleErrorHandler("web-distillery/interactive-workbench");

const viewportRef = ref<InstanceType<typeof BrowserViewport> | null>(null);
const metaDrawerVisible = ref(false);
const cookieDialogVisible = ref(false);
const apiDialogVisible = ref(false);

const handleLoadUrl = async (url: string) => {
  const container = viewportRef.value?.containerRef;
  if (!container) {
    customMessage.error("浏览器视口未就绪");
    return;
  }

  store.setLoading(true);
  try {
    store.setUrl(url);
    await iframeBridge.init();
    await iframeBridge.create({
      url,
      container,
      hidden: false,
    });
    store.initRecipeDraft();
  } catch (err) {
    errorHandler.error(err, "网页加载失败");
  } finally {
    store.setLoading(false);
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
  background-color: #f5f7fa; /* 浏览器背景色，稍微区分一下 */
}

/* 适配暗色模式 */
:deep(.dark) .main-viewport-container {
  background-color: #1a1a1a;
}
</style>
