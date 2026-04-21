import { useWebDistilleryStore } from "../stores/store";
import { iframeBridge } from "../core/iframe-bridge";
import { transformer } from "../core/transformer";
import { createModuleLogger } from "@/utils/logger";
import { debounce } from "lodash-es";
import { watch, onUnmounted } from "vue";
import type { SiteRecipe } from "../types";

const logger = createModuleLogger("web-distillery/use-live-preview");

export function useLivePreview() {
  const store = useWebDistilleryStore();

  /**
   * 触发实时预览
   * @param forceRefresh 是否强制重新从 Iframe 提取 DOM
   */
  const triggerLivePreview = async (forceRefresh = false) => {
    if (store.activeTab !== "interactive") return;

    logger.debug("Triggering live preview", { forceRefresh });
    store.setLivePreviewLoading(true);

    try {
      let html = store.cachedDomSnapshot;
      let url = store.url;

      // 如果没有缓存或者强制刷新，则从 Iframe 提取
      if (!html || forceRefresh) {
        const snapshot = await iframeBridge.extractCurrentDom();
        html = snapshot.html;
        url = snapshot.url;
        store.setCachedDomSnapshot(html);
      }

      if (!html) {
        throw new Error("未能获取页面内容");
      }

      // 使用当前草稿规则进行转换
      const recipe = store.recipeDraft as SiteRecipe;
      const result = await transformer.transform(
        html,
        {
          url: url,
          format: "markdown",
          extractSelectors: recipe?.extractSelectors || [],
        },
        recipe,
        "interactive",
      );

      store.setLivePreview(result.content, result.quality);
    } catch (err) {
      logger.error("Live preview failed", err);
      store.setLivePreview("预览生成失败: " + (err instanceof Error ? err.message : String(err)), 0);
    } finally {
      store.setLivePreviewLoading(false);
    }
  };

  // 防抖版本的触发器
  const debouncedTrigger = debounce(() => triggerLivePreview(false), 800);

  // 监听规则变化
  const stopWatch = watch(
    [() => store.recipeDraft?.extractSelectors, () => store.recipeDraft?.excludeSelectors],
    () => {
      if (store.activeToolTab === "preview") {
        debouncedTrigger();
      }
    },
    { deep: true },
  );

  onUnmounted(() => {
    stopWatch();
    debouncedTrigger.cancel();
  });

  return {
    triggerLivePreview,
    debouncedTrigger,
  };
}
