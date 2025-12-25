/**
 * 世界书导入服务
 */

import { STWorldbook } from "../types/worldbook";
import { useWorldbookStore } from "../worldbookStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { readTextFile } from "@tauri-apps/plugin-fs";

const logger = createModuleLogger("llm-chat/worldbookImportService");
const errorHandler = createModuleErrorHandler("llm-chat/worldbookImportService");
/**
 * 导入 SillyTavern 格式的世界书 (从 File 对象)
 */
export async function importSTWorldbook(file: File): Promise<string | null> {
  try {
    const text = await file.text();
    return await importSTWorldbookFromText(text, file.name);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "解析世界书文件失败" });
    return null;
  }
}

/**
 * 导入 SilyTavern 格式的世界书 (从文件路径)
 */
export async function importSTWorldbookFromPath(path: string): Promise<string | null> {
  try {
    const text = await readTextFile(path);
    const fileName = path.split(/[/\\]/).pop() || "未命名世界书";
    return await importSTWorldbookFromText(text, fileName);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: `读取世界书文件失败: ${path}` });
    return null;
  }
}

/**
 * 内部通用导入逻辑
 */
async function importSTWorldbookFromText(text: string, fileName: string): Promise<string | null> {
  const data = JSON.parse(text);
  
  // 基础验证
  if (!data.entries) {
    throw new Error("无效的世界书格式：缺少 entries 字段");
  }

  const worldbookStore = useWorldbookStore();
  const name = fileName.replace(/\.[^/.]+$/, ""); // 去掉扩展名作为默认名称
  
  return await worldbookStore.importWorldbook(name, data as STWorldbook);
}

/**
 * 从 Character Card 数据中提取并保存世界书
 */
export async function extractAndSaveWorldbook(cardData: any, agentName: string): Promise<string | null> {
  const characterBook = cardData.character_book || cardData.data?.character_book;
  if (!characterBook || !characterBook.entries || Object.keys(characterBook.entries).length === 0) {
    return null;
  }

  try {
    const worldbookStore = useWorldbookStore();
    const name = characterBook.name || `${agentName} 的专属世界书`;
    
    // 检查是否已经存在同名的世界书（可选，目前直接新建）
    return await worldbookStore.importWorldbook(name, characterBook as STWorldbook);
  } catch (error) {
    logger.warn("从角色卡提取世界书失败", { error });
    return null;
  }
}