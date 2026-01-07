<script setup lang="ts">
import { computed, type Component } from "vue";
import * as LucideIcons from "lucide-vue-next";
import type { ToolIcon } from "@/types/tool";

interface Props {
  icon: ToolIcon | Component | string | any;
  size?: number | string;
  color?: string;
}

const props = withDefaults(defineProps<Props>(), {
  size: 24,
});

const iconSize = computed(() => (typeof props.size === "number" ? `${props.size}px` : props.size));

const iconData = computed(() => {
  const icon = props.icon;

  // 1. 处理结构化对象 { type, value }
  if (icon && typeof icon === "object" && "type" in icon && "value" in icon) {
    return {
      type: icon.type,
      value: icon.value,
    };
  }

  // 2. 处理组件 (函数或带有 render/setup 的对象)
  if (
    typeof icon === "function" ||
    (typeof icon === "object" &&
      icon !== null &&
      ("render" in icon || "setup" in icon || "template" in icon))
  ) {
    return {
      type: "component",
      value: icon,
    };
  }

  // 3. 处理字符串
  if (typeof icon === "string") {
    // 检查是否是 Lucide 图标
    if ((LucideIcons as any)[icon]) {
      return {
        type: "component",
        value: (LucideIcons as any)[icon],
      };
    }

    // 检查是否是图片路径 (简单判断)
    const isImagePath =
      /^(https?:\/\/|data:|appdata:\/\/|\/|(\.\.\/)*assets\/).*\.(png|jpg|jpeg|gif|svg|webp)/i.test(
        icon
      );
    if (isImagePath) {
      return {
        type: "image",
        value: icon,
      };
    }

    // 默认作为文本/Emoji
    return {
      type: "text",
      value: icon,
    };
  }

  // 回退图标
  return {
    type: "component",
    value: LucideIcons.HelpCircle,
  };
});
</script>

<template>
  <div class="tool-icon-wrapper" :style="{ width: iconSize, height: iconSize, color: color }">
    <!-- 组件模式 (Lucide 或自定义组件) -->
    <component
      v-if="iconData.type === 'component'"
      :is="iconData.value"
      :size="size"
      :stroke-width="2"
      class="icon-component"
    />

    <!-- 图片模式 -->
    <img
      v-else-if="iconData.type === 'image'"
      :src="iconData.value"
      class="icon-image"
      :style="{ width: iconSize, height: iconSize }"
      alt="icon"
    />

    <!-- 文本/Emoji 模式 -->
    <span v-else-if="iconData.type === 'text'" class="icon-text" :style="{ fontSize: iconSize }">
      {{ iconData.value }}
    </span>
  </div>
</template>

<style scoped>
.tool-icon-wrapper {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  vertical-align: middle;
}

.icon-component {
  display: block;
}

.icon-image {
  object-fit: contain;
  border-radius: 4px;
}

.icon-text {
  line-height: 1;
  font-family: "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif;
}
</style>
