import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { v4 as uuidv4 } from "uuid";
import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  MobileWorldbook,
  MobileWorldbookConfig,
  MobileWorldbookEntry,
  WorldbookEntryPosition,
} from "../types";

const logger = createModuleLogger("llm-chat/worldbook-store");
const errorHandler = createModuleErrorHandler("llm-chat/worldbook-store");

const worldbookManager = createConfigManager<MobileWorldbookConfig>({
  moduleName: "llm-chat",
  fileName: "worldbooks.json",
  version: "1.0.0",
  createDefault: () => ({ worldbooks: [] }),
  mergeConfig: (defaults, loaded) => ({
    ...defaults,
    ...loaded,
    worldbooks: Array.isArray(loaded.worldbooks) ? loaded.worldbooks : [],
  }),
});

function normalizeName(name: string): string {
  return name.trim().toLocaleLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(record: Record<string, unknown>, key: string): string {
  return typeof record[key] === "string" ? (record[key] as string) : "";
}

/** ST 数字位置枚举 → 移动端三值位置（0 before_char、1 after_char、4 depth 等） */
const ST_NUMBER_POSITIONS: Record<number, WorldbookEntryPosition> = {
  0: "before_history",
  1: "after_character",
  2: "before_history",
  3: "after_character",
  4: "depth",
  5: "before_history",
  6: "after_character",
  7: "before_history",
};

/** ST 字符串位置 → 移动端三值位置 */
const ST_STRING_POSITIONS: Record<string, WorldbookEntryPosition> = {
  before_char: "before_history",
  before_an: "before_history",
  before_em: "before_history",
  after_char: "after_character",
  after_an: "after_character",
  after_em: "after_character",
  depth: "depth",
  at_depth: "depth",
  outlet: "before_history",
};

const ST_EXACT_NUMBER_POSITIONS = new Set([0, 1, 4]);
const ST_EXACT_STRING_POSITIONS = new Set([
  "before_char",
  "after_char",
  "depth",
  "at_depth",
]);

/**
 * 解析 ST 条目插入位置。移动端仅有 before_history / after_character / depth 三值，
 * 高级位置（before_an/after_an/before_em/after_em/outlet）就近降级，
 * `exact` 为 false 时由调用方汇总进 warnings，避免静默丢失。
 */
function resolveStPosition(
  rawPosition: unknown,
  extensions: Record<string, unknown> | undefined
): { position: WorldbookEntryPosition; exact: boolean } {
  const value = rawPosition ?? extensions?.position;
  if (typeof value === "number") {
    return {
      position: ST_NUMBER_POSITIONS[value] ?? "before_history",
      exact: ST_EXACT_NUMBER_POSITIONS.has(value),
    };
  }
  if (typeof value === "string") {
    const key = value.toLowerCase();
    return {
      position: ST_STRING_POSITIONS[key] ?? "before_history",
      exact: ST_EXACT_STRING_POSITIONS.has(key),
    };
  }
  return { position: "before_history", exact: true };
}

/** 把单条 ST 世界书条目归一化为移动端条目；无内容条目丢弃 */
function normalizeStEntry(
  raw: unknown,
  index: number,
  warnings: string[]
): MobileWorldbookEntry | null {
  if (!isRecord(raw)) return null;
  const content = readString(raw, "content").trim();
  if (!content) return null;
  const extensions = isRecord(raw.extensions) ? raw.extensions : undefined;
  const rawKeys = raw.key ?? raw.keys;
  const keys = Array.isArray(rawKeys)
    ? rawKeys
        .filter((key): key is string => typeof key === "string")
        .map((key) => key.trim())
        .filter(Boolean)
    : typeof rawKeys === "string"
      ? rawKeys
          .split(",")
          .map((key) => key.trim())
          .filter(Boolean)
      : [];
  const { position, exact } = resolveStPosition(raw.position, extensions);
  if (!exact) {
    const label = readString(raw, "comment") || `#${index}`;
    warnings.push(
      `世界书条目「${label}」的插入位置 ${String(raw.position ?? extensions?.position)} 已降级为 ${position}。`
    );
  }
  const order = Number(raw.order ?? raw.insertion_order);
  const depth = Number(raw.depth ?? extensions?.depth);
  const scanDepth = Number(
    raw.scanDepth ?? raw.scan_depth ?? extensions?.scan_depth
  );
  return {
    id: String(raw.uid ?? raw.id ?? index),
    name: readString(raw, "comment") || undefined,
    keys,
    content,
    enabled: !(
      raw.disable === true ||
      raw.disabled === true ||
      raw.enabled === false
    ),
    constant: raw.constant === true,
    order: Number.isFinite(order) ? order : 100,
    position,
    depth: Number.isFinite(depth) ? Math.max(0, Math.floor(depth)) : 4,
    scanDepth: Number.isFinite(scanDepth)
      ? Math.max(1, Math.floor(scanDepth))
      : undefined,
    caseSensitive: raw.caseSensitive === true || raw.case_sensitive === true,
    matchWholeWords:
      raw.matchWholeWords === true || raw.match_whole_words === true,
  };
}

export const useWorldbookStore = defineStore("llm-chat-worldbooks", () => {
  const worldbooks = ref<MobileWorldbook[]>([]);
  const isLoaded = ref(false);
  const isLoading = ref(false);

  const sortedWorldbooks = computed(() =>
    [...worldbooks.value].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    )
  );

  async function init(): Promise<void> {
    if (isLoaded.value || isLoading.value) return;
    isLoading.value = true;
    try {
      const config = await worldbookManager.load();
      worldbooks.value = Array.isArray(config.worldbooks)
        ? config.worldbooks
        : [];
      isLoaded.value = true;
      logger.info("世界书已加载", { count: worldbooks.value.length });
    } catch (error) {
      errorHandler.handle(error as Error, {
        userMessage: "加载世界书失败",
        showToUser: false,
      });
    } finally {
      isLoading.value = false;
    }
  }

  async function persist(): Promise<void> {
    await worldbookManager.save({ worldbooks: worldbooks.value });
  }

  function assertNameAvailable(name: string, exceptId?: string): void {
    const normalized = normalizeName(name);
    if (!normalized) throw new Error("WORLDBOOK_NAME_REQUIRED");
    if (
      worldbooks.value.some(
        (worldbook) =>
          worldbook.id !== exceptId &&
          normalizeName(worldbook.name) === normalized
      )
    ) {
      throw new Error("WORLDBOOK_NAME_DUPLICATE");
    }
  }

  async function createWorldbook(
    input: Pick<MobileWorldbook, "name"> &
      Partial<Omit<MobileWorldbook, "id" | "createdAt" | "updatedAt" | "name">>
  ): Promise<MobileWorldbook> {
    assertNameAvailable(input.name);
    const now = new Date().toISOString();
    const worldbook: MobileWorldbook = {
      id: uuidv4(),
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
      enabled: input.enabled ?? true,
      entries: input.entries ?? [],
      createdAt: now,
      updatedAt: now,
    };
    worldbooks.value.push(worldbook);
    await persist();
    return worldbook;
  }

  async function updateWorldbook(
    id: string,
    updates: Partial<Omit<MobileWorldbook, "id" | "createdAt" | "updatedAt">>
  ): Promise<MobileWorldbook | null> {
    const index = worldbooks.value.findIndex(
      (worldbook) => worldbook.id === id
    );
    if (index < 0) return null;
    if (updates.name !== undefined) assertNameAvailable(updates.name, id);
    const previous = worldbooks.value[index];
    const updated: MobileWorldbook = {
      ...previous,
      ...updates,
      name: updates.name === undefined ? previous.name : updates.name.trim(),
      description:
        updates.description === undefined
          ? previous.description
          : updates.description?.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };
    worldbooks.value[index] = updated;
    await persist();
    return updated;
  }

  async function removeWorldbook(id: string): Promise<void> {
    const next = worldbooks.value.filter((worldbook) => worldbook.id !== id);
    if (next.length === worldbooks.value.length) return;
    worldbooks.value = next;
    await persist();
  }

  async function upsertEntry(
    worldbookId: string,
    input: Partial<MobileWorldbookEntry> & Pick<MobileWorldbookEntry, "content">
  ): Promise<MobileWorldbookEntry | null> {
    const worldbook = worldbooks.value.find((item) => item.id === worldbookId);
    if (!worldbook) return null;
    const existingIndex = input.id
      ? worldbook.entries.findIndex((entry) => entry.id === input.id)
      : -1;
    const entry: MobileWorldbookEntry = {
      id: input.id || uuidv4(),
      name: input.name?.trim() || undefined,
      keys: (input.keys ?? []).map((key) => key.trim()).filter(Boolean),
      content: input.content,
      enabled: input.enabled ?? true,
      constant: input.constant ?? false,
      order: Number.isFinite(input.order) ? Number(input.order) : 100,
      position: input.position ?? "before_history",
      depth: Math.max(0, Math.floor(input.depth ?? 4)),
      scanDepth: Math.max(1, Math.floor(input.scanDepth ?? 8)),
      caseSensitive: input.caseSensitive ?? false,
      matchWholeWords: input.matchWholeWords ?? false,
    };
    if (existingIndex >= 0) worldbook.entries.splice(existingIndex, 1, entry);
    else worldbook.entries.push(entry);
    worldbook.updatedAt = new Date().toISOString();
    await persist();
    return entry;
  }

  async function removeEntry(
    worldbookId: string,
    entryId: string
  ): Promise<void> {
    const worldbook = worldbooks.value.find((item) => item.id === worldbookId);
    if (!worldbook) return;
    const entries = worldbook.entries.filter((entry) => entry.id !== entryId);
    if (entries.length === worldbook.entries.length) return;
    worldbook.entries = entries;
    worldbook.updatedAt = new Date().toISOString();
    await persist();
  }

  function getWorldbooksByIds(
    ids: readonly string[] | undefined
  ): MobileWorldbook[] {
    if (!ids?.length) return [];
    const byId = new Map(
      worldbooks.value.map((worldbook) => [worldbook.id, worldbook])
    );
    return ids
      .map((id) => byId.get(id))
      .filter(
        (worldbook): worldbook is MobileWorldbook =>
          !!worldbook && worldbook.enabled
      );
  }

  /** 导入时名称冲突自动追加序号，避免整本书导入失败 */
  function uniqueWorldbookName(base: string): string {
    const trimmed = base.trim() || "Imported Worldbook";
    const exists = (candidate: string) =>
      worldbooks.value.some(
        (worldbook) => normalizeName(worldbook.name) === normalizeName(candidate)
      );
    if (!exists(trimmed)) return trimmed;
    let suffix = 2;
    while (exists(`${trimmed} (${suffix})`)) suffix++;
    return `${trimmed} (${suffix})`;
  }

  /**
   * 导入 SillyTavern 世界书（entries 数组或字典均可）。
   * 映射为移动端简化模型：三值位置、关键词、常量、顺序与扫描深度；
   * 移动端无法表达的高级位置等语义通过 warnings 汇总，不静默丢弃。
   */
  async function importFromSillyTavern(input: {
    book: unknown;
    name?: string;
  }): Promise<{ worldbook: MobileWorldbook; warnings: string[] }> {
    if (!isRecord(input.book)) throw new Error("INVALID_WORLDBOOK");
    const rawEntries = input.book.entries;
    if (!Array.isArray(rawEntries) && !isRecord(rawEntries)) {
      throw new Error("INVALID_WORLDBOOK");
    }
    const entriesSource = Array.isArray(rawEntries)
      ? rawEntries
      : Object.values(rawEntries);
    const warnings: string[] = [];
    const entries = entriesSource
      .map((entry, index) => normalizeStEntry(entry, index, warnings))
      .filter((entry): entry is MobileWorldbookEntry => entry !== null);
    if (entries.length === 0) throw new Error("EMPTY_WORLDBOOK");

    const metadata = isRecord(input.book.metadata)
      ? input.book.metadata
      : undefined;
    const baseName =
      input.name?.trim() ||
      (metadata ? readString(metadata, "name") : "") ||
      "Imported Worldbook";
    const worldbook = await createWorldbook({
      name: uniqueWorldbookName(baseName),
      description: metadata
        ? readString(metadata, "description") || undefined
        : undefined,
      entries,
    });
    logger.info("已导入 SillyTavern 世界书", {
      worldbookId: worldbook.id,
      entryCount: entries.length,
      warningCount: warnings.length,
    });
    return { worldbook, warnings };
  }

  return {
    worldbooks,
    sortedWorldbooks,
    isLoaded,
    isLoading,
    init,
    createWorldbook,
    updateWorldbook,
    removeWorldbook,
    upsertEntry,
    removeEntry,
    getWorldbooksByIds,
    importFromSillyTavern,
  };
});
