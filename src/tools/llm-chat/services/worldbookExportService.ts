/**
 * 世界书导出服务
 * 支持将内部格式转换回 SillyTavern 兼容格式
 */

import { STWorldbook, STWorldbookEntry } from "../types/worldbook";
import { useWorldbookStore } from "../stores/worldbookStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import JSZip from "jszip";

const logger = createModuleLogger("llm-chat/worldbookExportService");
const errorHandler = createModuleErrorHandler("llm-chat/worldbookExportService");

/**
 * 导出单个世界书
 */
export async function exportWorldbook(id: string): Promise<void> {
  try {
    const worldbookStore = useWorldbookStore();
    const wbMeta = worldbookStore.worldbooks.find((w) => w.id === id);
    if (!wbMeta) throw new Error("找不到世界书元数据");

    const content = await worldbookStore.getWorldbookContent(id);
    if (!content) throw new Error("世界书内容为空");

    const denormalized = denormalizeWorldbook(content);
    const jsonString = JSON.stringify(denormalized, null, 2);

    const savePath = await save({
      defaultPath: `${wbMeta.name}.json`,
      filters: [{ name: "SillyTavern Worldbook", extensions: ["json", "lorebook"] }],
    });
    if (savePath) {
      const encoder = new TextEncoder();
      await writeFile(savePath, encoder.encode(jsonString));
      logger.info("世界书导出成功", { id, savePath });
      customMessage.success(`世界书《${wbMeta.name}》导出成功`);
    }

  } catch (error) {
    errorHandler.error(error as Error, "导出世界书失败");
  }
}

/**
 * 批量导出世界书为 ZIP
 */
export async function exportWorldbooksBatch(ids: string[]): Promise<void> {
  let loading: { close: () => void } | null = null;
  try {
    const worldbookStore = useWorldbookStore();
    const zip = new JSZip();
    let successCount = 0;

    for (const id of ids) {
      const wbMeta = worldbookStore.worldbooks.find((w) => w.id === id);
      if (!wbMeta) continue;

      const content = await worldbookStore.getWorldbookContent(id);
      if (content) {
        const denormalized = denormalizeWorldbook(content);
        const safeName = wbMeta.name.replace(/[\\/:*?"<>|]/g, "_");
        zip.file(`${safeName}.json`, JSON.stringify(denormalized, null, 2));
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
      defaultPath: `worldbooks_export_${dateStr}.zip`,
      filters: [{ name: "Zip Archive", extensions: ["zip"] }],
    });

    if (savePath) {
      await writeFile(savePath, zipContent);
      logger.info("批量导出世界书成功", { count: successCount, savePath });
      loading.close();
      customMessage.success(`成功导出 ${successCount} 本世界书`);
    } else {
      loading.close();
    }
  } catch (error) {
    loading?.close();
    errorHandler.error(error as Error, "批量导出世界书失败");
  }
}

/**
 * 逆规范化：将内部 CamelCase 格式转换回 SillyTavern 期望的 SnakeCase 格式
 */
export function denormalizeWorldbook(data: STWorldbook): any {
  const result: any = {
    entries: {},
    metadata: data.metadata || {},
  };

  Object.entries(data.entries).forEach(([key, entry]) => {
    const e = entry as STWorldbookEntry;

    // 映射数字位置到字符串 (酒馆根层级期望字符串)
    // 对比 world-info.js:3234 (updatePosOrdDisplayHelper)
    const positionStrings = [
      "before_char", // 0
      "after_char",  // 1
      "before_an",   // 2
      "after_an",    // 3
      "at_depth",    // 4
      "before_em",   // 5
      "after_em",    // 6
      "outlet"       // 7
    ];
    const posString = positionStrings[e.position] || "before_char";

    // 构造酒馆标准的 entry 对象 (对齐 originalWIDataKeyMap)
    const stEntry: any = {
      uid: e.uid,
      keys: e.key,
      secondary_keys: e.keysecondary,
      comment: e.comment,
      content: e.content,
      constant: e.constant,
      selective: e.selective,
      selectiveLogic: e.selectiveLogic,
      add_to_recursion: true,
      insertion_order: e.order,
      position: posString,
      insertion_role: e.role,
      enabled: !e.disable,
      character_filter: e.characterFilter || {
        isExclude: false,
        names: [],
        tags: [],
      },
    };

    // 酒馆 V3 会把详细字段放在 extensions 里 (对齐 originalWIDataKeyMap)
    stEntry.extensions = {
      display_index: e.uid, // 内部暂无 displayIndex 字段，默认使用 UID
      position: e.position,
      role: e.role,
      depth: e.depth,
      probability: e.probability,
      useProbability: e.useProbability,
      selectiveLogic: e.selectiveLogic,
      constant: e.constant,
      vectorized: e.vectorized,
      sticky: e.sticky,
      cooldown: e.cooldown,
      delay: e.delay,
      automation_id: e.automationId,
      exclude_recursion: e.excludeRecursion,
      prevent_recursion: e.preventRecursion,
      delay_until_recursion: e.delayUntilRecursion,
      group: e.group,
      group_weight: e.groupWeight,
      group_override: e.groupOverride,
      use_group_scoring: e.useGroupScoring,
      scan_depth: e.scanDepth,
      case_sensitive: e.caseSensitive,
      match_whole_words: e.matchWholeWords,
      match_persona_description: e.matchPersonaDescription,
      match_character_description: e.matchCharacterDescription,
      match_character_personality: e.matchCharacterPersonality,
      match_character_depth_prompt: e.matchCharacterDepthPrompt,
      match_scenario: e.matchScenario,
      match_creator_notes: e.matchCreatorNotes,
      outlet_name: e.outletName,
      triggers: e.triggers,
      ignore_budget: e.ignoreBudget,
    };

    // 保持根层级的一些兼容性字段 (虽然主要看 extensions)
    stEntry.order = e.order;
    stEntry.probability = e.probability;

    result.entries[key] = stEntry;
  });

  return result;
}
