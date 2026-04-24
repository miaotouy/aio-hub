// src/tools/system-pulse/composables/useSystemPulse.ts
import { onMounted, onUnmounted, ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { useSystemPulseStore } from "../store/useSystemPulseStore";
import type { SystemSnapshot } from "../types/snapshot";
import { formatSnapshotToText } from "../utils/formatters";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("SystemPulse");

export function useSystemPulse() {
  const store = useSystemPulseStore();
  const isActive = ref(false);
  let unlisten: UnlistenFn | null = null;

  async function start() {
    if (isActive.value) return;
    try {
      unlisten = await listen<SystemSnapshot>("system-pulse:snapshot", (event) => {
        store.applySnapshot(event.payload);
      });
      await invoke("start_pulse");
      isActive.value = true;
    } catch (e) {
      console.error("[SystemPulse] 启动失败:", e);
    }
  }

  async function stop() {
    try {
      await invoke("stop_pulse");
      isActive.value = false;
    } catch (e) {
      console.error("[SystemPulse] 停止命令失败:", e);
    }
    unlisten?.();
    unlisten = null;
    // 不再调用 store.reset()，保留最后一份快照数据供界面展示
  }

  /**
   * 处理开关切换
   * @param val 新状态
   */
  async function handleToggle(val: boolean | string | number) {
    if (val) {
      await start();
    } else {
      await stop();
    }
  }

  /**
   * 复制当前系统统计信息
   */
  async function copyCurrentStats() {
    if (!store.latest) return;
    try {
      const text = formatSnapshotToText(store.latest);
      await writeText(text);
      customMessage.success("已复制到剪贴板");
    } catch (e) {
      errorHandler.error(e, "复制失败");
    }
  }

  /**
   * 导出历史记录
   */
  async function exportHistory() {
    if (store.fullHistoryArray.length === 0) {
      customMessage.warning("暂无历史记录可导出");
      return;
    }

    try {
      const filePath = await save({
        title: "导出系统脉搏记录",
        defaultPath: `system_pulse_history_${Date.now()}.json`,
        filters: [{ name: "JSON", extensions: ["json"] }],
      });

      if (filePath) {
        const content = JSON.stringify(store.fullHistoryArray, null, 2);
        await writeTextFile(filePath, content);
        customMessage.success("导出成功");
      }
    } catch (e) {
      errorHandler.error(e, "导出失败");
    }
  }

  onMounted(start);
  onUnmounted(stop);

  return {
    store,
    isActive,
    start,
    stop,
    handleToggle,
    copyCurrentStats,
    exportHistory,
  };
}
