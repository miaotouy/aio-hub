<script setup lang="ts">
import { computed } from "vue";
import {
  FileAudio,
  FileImage,
  FileText,
  FileVideo,
  Paperclip,
} from "lucide-vue-next";
import type { MediaItem } from "@/components/media/types";
import type { AssetKind } from "@/tools/asset-manager/types";
import { useLazyManagedThumbnail } from "../composables/useLazyManagedThumbnail";

const props = withDefaults(
  defineProps<{
    item: {
      assetId: string;
      kind: AssetKind;
      displayName: string;
      mimeType: string;
    };
    /** 列表场景等待进入视口后再申请受管来源；输入区可直接传 false。 */
    lazy?: boolean;
    /** 缩略图边长（px）。 */
    size?: number;
    /** 为 false 时即使图片类型也不申请受管来源，只显示类型图标（不可用附件）。 */
    enabled?: boolean;
  }>(),
  { lazy: false, size: 40, enabled: true }
);

const mediaItem = computed<MediaItem | null>(() =>
  props.enabled && props.item.kind === "image"
    ? {
        assetId: props.item.assetId,
        kind: "image",
        displayName: props.item.displayName,
        mimeType: props.item.mimeType,
      }
    : null
);

const { rootRef, sourceUrl } = useLazyManagedThumbnail({
  item: () => mediaItem.value,
  lazy: () => props.lazy,
});

const fallbackIcon = computed(() => {
  switch (props.item.kind) {
    case "image":
      return FileImage;
    case "audio":
      return FileAudio;
    case "video":
      return FileVideo;
    case "document":
      return FileText;
    default:
      return Paperclip;
  }
});
</script>

<template>
  <span
    ref="rootRef"
    class="attachment-thumbnail"
    :style="{ width: `${size}px`, height: `${size}px` }"
    :data-kind="item.kind"
    :data-loaded="sourceUrl ? 'true' : 'false'"
    :data-testid="`attachment-thumbnail-${item.kind}`"
  >
    <img
      v-if="sourceUrl"
      :src="sourceUrl"
      :alt="item.displayName"
      loading="lazy"
      draggable="false"
    />
    <component
      :is="fallbackIcon"
      v-else
      :size="Math.round(size * 0.5)"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.attachment-thumbnail {
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  overflow: hidden;
  border-radius: 6px;
  color: var(--text-color-light);
  background: var(--card-bg);
}

.attachment-thumbnail img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
</style>
