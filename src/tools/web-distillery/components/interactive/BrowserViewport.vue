<script setup lang="ts">
import { ref, watch } from "vue";
import { Globe } from "lucide-vue-next";
import { useWebDistilleryStore } from "../../stores/store";
import { iframeBridge } from "../../core/iframe-bridge";
import { useTheme } from "@/composables/useTheme";

const store = useWebDistilleryStore();
const { isDark } = useTheme();
const containerRef = ref<HTMLElement | null>(null);

defineExpose({ containerRef });

// 同步主题到 iframe
const syncTheme = async () => {
  if (!store.isWebviewCreated) return;
  const theme = isDark.value ? "dark" : "light";
  // 通过注入脚本来通知页面主题变化，如果页面支持响应 prefers-color-scheme 最好，
  // 否则我们手动给 html 加 class
  await iframeBridge.evalScript(`
    (function() {
      document.documentElement.classList.remove('light', 'dark');
      document.documentElement.classList.add('${theme}');
      document.documentElement.style.colorScheme = '${theme}';
    })();
  `);
};

// 同步持久高亮
const syncPersistentHighlights = async () => {
  if (!store.recipeDraft) return;
  await iframeBridge.clearHighlights();

  for (const selector of store.recipeDraft.extractSelectors || []) {
    if (selector) await iframeBridge.addHighlight(selector, "include");
  }
  for (const selector of store.recipeDraft.excludeSelectors || []) {
    if (selector) await iframeBridge.addHighlight(selector, "exclude");
  }
};

// 监听规则变化，同步高亮
watch(
  [() => store.recipeDraft?.extractSelectors, () => store.recipeDraft?.excludeSelectors],
  () => {
    syncPersistentHighlights();
  },
  { deep: true },
);

// 监听主题变化
watch(isDark, () => {
  syncTheme();
});

// 网页创建成功后同步一次主题
watch(
  () => store.isWebviewCreated,
  (created) => {
    if (created) syncTheme();
  },
);
</script>

<template>
  <div class="browser-viewport">
    <template v-if="store.url">
      <div ref="containerRef" class="browser-viewport-inner"></div>

      <!-- 加载遮罩 -->
      <div v-if="store.isLoading" class="viewport-overlay">
        <el-skeleton :rows="10" animated />
      </div>
    </template>

    <!-- 空状态引导 -->
    <div v-else class="empty-placeholder">
      <el-empty description="请输入网址并点击加载" :image-size="200">
        <template #image>
          <div class="empty-icon-wrapper">
            <Globe :size="64" />
          </div>
        </template>
      </el-empty>
    </div>
  </div>
</template>

<style scoped>
.browser-viewport {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.browser-viewport-inner {
  width: 100%;
  height: 100%;
}

.viewport-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: var(--container-bg);
  padding: 40px;
  z-index: 10;
}
</style>
