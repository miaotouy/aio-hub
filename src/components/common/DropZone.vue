<template>
  <div
    ref="dropZoneRef"
    class="drop-zone"
    :class="{
      'drop-zone--dragging': isDraggingOver,
      'drop-zone--disabled': disabled,
      'drop-zone--clickable': clickable && !disabled,
      'drop-zone--bare': bare,
      'drop-zone--overlay': overlay,
      'drop-zone--click-zone': clickZone,
      [`drop-zone--${variant}`]: !bare && variant,
    }"
    @click="handleZoneClick"
  >
    <!-- 默认内容区域 -->
    <template v-if="!hideContent">
      <slot :dragging="isDraggingOver" :open="openFileDialog">
        <div class="drop-zone__default">
          <el-icon :size="iconSize" class="drop-zone__icon">
            <component :is="icon" />
          </el-icon>
          <p class="drop-zone__text">{{ placeholder }}</p>
          <p v-if="hint" class="drop-zone__hint">{{ hint }}</p>
          <div v-if="clickable" class="drop-zone__actions">
            <el-button type="primary" plain size="small" @click.stop="openFileDialog"> 选择文件 </el-button>
          </div>
        </div>
      </slot>
    </template>

    <!-- 仅插槽区域 -->
    <template v-else>
      <slot :dragging="isDraggingOver" />
    </template>

    <!-- 拖拽时的覆盖层 (可选，如果用户需要简单的视觉反馈) -->
    <div v-if="isDraggingOver && showOverlayOnDrag" class="drop-zone__drag-overlay">
      <el-icon :size="48"><Upload /></el-icon>
      <span>松开以添加</span>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * DropZone 拖放组件
 *
 * 提供文件/文件夹拖拽、点击上传功能。支持多种展现模式（默认、输入框风格、覆盖层模式）。
 *
 * 使用模式说明：
 * 1. 默认模式：显示一个虚线框区域，带图标和文字。
 * 2. 输入框模式 (variant="input")：紧凑布局，适合放在表单中。
 * 3. 覆盖层模式 (overlay)：absolute 定位铺满父容器。
 *    - 推荐用法 (Sibling Overlay)：作为内容的兄弟节点，通过 pointer-events: none 实现平时穿透点击，拖拽时捕获。
 */
import { ref, computed } from "vue";
import { FolderAdd, Upload } from "@element-plus/icons-vue";
import { open } from "@tauri-apps/plugin-dialog";
import { useFileDrop } from "@/composables/useFileDrop";

interface Props {
  /** 提示占位文字 */
  placeholder?: string;
  /** 辅助说明文字 */
  hint?: string;
  /** 自定义图标组件 */
  icon?: any;
  /** 图标大小 */
  iconSize?: number;

  /** 是否允许点击触发上传 */
  clickable?: boolean;
  /** 是否点击整个区域都能触发上传（默认为 false，仅按钮触发） */
  clickZone?: boolean;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否允许多选 */
  multiple?: boolean;
  /** 是否只允许选择文件夹 */
  directoryOnly?: boolean;
  /** 是否只允许选择文件 */
  fileOnly?: boolean;
  /** 接受的文件后缀列表，如 ['.png', '.jpg'] */
  accept?: string[];

  /** 自定义验证函数，返回 false 将阻止 drop 事件 */
  validator?: (paths: string[]) => Promise<boolean> | boolean;
  /** 是否静默处理错误（不自动弹出提示） */
  silent?: boolean;

  /** 样式变体 */
  variant?: "default" | "border" | "input";
  /** 纯净模式：移除所有内置样式，仅保留拖放逻辑 */
  bare?: boolean;
  /** 覆盖模式：absolute 定位铺满父容器，推荐作为兄弟节点使用 */
  overlay?: boolean;
  /** 是否隐藏默认的 UI 内容，仅显示插槽 */
  hideContent?: boolean;
  /** 拖拽悬停时是否显示内置的半透明覆盖提示层 */
  showOverlayOnDrag?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  placeholder: "拖放文件或文件夹到此处",
  icon: FolderAdd,
  iconSize: 48,
  clickable: false,
  clickZone: false,
  disabled: false,
  multiple: true,
  directoryOnly: false,
  fileOnly: false,
  accept: () => [],
  silent: false,
  variant: "default",
  bare: false,
  overlay: false,
  hideContent: false,
  showOverlayOnDrag: false,
});

const emit = defineEmits<{
  drop: [paths: string[]];
  dragenter: [];
  dragleave: [];
  error: [message: string];
  click: [event: MouseEvent];
}>();

const dropZoneRef = ref<HTMLElement>();

// 使用组合式函数处理逻辑
const { isDraggingOver } = useFileDrop({
  element: dropZoneRef,
  disabled: computed(() => props.disabled),
  multiple: props.multiple,
  directoryOnly: props.directoryOnly,
  fileOnly: props.fileOnly,
  accept: props.accept,
  validator: props.validator,
  silent: props.silent,
  onDrop: (paths) => {
    emit("drop", paths);
  },
  onDragEnter: () => emit("dragenter"),
  onDragLeave: () => emit("dragleave"),
  onError: (msg) => emit("error", msg),
});

/**
 * 打开文件选择对话框
 */
const openFileDialog = async () => {
  if (props.disabled) return;
  try {
    const selected = await open({
      multiple: props.multiple,
      directory: props.directoryOnly,
      filters:
        props.accept.length > 0
          ? [
              {
                name: "Supported Files",
                extensions: props.accept.map((ext) => (ext.startsWith(".") ? ext.slice(1) : ext)),
              },
            ]
          : undefined,
    });

    if (selected) {
      const paths = Array.isArray(selected) ? selected : [selected];
      emit("drop", paths);
    }
  } catch (err: any) {
    emit("error", err.toString());
  }
};

/**
 * 处理整个区域的点击事件
 */
const handleZoneClick = async (e: MouseEvent) => {
  if (props.disabled) return;
  emit("click", e);

  if (props.clickable && props.clickZone) {
    await openFileDialog();
  }
};

// 暴露状态
defineExpose({
  isDraggingOver,
  el: dropZoneRef,
});
</script>

<style scoped>
.drop-zone {
  position: relative;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-sizing: border-box;
}

/* 覆盖模式 */
.drop-zone--overlay {
  position: absolute;
  inset: 0;
  z-index: 10;
  /* 默认不阻挡点击，让内部元素可以正常交互 */
  pointer-events: none;
}

.drop-zone--overlay.drop-zone--dragging {
  pointer-events: auto;
}

.drop-zone--overlay.drop-zone--clickable.drop-zone--click-zone {
  pointer-events: auto;
}

/* 默认样式变体 */
.drop-zone--default {
  border: 2px dashed var(--el-border-color);
  background-color: var(--el-fill-color-blank);
  border-radius: 8px;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone--border {
  border-radius: 6px;
}

.drop-zone--input {
  border-radius: 4px;
  min-height: 32px;
}

/* 交互状态 */
.drop-zone--clickable.drop-zone--click-zone {
  cursor: pointer;
}

.drop-zone--clickable.drop-zone--click-zone:hover:not(.drop-zone--dragging) {
  border-color: color-mix(in srgb, var(--el-color-primary) 40%, transparent);
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
}

.drop-zone--dragging {
  border-color: var(--el-color-primary) !important;
  background-color: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
  overflow: hidden;
}

/* 流光扫光效果 */
.drop-zone--dragging:not(.drop-zone--bare)::after {
  content: "";
  position: absolute;
  top: 0;
  left: -150%;
  width: 150%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    color-mix(in srgb, var(--el-color-primary) 20%, transparent),
    transparent
  );
  transform: skewX(-25deg);
  animation: drop-zone-sweep 1.5s infinite;
  pointer-events: none;
  z-index: 1;
}

@keyframes drop-zone-sweep {
  0% {
    left: -150%;
  }
  100% {
    left: 150%;
  }
}

/* 拖拽时的内置覆盖层 */
.drop-zone__drag-overlay {
  position: absolute;
  inset: 0;
  color: var(--el-color-primary);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  z-index: 100;
  border-radius: inherit;
  backdrop-filter: blur(8px);
  background-color: color-mix(in srgb, var(--el-color-primary) 5%, transparent);
  border: 2px dashed var(--el-color-primary);
  pointer-events: none;
}

.drop-zone__default {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px;
  text-align: center;
  width: 100%;
}

.drop-zone__icon {
  color: var(--el-text-color-placeholder);
  margin-bottom: 12px;
  transition: transform 0.3s ease;
}

.drop-zone--dragging .drop-zone__icon {
  transform: translateY(-5px) scale(1.1);
  color: var(--el-color-primary);
  filter: drop-shadow(0 0 8px color-mix(in srgb, var(--el-color-primary) 50%, transparent));
}

.drop-zone__text {
  margin: 0;
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.drop-zone__hint {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.drop-zone__actions {
  margin-top: 16px;
  pointer-events: auto; /* 确保按钮可以点击 */
}

.drop-zone--disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

/* 纯净模式下取消所有内置样式 */
.drop-zone--bare {
  border: none !important;
  background: transparent !important;
  padding: 0 !important;
  margin: 0 !important;
  min-height: 0 !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  transform: none !important;
}
</style>
