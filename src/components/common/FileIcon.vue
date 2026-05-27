<template>
  <DynamicIcon
    :src="iconSrc"
    :alt="fileName"
    :style="containerStyle"
    v-bind="$attrs"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { AssetType } from "@/types/asset-management";
import { getIconForFilePath } from "vscode-material-icons";
import DynamicIcon from "./DynamicIcon.vue";

interface Props {
  /** 文件名（用于根据扩展名判断图标） */
  fileName?: string;
  /** 文件类型 */
  fileType?: AssetType;
  /** 图标大小（默认 24） */
  size?: number | string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
});

/**
 * 容器样式
 */
const containerStyle = computed(() => ({
  width: typeof props.size === "number" ? `${props.size}px` : props.size,
  height: typeof props.size === "number" ? `${props.size}px` : props.size,
  flexShrink: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
}));

/**
 * 计算最终使用的图标路径
 */
const iconSrc = computed(() => {
  // 1. 优先根据文件名匹配
  if (props.fileName) {
    const iconName = getIconForFilePath(props.fileName);
    if (iconName) {
      return new URL(
        `../../../node_modules/vscode-material-icons/generated/icons/${iconName}.svg`,
        import.meta.url
      ).href;
    }
  }

  // 2. 使用文件类型的 fallback
  let fallbackIcon = "document";
  if (props.fileType) {
    switch (props.fileType) {
      case "image":
        fallbackIcon = "image";
        break;
      case "video":
        fallbackIcon = "video";
        break;
      case "audio":
        fallbackIcon = "audio";
        break;
      case "document":
        fallbackIcon = "document";
        break;
    }
  }

  return new URL(
    `../../../node_modules/vscode-material-icons/generated/icons/${fallbackIcon}.svg`,
    import.meta.url
  ).href;
});
</script>

<style scoped>
/* 确保图标正常显示 */
:deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
