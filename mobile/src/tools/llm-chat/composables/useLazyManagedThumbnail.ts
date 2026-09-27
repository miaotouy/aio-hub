import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Ref,
} from "vue";
import type { MediaItem } from "@/components/media/types";
import { useManagedMediaPreview } from "@/components/media/useManagedMediaPreview";

interface UseLazyManagedThumbnailOptions {
  /** 返回需要展示的媒体项；返回 null 表示当前附件无需申请受管来源。 */
  item: () => MediaItem | null;
  /** 是否等待进入视口后再申请来源，默认 true。 */
  lazy?: () => boolean;
  /** 是否允许申请来源，默认 true；附件不可用时传 false。 */
  enabled?: () => boolean;
}

/**
 * 为消息/输入区附件提供受管内联缩略图的 descriptor 生命周期：懒加载、
 * 资源切换与卸载时撤销、过期/缺失映射沿用 useManagedMediaPreview。
 * preview URL 只存在于本 composable 的短期来源中，不写入消息或持久状态。
 */
export function useLazyManagedThumbnail(
  options: UseLazyManagedThumbnailOptions
) {
  const managed = useManagedMediaPreview();
  const rootRef: Ref<HTMLElement | null> = ref(null);
  const isLoading = computed(
    () =>
      managed.state.value === "opening" || managed.state.value === "loading"
  );
  const sourceUrl = computed(() => managed.source.value?.url ?? null);
  let observer: IntersectionObserver | null = null;
  let loadedAssetId: string | null = null;

  const target = () => options.item();
  const canLoad = () => Boolean(target()) && (options.enabled?.() ?? true);
  const shouldLazyLoad = () => options.lazy?.() ?? true;

  async function load(force = false) {
    const current = target();
    if (!current || !canLoad()) return;
    if (
      !force &&
      loadedAssetId === current.assetId &&
      managed.state.value !== "error"
    ) {
      return;
    }
    loadedAssetId = current.assetId;
    await managed.open(current);
  }

  function stopObserving() {
    observer?.disconnect();
    observer = null;
  }

  function observe() {
    if (!canLoad()) return;
    if (!shouldLazyLoad() || typeof IntersectionObserver === "undefined") {
      void load();
      return;
    }
    stopObserving();
    observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      stopObserving();
      void load();
    });
    if (rootRef.value) observer.observe(rootRef.value);
  }

  function reset() {
    stopObserving();
    loadedAssetId = null;
    void managed.close();
  }

  onMounted(observe);

  watch(
    () => target()?.assetId ?? "",
    () => {
      reset();
      observe();
    }
  );

  watch(
    () => canLoad(),
    (value) => {
      if (!value) {
        reset();
        return;
      }
      observe();
    }
  );

  onBeforeUnmount(stopObserving);

  return { rootRef, sourceUrl, isLoading };
}
