# Composables 使用示例

本文档展示如何使用项目中的可复用 composables。

## 目录

- [useComponentDragging - 组件拖拽](#usecomponentdragging---组件拖拽)
- [useWindowResize - 窗口大小调整](#usewindowresize---窗口大小调整)

---

## useComponentDragging - 组件拖拽

用于实现组件分离时的拖拽功能，支持预览窗口、RAF 节流等特性。

### 基本用法

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useComponentDragging } from '@/composables/useComponentDragging';

const containerRef = ref<HTMLDivElement>();

const { startDrag } = useComponentDragging(
  {
    threshold: 10,           // 拖拽阈值（像素）
    finalizeThreshold: 100,  // 固定阈值（像素）
    enableThrottle: true,    // 启用 RAF 节流
  },
  {
    onCreatePreview: (e) => {
      const rect = containerRef.value?.getBoundingClientRect();
      if (!rect) return null;

      return {
        componentId: "my-component",
        displayName: "我的组件",
        width: rect.width + 50,
        height: rect.height + 50,
        mouseX: e.screenX,
        mouseY: e.screenY,
      };
    },
  }
);

const handleDragStart = (e: MouseEvent) => {
  startDrag(e);
};
</script>

<template>
  <div ref="containerRef" @mousedown="handleDragStart">
    <!-- 组件内容 -->
  </div>
</template>
```

### 配置选项

#### DragOptions

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `threshold` | `number` | `10` | 拖拽阈值（像素），超过此距离才开始预览 |
| `finalizeThreshold` | `number` | `100` | 固定阈值（像素），拖拽超过此距离才固定窗口 |
| `enableThrottle` | `boolean` | `true` | 是否启用 RAF 节流优化性能 |

#### DragCallbacks

| 回调 | 类型 | 说明 |
|------|------|------|
| `onCreatePreview` | `(event: MouseEvent) => ComponentPreviewConfig \| null` | **必需**。预览创建前的回调，返回预览配置 |
| `onDragStart` | `(event: MouseEvent) => void` | 拖拽开始回调 |
| `onDragMove` | `(event: MouseEvent) => void` | 拖拽移动回调 |
| `onDragEnd` | `(event: MouseEvent, finalized: boolean) => void` | 拖拽结束回调，`finalized` 表示是否固定了窗口 |

### 返回值

| 属性 | 类型 | 说明 |
|------|------|------|
| `isDragging` | `Ref<boolean>` | 是否正在拖拽 |
| `dragLabel` | `Ref<string \| null>` | 预览窗口的标签 |
| `hasMovedEnough` | `Ref<boolean>` | 是否已移动足够距离 |
| `startDrag` | `(e: MouseEvent) => void` | 开始拖拽的函数 |
| `cleanup` | `() => void` | 清理函数（自动在组件卸载时调用） |

### 完整示例（MessageInput.vue）

```vue
<script setup lang="ts">
import { ref } from "vue";
import { useComponentDragging } from "@/composables/useComponentDragging";

const containerRef = ref<HTMLDivElement>();
const isDetached = ref(false);

const { startDrag } = useComponentDragging(
  {
    threshold: 10,
    finalizeThreshold: 100,
    enableThrottle: true,
  },
  {
    onCreatePreview: (e) => {
      const rect = containerRef.value?.getBoundingClientRect();
      if (!rect) return null;

      return {
        componentId: "chat-input",
        displayName: "聊天输入框",
        width: rect.width + 50,
        height: rect.height + 50,
        mouseX: e.screenX,
        mouseY: e.screenY,
      };
    },
    onDragEnd: (e, finalized) => {
      if (finalized) {
        console.log('窗口已固定');
      }
    },
  }
);

const handleDragStart = (e: MouseEvent) => {
  if (isDetached.value) return; // 已分离时不处理
  startDrag(e);
};
</script>
```

---

## useWindowResize - 窗口大小调整

使用 Tauri v2 原生 API 实现窗口大小调整功能。

### 基本用法

```vue
<script setup lang="ts">
import { useWindowResize } from '@/composables/useWindowResize';

const { createResizeHandler } = useWindowResize();

// 创建右下角调整手柄
const handleResize = createResizeHandler('SouthEast');
</script>

<template>
  <div class="container">
    <!-- 内容 -->
    
    <!-- 右下角调整手柄 -->
    <div
      class="resize-handle"
      @mousedown="handleResize"
      title="拖拽调整窗口大小"
    />
  </div>
</template>

<style scoped>
.resize-handle {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 16px;
  height: 16px;
  cursor: se-resize;
}
</style>
```

### 调整方向

支持 8 个方向的调整：

| 方向 | 类型值 | 说明 | 光标样式 |
|------|--------|------|----------|
| 东 | `'East'` | 右边缘 | `e-resize` |
| 西 | `'West'` | 左边缘 | `w-resize` |
| 南 | `'South'` | 下边缘 | `s-resize` |
| 北 | `'North'` | 上边缘 | `n-resize` |
| 东南 | `'SouthEast'` | 右下角 | `se-resize` |
| 东北 | `'NorthEast'` | 右上角 | `ne-resize` |
| 西南 | `'SouthWest'` | 左下角 | `sw-resize` |
| 西北 | `'NorthWest'` | 左上角 | `nw-resize` |

### 预设配置

使用预设配置快速创建调整手柄：

```vue
<script setup lang="ts">
import { useWindowResize, RESIZE_PRESETS } from '@/composables/useWindowResize';

const { createResizeHandler } = useWindowResize();

// 使用预设
const bottomRightResize = createResizeHandler(RESIZE_PRESETS.bottomRight.direction);
const topResize = createResizeHandler(RESIZE_PRESETS.top.direction);
</script>
```

### API

#### useWindowResize()

返回值：

| 属性 | 类型 | 说明 |
|------|------|------|
| `startResize` | `(direction: ResizeDirection, event?: MouseEvent) => Promise<void>` | 开始调整窗口大小 |
| `createResizeHandler` | `(direction: ResizeDirection) => (event: MouseEvent) => Promise<void>` | 创建调整手柄的事件处理器 |
| `RESIZE_PRESETS` | `Record<string, ResizeHandleConfig>` | 预设的调整手柄配置 |

#### getResizeHandleStyle()

生成调整手柄的样式：

```typescript
import { getResizeHandleStyle, RESIZE_PRESETS } from '@/composables/useWindowResize';

const style = getResizeHandleStyle(RESIZE_PRESETS.bottomRight);
// 返回包含位置、尺寸、光标等样式的对象
```

### 多个调整手柄示例

```vue
<script setup lang="ts">
import { useWindowResize } from '@/composables/useWindowResize';

const { createResizeHandler } = useWindowResize();

const resizeHandlers = {
  topLeft: createResizeHandler('NorthWest'),
  topRight: createResizeHandler('NorthEast'),
  bottomLeft: createResizeHandler('SouthWest'),
  bottomRight: createResizeHandler('SouthEast'),
  top: createResizeHandler('North'),
  right: createResizeHandler('East'),
  bottom: createResizeHandler('South'),
  left: createResizeHandler('West'),
};
</script>

<template>
  <div class="window">
    <!-- 内容 -->
    
    <!-- 8 个调整手柄 -->
    <div class="resize-nw" @mousedown="resizeHandlers.topLeft" />
    <div class="resize-ne" @mousedown="resizeHandlers.topRight" />
    <div class="resize-sw" @mousedown="resizeHandlers.bottomLeft" />
    <div class="resize-se" @mousedown="resizeHandlers.bottomRight" />
    <div class="resize-n" @mousedown="resizeHandlers.top" />
    <div class="resize-e" @mousedown="resizeHandlers.right" />
    <div class="resize-s" @mousedown="resizeHandlers.bottom" />
    <div class="resize-w" @mousedown="resizeHandlers.left" />
  </div>
</template>
```

---

## 组合使用示例

同时使用拖拽和窗口调整功能：

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { useComponentDragging } from '@/composables/useComponentDragging';
import { useWindowResize } from '@/composables/useWindowResize';

const containerRef = ref<HTMLDivElement>();
const isDetached = ref(false);

// 拖拽功能
const { startDrag } = useComponentDragging(
  { threshold: 10, finalizeThreshold: 100 },
  {
    onCreatePreview: (e) => {
      const rect = containerRef.value?.getBoundingClientRect();
      if (!rect) return null;
      return {
        componentId: "my-component",
        displayName: "我的组件",
        width: rect.width,
        height: rect.height,
        mouseX: e.screenX,
        mouseY: e.screenY,
      };
    },
  }
);

// 窗口调整功能
const { createResizeHandler } = useWindowResize();
const handleResize = createResizeHandler('SouthEast');

const handleDragStart = (e: MouseEvent) => {
  if (isDetached.value) return;
  startDrag(e);
};
</script>

<template>
  <div ref="containerRef" class="component">
    <!-- 拖拽手柄 -->
    <div class="drag-handle" @mousedown="handleDragStart">
      ⋮⋮
    </div>
    
    <!-- 内容 -->
    <div class="content">
      <!-- ... -->
    </div>
    
    <!-- 调整大小手柄（仅在分离模式显示） -->
    <div
      v-if="isDetached"
      class="resize-handle"
      @mousedown="handleResize"
    />
  </div>
</template>
```

---

## 最佳实践

### 1. 性能优化

- 默认启用 RAF 节流以优化拖拽性能
- 避免在回调中执行重量级操作
- 使用 `v-if` 而不是 `v-show` 来条件渲染调整手柄

### 2. 用户体验

- 设置合理的阈值（建议 10-20px）
- 提供明显的视觉反馈（光标样式、hover 效果）
- 在分离模式下禁用拖拽开始逻辑

### 3. 错误处理

- 在 `onCreatePreview` 中检查容器是否存在
- 返回 `null` 时会自动取消拖拽
- Composable 会自动清理资源，无需手动处理

### 4. TypeScript 类型安全

```typescript
import type { ResizeDirection } from '@/composables/useWindowResize';
import type { DragOptions, DragCallbacks } from '@/composables/useComponentDragging';

// 使用类型约束
const direction: ResizeDirection = 'SouthEast';
const options: DragOptions = { threshold: 15 };
```

---

## 注意事项

1. **Tauri 环境**：窗口调整功能仅在 Tauri 环境下工作
2. **权限配置**：确保在 `capabilities/default.json` 中配置了相关权限：
   ```json
   {
     "permissions": [
       "core:window:allow-start-resize-dragging",
       "core:window:allow-set-size"
     ]
   }
   ```
3. **自动清理**：Composables 会在组件卸载时自动清理资源
4. **单例状态**：部分状态（如 `detachedComponentIds`）在全局共享

---

## 相关文档

- [分离组件实现指南](./detachable-components-implementation-guide.md)
- [分离工具窗口](./detached-tool-windows.md)