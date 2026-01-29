/**
 * 快捷操作导出服务
 */

import { useQuickActionStore } from "../stores/quickActionStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import JSZip from "jszip";

const logger = createModuleLogger("llm-chat/quickActionExportService");
const errorHandler = createModuleErrorHandler("llm-chat/quickActionExportService");

/**
 * 导出单个快捷操作组
 */
export async function exportQuickActionSet(id: string): Promise<void> {
  try {
    const quickActionStore = useQuickActionStore();
    const set = await quickActionStore.getQuickActionSet(id);
    if (!set) throw new Error("找不到快捷操作组内容");

    const jsonString = JSON.stringify(set, null, 2);

    const savePath = await save({
      defaultPath: `${set.name}.json`,
      filters: [{ name: "AIO Quick Action Set", extensions: ["json"] }],
    });
    if (savePath) {
      const encoder = new TextEncoder();
      await writeFile(savePath, encoder.encode(jsonString));
      logger.info("快捷操作组导出成功", { id, savePath });
      customMessage.success(`快捷操作组《${set.name}》导出成功`);
    }
  } catch (error) {
    errorHandler.error(error as Error, "导出快捷操作组失败");
  }
}

/**
 * 批量导出快捷操作组为 ZIP
 */
export async function exportQuickActionSetsBatch(ids: string[]): Promise<void> {
  let loading: { close: () => void } | null = null;
  try {
    const quickActionStore = useQuickActionStore();
    const zip = new JSZip();
    let successCount = 0;

    for (const id of ids) {
      const set = await quickActionStore.getQuickActionSet(id);
      if (set) {
        const safeName = set.name.replace(/[\\/:*?"<>|]/g, "_");
        zip.file(`${safeName}.json`, JSON.stringify(set, null, 2));
        successCount++;
      }
    }

    if (successCount === 0) {
      customMessage.warning("没有可导出的内容");
      return;
    }

    loading = customMessage.info({
      message: "正在准备导出...",
      duration: 0,
    });

    const zipContent = await zip.generateAsync({ type: "uint8array" });
    const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

    const savePath = await save({
      defaultPath: `quick_actions_export_${dateStr}.zip`,
      filters: [{ name: "Zip Archive", extensions: ["zip"] }],
    });

    if (savePath) {
      await writeFile(savePath, zipContent);
      logger.info("批量导出快捷操作组成功", { count: successCount, savePath });
      loading.close();
      customMessage.success(`成功导出 ${successCount} 个快捷操作组`);
    } else {
      loading.close();
    }
  } catch (error) {
    loading?.close();
    errorHandler.error(error as Error, "批量导出快捷操作组失败");
  }
}
