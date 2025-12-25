/**
 * 世界书导入服务
 */

import { STWorldbook } from "../types/worldbook";
import { useWorldbookStore } from "../worldbookStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parseCharacterDataFromPng } from "@/utils/pngMetadataReader";
import { isCharacterCard } from "./sillyTavernParser";

const logger = createModuleLogger("llm-chat/worldbookImportService");
const errorHandler = createModuleErrorHandler("llm-chat/worldbookImportService");

/**
 * 导入 SillyTavern 格式的世界书 (从 File 对象)
 */
export async function importSTWorldbook(file: File): Promise<string | null> {
  try {
    if (file.name.endsWith(".png")) {
      const buffer = await file.arrayBuffer();
      const jsonData = await parseCharacterDataFromPng(buffer) as any;
      if (jsonData && isCharacterCard(jsonData)) {
        const characterBook = jsonData.character_book || jsonData.data?.character_book;
        if (characterBook && characterBook.entries) {
          const worldbookStore = useWorldbookStore();
          // SillyTavern 的世界书名称可能在 metadata 中，也可能直接用角色名
          const name = characterBook.metadata?.name || jsonData.name || file.name.replace(".png", "");
          return await worldbookStore.importWorldbook(name, characterBook as STWorldbook);
        }
      }
      throw new Error("该 PNG 文件不包含有效的 SillyTavern 角色卡或世界书数据");
    }

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

  // 规范化数据
  const normalizedData = normalizeWorldbook(data);

  return await worldbookStore.importWorldbook(name, normalizedData);
}

/**
 * 规范化世界书数据，处理 SnakeCase 到 CamelCase 的转换
 */
export function normalizeWorldbook(data: any): STWorldbook {
  const result: STWorldbook = {
    entries: {},
    metadata: data.metadata || {},
  };

  if (data.entries) {
    for (const [id, entry] of Object.entries(data.entries)) {
      const e = entry as any;
      result.entries[id] = {
        uid: e.uid,
        key: Array.isArray(e.key)
          ? e.key
          : (typeof e.key === 'string' ? e.key.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
        keysecondary: Array.isArray(e.keysecondary)
          ? e.keysecondary
          : (typeof e.keysecondary === 'string' ? e.keysecondary.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
        comment: e.comment || "",
        content: e.content || "",
        constant: !!e.constant,
        vectorized: !!e.vectorized,
        selective: e.selective !== undefined ? !!e.selective : true,
        selectiveLogic: e.selectiveLogic ?? e.selective_logic,
        order: e.order ?? 100,
        position: e.position ?? 0,
        role: e.role ?? e.insertion_role,
        disable: !!(e.disable ?? e.disabled),
        probability: e.probability ?? 100,
        useProbability: e.useProbability ?? e.use_probability ?? true,
        depth: e.depth ?? 4,
        group: e.group || "",
        groupWeight: e.groupWeight ?? e.group_weight ?? 10,
        groupOverride: !!(e.groupOverride ?? e.group_override),
        useGroupScoring: e.useGroupScoring ?? e.use_group_scoring,
        excludeRecursion: !!(e.excludeRecursion ?? e.exclude_recursion),
        preventRecursion: !!(e.preventRecursion ?? e.prevent_recursion),
        delayUntilRecursion: !!(e.delayUntilRecursion ?? e.delay_until_recursion),
        delayUntilRecursionLevel: e.delayUntilRecursionLevel ?? e.delay_until_recursion_level ?? 1,
        scanDepth: e.scanDepth ?? e.scan_depth,
        caseSensitive: e.caseSensitive ?? e.case_sensitive,
        matchWholeWords: e.matchWholeWords ?? e.match_whole_words,
        sticky: e.sticky,
        cooldown: e.cooldown,
        delay: e.delay,
        ignoreBudget: !!(e.ignoreBudget ?? e.ignore_budget),
        automationId: e.automationId ?? e.automation_id,
        outletName: e.outletName ?? e.outlet_name,
        triggers: Array.isArray(e.triggers) ? e.triggers : [],
        characterFilter: e.characterFilter || { isExclude: false, names: [], tags: [] },
        matchCharacterDescription: e.matchCharacterDescription ?? e.match_character_description ?? true,
        matchCharacterPersonality: e.matchCharacterPersonality ?? e.match_character_personality ?? true,
        matchScenario: e.matchScenario ?? e.match_scenario ?? true,
        matchPersonaDescription: e.matchPersonaDescription ?? e.match_persona_description ?? false,
        matchCharacterDepthPrompt: e.matchCharacterDepthPrompt ?? e.match_character_depth_prompt ?? false,
        matchCreatorNotes: e.matchCreatorNotes ?? e.match_creator_notes ?? false,
      };
    }
  }

  return result;
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
    const name = characterBook.metadata?.name || characterBook.name || `${agentName} 的专属世界书`;

    // 规范化数据
    const normalizedBook = normalizeWorldbook(characterBook);

    // 检查是否已经存在同名的世界书（可选，目前直接新建）
    return await worldbookStore.importWorldbook(name, normalizedBook);
  } catch (error) {
    logger.warn("从角色卡提取世界书失败", { error });
    return null;
  }
}