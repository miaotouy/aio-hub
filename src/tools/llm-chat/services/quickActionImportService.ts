/**
 * 快捷操作导入服务
 */

import { useQuickActionStore } from "../stores/quickActionStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { QuickAction } from "../types/quick-action";

createModuleLogger("llm-chat/quickActionImportService");
const errorHandler = createModuleErrorHandler("llm-chat/quickActionImportService");

/**
 * 导入快捷操作组 (从 File 对象)
 */
export async function importQuickActionSet(file: File): Promise<string | null> {
  try {
    const text = await file.text();
    return await importQuickActionFromText(text, file.name);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "解析快捷操作文件失败" });
    return null;
  }
}

/**
 * 导入快捷操作组 (从文件路径)
 */
export async function importQuickActionFromPath(path: string): Promise<string | null> {
  try {
    const text = await readTextFile(path);
    const fileName = path.split(/[/\\]/).pop() || "未命名快捷操作组";
    return await importQuickActionFromText(text, fileName);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: `读取快捷操作文件失败: ${path}` });
    return null;
  }
}

/**
 * 内部通用导入逻辑
 */
async function importQuickActionFromText(text: string, fileName: string): Promise<string | null> {
  try {
    const data = JSON.parse(text);
    const quickActionStore = useQuickActionStore();

    // 兼容酒馆 (SillyTavern) 的 Quick Reply 格式
    if (data.qrList && Array.isArray(data.qrList)) {
      const name = data.name || fileName.replace(/\.[^/.]+$/, "");
      const actions: QuickAction[] = data.qrList.map((qr: any) => ({
        id: `qa-item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        label: qr.label || qr.title || "未命名操作",
        content: qr.message || "",
        autoSend: !qr.preventAutoExecute,
        icon: "Zap",
        description: qr.title || "",
      }));

      return await quickActionStore.importQuickActionSet(name, {
        actions,
        description: `从酒馆导入: ${name}`,
      });
    }

    // 兼容原生 AIO 格式
    if (data.actions && Array.isArray(data.actions)) {
      const name = data.name || fileName.replace(/\.[^/.]+$/, "");
      return await quickActionStore.importQuickActionSet(name, {
        actions: data.actions,
        description: data.description,
        isEnabled: data.isEnabled ?? true,
      });
    }

    throw new Error("无效的快捷操作格式");
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "解析快捷操作数据失败" });
    return null;
  }
}
