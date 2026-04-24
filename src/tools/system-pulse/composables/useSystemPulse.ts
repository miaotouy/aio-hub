// src/tools/system-pulse/composables/useSystemPulse.ts
import { onMounted, onUnmounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useSystemPulseStore } from "../store/useSystemPulseStore";
import type { SystemSnapshot } from "../types/snapshot";

import { ref } from "vue";

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

  onMounted(start);
  onUnmounted(stop);

  return { store, isActive, start, stop, handleToggle };
}
