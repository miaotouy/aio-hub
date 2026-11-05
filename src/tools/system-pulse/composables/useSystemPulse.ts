// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// src/tools/system-pulse/composables/useSystemPulse.ts
import { onUnmounted, ref, watch } from "vue";
import { usePageActivity } from "@/composables/usePageActivity";
import { createModuleLogger } from "@/utils/logger";
import { invoke } from "@/platform/native/core";
import { listen, type UnlistenFn } from "@/platform/native/events";
import { writeText } from "@/platform/native/clipboard";
import { save } from "@/platform/native/dialog";
import { writeTextFile } from "@/platform/native/fs";
import { useSystemPulseStore } from "../store/useSystemPulseStore";
import type { SystemSnapshot } from "../types/snapshot";
import { formatSnapshotToText } from "../utils/formatters";
import { customMessage } from "@/utils/customMessage";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("SystemPulse");
const logger = createModuleLogger("SystemPulse");

export function useSystemPulse() {
  const store = useSystemPulseStore();
  const isActive = ref(false);
  const isPending = ref(false);
  const errorMessage = ref("");
  let wanted = true;
  const pageActive = usePageActivity();
  let disposed = false;
  let queue = Promise.resolve();
  type Session = { id: string; listeners: UnlistenFn[]; started: boolean };
  let current: Session | undefined;
  const shouldRun = () => wanted && pageActive.value && !disposed;
  const accepts = (session: Session, id?: string) =>
    current === session && shouldRun() && (id == null || id === session.id);

  function fail(error: unknown, context: string) {
    logger.error(context, error);
    errorMessage.value = `${context}，请重新开启监控；若持续失败，请重启应用。`;
    wanted = false;
    isActive.value = false;
  }
  async function closeSession(session: Session) {
    if (current === session) current = undefined;
    for (const unlisten of session.listeners.splice(0)) unlisten();
    isActive.value = false;
    if (session.started) {
      try {
        await invoke("stop_pulse", { subscriptionId: session.id });
      } catch (error) {
        fail(error, "停止系统监控失败");
      }
    }
  }
  async function sync() {
    if (!shouldRun()) {
      if (current) await closeSession(current);
      return;
    }
    if (current) return;
    const session: Session = {
      id: crypto.randomUUID(),
      listeners: [],
      started: false,
    };
    current = session;
    isPending.value = true;
    try {
      session.listeners.push(
        await listen<SystemSnapshot & { subscriptionId?: string }>(
          "system-pulse:snapshot",
          (event) => {
            const { subscriptionId, ...snapshot } = event.payload;
            if (accepts(session, subscriptionId)) store.applySnapshot(snapshot);
          }
        )
      );
      if (!shouldRun()) return;
      session.listeners.push(
        await listen<{ subscriptionId?: string; message: string }>(
          "system-pulse:error",
          (event) => {
            if (!accepts(session, event.payload.subscriptionId)) return;
            fail(new Error(event.payload.message), "系统采集失败");
            void reconcile();
          }
        )
      );
      if (!shouldRun()) return;
      session.started = true;
      await invoke("start_pulse", { subscriptionId: session.id });
      if (shouldRun()) isActive.value = true;
    } catch (error) {
      if (shouldRun()) fail(error, "启动系统监控失败");
    } finally {
      isPending.value = false;
      if (!shouldRun()) await closeSession(session);
    }
  }
  function reconcile() {
    const operation = queue.then(sync);
    queue = operation.catch((error) => {
      fail(error, "更新系统监控失败");
    });
    return queue;
  }
  function start() {
    wanted = true;
    errorMessage.value = "";
    return reconcile();
  }
  function stop() {
    wanted = false;
    isActive.value = false;
    return reconcile();
  }
  function handleToggle(value: boolean | string | number) {
    return value ? start() : stop();
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

  watch(
    pageActive,
    (active) => {
      if (!active) isActive.value = false;
      void reconcile();
    },
    { immediate: true, flush: "sync" }
  );
  onUnmounted(() => {
    disposed = true;
    void reconcile();
  });

  return {
    store,
    isActive,
    isPending,
    errorMessage,
    start,
    stop,
    handleToggle,
    copyCurrentStats,
    exportHistory,
  };
}
