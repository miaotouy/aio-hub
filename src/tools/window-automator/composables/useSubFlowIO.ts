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

/**
 * 子流程/自定义函数导入导出 IO composable
 *
 * 负责调用 Tauri dialog 插件选择文件，并使用 fs 插件读写 JSON。
 */

import { save, open } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { useWindowAutomatorStore } from "../stores/windowAutomator.store";
import type { SubFlow } from "../types";

const logger = createModuleLogger("window-automator/useSubFlowIO");
const errorHandler = createModuleErrorHandler("window-automator/useSubFlowIO");

export function useSubFlowIO() {
  const store = useWindowAutomatorStore();

  /**
   * 导出单个子流程为 JSON 文件
   */
  async function exportSubFlow(subFlow: SubFlow) {
    const defaultName = `${subFlow.name}.json`;
    const path = await errorHandler.wrapAsync(
      () =>
        save({
          title: "导出函数",
          defaultPath: defaultName,
          filters: [{ name: "JSON", extensions: ["json"] }],
        }),
      { userMessage: "打开保存对话框失败" }
    );

    if (!path) return;

    const content = JSON.stringify(subFlow, null, 2);
    const success = await errorHandler.wrapAsync(
      () => writeTextFile(path, content),
      { userMessage: "写入文件失败" }
    );

    if (success !== null) {
      customMessage.success(`已成功导出函数: ${subFlow.name}`);
      logger.info("导出函数成功", { id: subFlow.id, name: subFlow.name, path });
    }
  }

  /**
   * 从 JSON 文件导入子流程
   */
  async function importSubFlow(): Promise<string | null> {
    const path = await errorHandler.wrapAsync(
      () =>
        open({
          title: "导入函数",
          multiple: false,
          directory: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        }),
      { userMessage: "打开文件对话框失败" }
    );

    if (!path || Array.isArray(path)) return null;

    const text = await errorHandler.wrapAsync(() => readTextFile(path), {
      userMessage: "读取文件失败",
    });

    if (!text) return null;

    try {
      const parsed = JSON.parse(text) as SubFlow;
      if (!parsed || typeof parsed !== "object") {
        customMessage.error("无效的 JSON 格式");
        return null;
      }
      if (typeof parsed.name !== "string" || !Array.isArray(parsed.steps)) {
        customMessage.error("文件结构不符合函数规范（需包含 name 和 steps）");
        return null;
      }

      const newId = store.importSubFlow(parsed);
      if (newId) {
        customMessage.success(`已成功导入函数: ${parsed.name}`);
        logger.info("导入函数成功", { id: newId, name: parsed.name, path });
        return newId;
      }
    } catch (e) {
      logger.warn("解析导入函数 JSON 失败", { error: String(e) });
      customMessage.error("解析 JSON 失败，请检查文件内容");
    }

    return null;
  }

  return {
    exportSubFlow,
    importSubFlow,
  };
}
