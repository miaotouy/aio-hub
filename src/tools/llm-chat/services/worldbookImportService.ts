/**
 * 世界书导入服务
 */

import { STWorldbook } from "../types/worldbook";
import { useWorldbookStore } from "../stores/worldbookStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { readTextFile } from "@tauri-apps/plugin-fs";
import { parsePngMetadata } from "@/utils/pngMetadataReader";
import { isCharacterCard, convertMacros } from "./sillyTavernParser";

const logger = createModuleLogger("llm-chat/worldbookImportService");
const errorHandler = createModuleErrorHandler("llm-chat/worldbookImportService");

/**
 * 导入 SillyTavern 格式的世界书 (从 File 对象)
 */
export async function importSTWorldbook(file: File): Promise<string | null> {
  try {
    if (file.name.endsWith(".png")) {
      const buffer = await file.arrayBuffer();
      const { aioBundle, stCharacter } = await parsePngMetadata(buffer);

      // 1. 优先尝试从 AIO Bundle 提取
      if (aioBundle && aioBundle.type === 'AIO_Agent_Export' && aioBundle.agents?.[0]) {
        const agent = aioBundle.agents[0];
        // 尝试提取内嵌的世界书
        const characterBook = (agent as any).character_book || (agent as any).data?.character_book;
        if (characterBook && characterBook.entries) {
          const worldbookStore = useWorldbookStore();
          const name = characterBook.metadata?.name || agent.displayName || agent.name || file.name.replace(".png", "");
          return await worldbookStore.importWorldbook(name, characterBook as STWorldbook);
        }
      }

      // 2. 尝试从 ST 角色卡提取
      if (stCharacter && isCharacterCard(stCharacter)) {
        const characterBook = stCharacter.character_book || stCharacter.data?.character_book;
        if (characterBook && characterBook.entries) {
          const worldbookStore = useWorldbookStore();
          const name = characterBook.metadata?.name || stCharacter.name || file.name.replace(".png", "");
          return await worldbookStore.importWorldbook(name, characterBook as STWorldbook);
        }
      }
      throw new Error("该 PNG 文件不包含有效的 SillyTavern 角色卡或 AIO Bundle 数据");
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
 * 兼容 SillyTavern V2/V3 格式
 */
export function normalizeWorldbook(data: any): STWorldbook {
  const result: STWorldbook = {
    entries: {},
    metadata: data.metadata || {},
  };

  if (!data.entries) return result;

  // 映射字符串位置到枚举值
  const positionMap: Record<string, number> = {
    "before_char": 0,
    "after_char": 1,
    "before_an": 2,
    "after_an": 3,
    "depth": 4,
    "before_em": 5,
    "after_em": 6,
    "outlet": 7
  };

  // 处理 entries 可能为数组或对象的情况
  const entriesArray = Array.isArray(data.entries)
    ? data.entries
    : Object.values(data.entries);

  entriesArray.forEach((entry: any, index: number) => {
    const e = entry as any;
    const ext = e.extensions || {};

    // 确定 UID：优先使用 uid，其次 id，最后用索引
    const uid = e.uid ?? e.id ?? index;
    const uidStr = String(uid);

    // 确定位置：优先使用 extensions.position (通常是数字)，
    // 其次尝试转换字符串 position，最后回退到原始值或默认 0
    let position = ext.position ?? e.position;
    if (typeof position === 'string') {
      position = positionMap[position.toLowerCase()] ?? 0;
    }
    position = Number(position) || 0;

    result.entries[uidStr] = {
      uid: Number(uid),
      key: Array.isArray(e.key)
        ? e.key
        : (typeof e.key === 'string' ? e.key.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
      keysecondary: Array.isArray(e.keysecondary)
        ? e.keysecondary
        : (typeof e.keysecondary === 'string' ? e.keysecondary.split(',').map((s: string) => s.trim()).filter(Boolean) : []),
      comment: e.comment || "",
      content: convertMacros(e.content || ""),
      constant: !!(e.constant ?? ext.constant),
      vectorized: !!(e.vectorized ?? ext.vectorized),
      selective: e.selective !== undefined ? !!e.selective : true,
      selectiveLogic: ext.selectiveLogic ?? e.selectiveLogic ?? e.selective_logic ?? 0,
      order: e.insertion_order ?? e.order ?? 100,
      position: position,
      role: ext.role ?? e.role ?? e.insertion_role ?? 0,
      disable: !!(e.disable ?? e.disabled ?? e.enabled === false),
      probability: e.probability ?? ext.probability ?? 100,
      useProbability: e.useProbability ?? e.use_probability ?? ext.useProbability ?? true,
      depth: ext.depth ?? e.depth ?? 4,
      group: e.group || ext.group || "",
      groupWeight: e.groupWeight ?? e.group_weight ?? ext.group_weight ?? 10,
      groupOverride: !!(e.groupOverride ?? e.group_override ?? ext.group_override),
      useGroupScoring: e.useGroupScoring ?? e.use_group_scoring ?? ext.use_group_scoring,
      excludeRecursion: !!(e.excludeRecursion ?? e.exclude_recursion ?? ext.exclude_recursion),
      preventRecursion: !!(e.preventRecursion ?? e.prevent_recursion ?? ext.prevent_recursion),
      delayUntilRecursion: !!(e.delayUntilRecursion ?? e.delay_until_recursion ?? ext.delay_until_recursion),
      delayUntilRecursionLevel: e.delayUntilRecursionLevel ?? e.delay_until_recursion_level ?? ext.delay_until_recursion_level ?? 1,
      scanDepth: e.scanDepth ?? e.scan_depth ?? ext.scan_depth,
      caseSensitive: e.caseSensitive ?? e.case_sensitive ?? ext.case_sensitive,
      matchWholeWords: e.matchWholeWords ?? e.match_whole_words ?? ext.match_whole_words,
      sticky: e.sticky ?? ext.sticky,
      cooldown: e.cooldown ?? ext.coldown,
      delay: e.delay ?? ext.delay,
      ignoreBudget: !!(e.ignoreBudget ?? e.ignore_budget ?? ext.ignore_budget),
      automationId: e.automationId ?? e.automation_id ?? ext.automation_id,
      outletName: e.outletName ?? e.outlet_name ?? ext.outlet_name,
      triggers: Array.isArray(e.triggers) ? e.triggers : (Array.isArray(ext.triggers) ? ext.triggers : []),
      characterFilter: e.characterFilter || { isExclude: false, names: [], tags: [] },
      matchCharacterDescription: e.matchCharacterDescription ?? e.match_character_description ?? ext.match_character_description ?? true,
      matchCharacterPersonality: e.matchCharacterPersonality ?? e.match_character_personality ?? ext.match_character_personality ?? true,
      matchScenario: e.matchScenario ?? e.match_scenario ?? ext.match_scenario ?? true,
      matchPersonaDescription: e.matchPersonaDescription ?? e.match_persona_description ?? ext.match_persona_description ?? false,
      matchCharacterDepthPrompt: e.matchCharacterDepthPrompt ?? e.match_character_depth_prompt ?? ext.match_character_depth_prompt ?? false,
      matchCreatorNotes: e.matchCreatorNotes ?? e.match_creator_notes ?? ext.match_creator_notes ?? false,
    };
  });

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