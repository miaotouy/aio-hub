// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 屏幕监控框（可分离悬浮窗）控制。
 *
 * 从实时字幕 OCR 入口抽出：负责打开 / 关闭 / 聚焦监控框，以及首次创建时的
 * 窗口定位。监控框几何信息由 MonitorBox 通过窗口同步总线上报，主窗口侧由
 * useScreenMonitor 监听，不在本 composable 内处理。
 */

import { getNativeDesktopCapabilities } from "@/utils/nativeDesktopCapabilities";
import { getHostCapability } from "@/platform/core/capabilities";
import { computed, onBeforeUnmount } from "vue";
import { invoke } from "@/platform/native/core";
import {
  getCurrentWindow,
  Window,
  PhysicalPosition,
} from "@/platform/native/window";
import { customMessage } from "@/utils/customMessage";
import { useDetachable } from "@/composables/useDetachable";
import { useDetachedManager } from "@/composables/useDetachedManager";

/** 监控框可分离组件 ID（与 registry.ts 中 detachableComponents 的 key 一致） */
export const MONITOR_BOX_ID = "realtime-subtitle-ocr:monitor-box";
/** 监控框默认尺寸（逻辑像素） */
export const MONITOR_BOX_DEFAULT_WIDTH = 360;
export const MONITOR_BOX_DEFAULT_HEIGHT = 200;

export function useMonitorBox() {
  const { detachByClick } = useDetachable();
  const detachedManager = useDetachedManager();

  const isMonitorBoxDetached = computed(() =>
    detachedManager.isDetached(MONITOR_BOX_ID)
  );

  /** 查找监控框分离窗口的 label */
  function findMonitorBoxLabel(): string | undefined {
    for (const win of detachedManager.detachedWindows.value.values()) {
      if (win.id === MONITOR_BOX_ID) return win.label;
    }
    return undefined;
  }

  async function openMonitorBox() {
    if (!getNativeDesktopCapabilities().screenCapture) {
      customMessage.info(
        getHostCapability("screenCapture").reason || "可使用本地视频工作区"
      );
      return;
    }
    if (isMonitorBoxDetached.value) {
      // 已分离则聚焦
      const label = findMonitorBoxLabel();
      if (label) await detachedManager.focusWindow(label);
      return;
    }

    // 通过统一分离体系创建监控框（type: "component" → 透明+置顶+无边框+可缩放）
    const success = await detachByClick({
      id: MONITOR_BOX_ID,
      displayName: "屏幕监控框",
      type: "component",
      width: MONITOR_BOX_DEFAULT_WIDTH,
      height: MONITOR_BOX_DEFAULT_HEIGHT,
    });

    if (!success) {
      customMessage.error("打开监控框失败");
      return;
    }

    // 检查是否有保存的窗口配置，如果有则完全依赖后端恢复，不进行手动定位
    try {
      const label = `detached-${MONITOR_BOX_ID}`;
      const savedLabels = await invoke<string[]>("get_saved_window_labels");
      if (savedLabels.includes(label)) {
        return;
      }

      // 首次创建时定位到主窗口内
      const win = getCurrentWindow();
      const [pos, size, scaleFactor] = await Promise.all([
        win.outerPosition(),
        win.outerSize(),
        win.scaleFactor(),
      ]);
      // 首次放在主窗口内容范围，最大化时仍可直接拖动监控框。
      const target = await Window.getByLabel(label);
      await target?.setPosition(
        new PhysicalPosition(
          Math.round(pos.x + Math.min(40 * scaleFactor, size.width / 4)),
          Math.round(pos.y + Math.min(80 * scaleFactor, size.height / 4))
        )
      );
    } catch {
      // ignore：定位失败不影响功能
    }
  }

  async function closeMonitorBox() {
    await detachedManager.closeWindow(MONITOR_BOX_ID).catch(() => {});
  }

  async function focusMonitorBox() {
    const label = findMonitorBoxLabel();
    if (label) {
      await detachedManager.focusWindow(label);
    } else {
      await openMonitorBox();
    }
  }

  // 工具真正关闭时收起监控框（KeepAlive 切换模式不会触发卸载）。
  onBeforeUnmount(() => {
    detachedManager.closeWindow(MONITOR_BOX_ID).catch(() => {});
  });

  return {
    isMonitorBoxDetached,
    openMonitorBox,
    closeMonitorBox,
    focusMonitorBox,
  };
}
