<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<template>
  <div class="monitor-box" :class="{ breathing: isBreathing }">
    <!-- 顶部控制栏：拖拽手柄 + 坐标显示 + 置顶切换 + 关闭 -->
    <div
      class="monitor-box__titlebar"
      data-tauri-drag-region
      @dblclick="toggleAlwaysOnTop"
    >
      <span class="monitor-box__title" data-tauri-drag-region>监控框</span>
      <span class="monitor-box__coords" data-tauri-drag-region>
        {{ geometry.width }}×{{ geometry.height }} @ ({{ geometry.x }},
        {{ geometry.y }})
      </span>
      <div class="monitor-box__actions">
        <button
          class="monitor-box__btn"
          :class="{ active: isAlwaysOnTop }"
          title="置顶切换"
          @click="toggleAlwaysOnTop"
        >
          <PinIcon :size="14" />
        </button>
        <button class="monitor-box__btn" title="关闭" @click="close">
          <XIcon :size="14" />
        </button>
      </div>
    </div>

    <!-- 四角与四边缩放手柄 -->
    <div
      v-for="dir in resizeHandles"
      :key="dir"
      :class="['monitor-box__handle', `monitor-box__handle--${dir}`]"
      @mousedown="startResize(dir, $event)"
    ></div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useWindowSyncBus } from "@/composables/useWindowSyncBus";
import { Pin as PinIcon, X as XIcon } from "lucide-vue-next";

interface Geometry {
  x: number;
  y: number;
  width: number;
  height: number;
}

defineProps<{ isDetached?: boolean }>();

/** 监控框几何信息在窗口同步总线上的状态键（与 useScreenMonitor 一致） */
const GEOMETRY_STATE_KEY = "realtime-subtitle-ocr:monitor-box-geometry";
let geometryVersion = 0;

const geometry = reactive<Geometry>({ x: 0, y: 0, width: 0, height: 0 });
const isAlwaysOnTop = ref(true);
const isBreathing = ref(true);

const resizeHandles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"] as const;
type ResizeDir = (typeof resizeHandles)[number];

let unlistenMoved: (() => void) | null = null;
let unlistenResized: (() => void) | null = null;
let reportTimer: ReturnType<typeof setTimeout> | null = null;

/** 读取当前窗口的物理坐标/尺寸，转换为逻辑坐标后通过同步总线广播给主窗口 */
async function reportGeometry() {
  const win = getCurrentWebviewWindow();
  const [pos, size, scaleFactor] = await Promise.all([
    win.outerPosition(),
    win.outerSize(),
    win.scaleFactor(),
  ]);
  geometry.x = Math.round(pos.x / scaleFactor);
  geometry.y = Math.round(pos.y / scaleFactor);
  geometry.width = Math.round(size.width / scaleFactor);
  geometry.height = Math.round(size.height / scaleFactor);
  // 高频事件防抖：仅在最后一次 move/resize 后 60ms 上报
  if (reportTimer) clearTimeout(reportTimer);
  reportTimer = setTimeout(async () => {
    const payload = { ...geometry };
    // 主通道：窗口同步总线 state-sync（主窗口 useScreenMonitor 监听）
    try {
      const { syncState } = useWindowSyncBus();
      await syncState(GEOMETRY_STATE_KEY, payload, ++geometryVersion, true);
    } catch {
      // ignore
    }
    // 兜底直连事件
    await emit("monitor-box:geometry", payload);
  }, 60);
}

function startResize(dir: ResizeDir, event: MouseEvent) {
  event.preventDefault();
  event.stopPropagation();
  interface TauriWindowExtended {
    startResizeDragging: (direction: string) => Promise<void>;
  }
  (getCurrentWebviewWindow() as unknown as TauriWindowExtended)
    .startResizeDragging(dir)
    .catch(() => {});
}

async function toggleAlwaysOnTop() {
  isAlwaysOnTop.value = !isAlwaysOnTop.value;
  try {
    await getCurrentWebviewWindow().setAlwaysOnTop(isAlwaysOnTop.value);
  } catch {
    // ignore
  }
}

async function close() {
  try {
    // 复用统一分离窗口关闭命令，触发 window-attached 事件回主窗口
    await invoke("close_detached_window", {
      label: getCurrentWebviewWindow().label,
    });
  } catch {
    // ignore
  }
}

onMounted(async () => {
  const win = getCurrentWebviewWindow();
  // 初始置顶状态同步
  try {
    isAlwaysOnTop.value = await win.isAlwaysOnTop();
  } catch {
    // ignore
  }
  await reportGeometry();
  unlistenMoved = await win.onMoved(() => {
    reportGeometry();
  });
  unlistenResized = await win.onResized(() => {
    reportGeometry();
  });
});

onBeforeUnmount(() => {
  unlistenMoved?.();
  unlistenResized?.();
  if (reportTimer) clearTimeout(reportTimer);
});
</script>

<style scoped>
.monitor-box {
  position: fixed;
  inset: 0;
  background: transparent;
  border: 2px dashed var(--el-color-primary, #409eff);
  box-sizing: border-box;
  overflow: hidden;
  pointer-events: none; /* 容器本身不拦截，仅边框/控制栏/手柄接收事件，中间透出屏幕 */
}

.monitor-box.breathing {
  animation: monitor-box-breath 2s ease-in-out infinite;
}

@keyframes monitor-box-breath {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(64, 158, 255, 0);
  }
  50% {
    box-shadow: 0 0 12px 2px rgba(64, 158, 255, 0.45);
  }
}

.monitor-box__titlebar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 24px;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 6px 0 8px;
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(var(--ui-blur));
  -webkit-backdrop-filter: blur(var(--ui-blur));
  color: #fff;
  font-size: 12px;
  user-select: none;
  pointer-events: auto;
  cursor: move;
}

.monitor-box__title {
  font-weight: 600;
  white-space: nowrap;
}

.monitor-box__coords {
  flex: 1;
  font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.monitor-box__actions {
  display: flex;
  gap: 4px;
}

.monitor-box__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
}

.monitor-box__btn:hover {
  background: rgba(255, 255, 255, 0.28);
}

.monitor-box__btn.active {
  background: var(--el-color-primary, #409eff);
}

/* 缩放手柄 */
.monitor-box__handle {
  position: absolute;
  pointer-events: auto;
  z-index: 2;
}

.monitor-box__handle--n {
  top: -3px;
  left: 6px;
  right: 6px;
  height: 6px;
  cursor: ns-resize;
}
.monitor-box__handle--s {
  bottom: -3px;
  left: 6px;
  right: 6px;
  height: 6px;
  cursor: ns-resize;
}
.monitor-box__handle--e {
  top: 6px;
  bottom: 6px;
  right: -3px;
  width: 6px;
  cursor: ew-resize;
}
.monitor-box__handle--w {
  top: 6px;
  bottom: 6px;
  left: -3px;
  width: 6px;
  cursor: ew-resize;
}
.monitor-box__handle--ne {
  top: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
.monitor-box__handle--nw {
  top: -3px;
  left: -3px;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
.monitor-box__handle--se {
  bottom: -3px;
  right: -3px;
  width: 10px;
  height: 10px;
  cursor: nwse-resize;
}
.monitor-box__handle--sw {
  bottom: -3px;
  left: -3px;
  width: 10px;
  height: 10px;
  cursor: nesw-resize;
}
</style>
