import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { v4 as uuidv4 } from "uuid";
import { createConfigManager } from "@/utils/configManager";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { createModuleLogger } from "@/utils/logger";
import type {
  MessageRole,
  MobileWorldbook,
  MobileWorldbookConfig,
  MobileWorldbookEntry,
  WorldbookEntryPosition,
  WorldbookSelectiveLogic,
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

function readBoolean(...values: unknown[]): boolean {
  return values.some((value) => value === true);
}

function readFiniteNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

/** 关键词数组归一化：支持数组或逗号分隔字符串。 */
function normalizeKeys(rawKeys: unknown): string[] {
  if (Array.isArray(rawKeys)) {
    return rawKeys
      .filter((key): key is string => typeof key === "string")
      .map((key) => key.trim())
      .filter(Boolean);
  }
  if (typeof rawKeys === "string") {
    return rawKeys
      .split(",")
      .map((key) => key.trim())
      .filter(Boolean);
  }
  return [];
}

/**
 * ST 数字位置 → 移动端有效位置。AN / EM 在移动端没有独立锚点，就近降级并汇总 warning；
 * 原始枚举通过 stPosition 保留，便于未来无损迁移。
 */
const ST_NUMBER_POSITIONS: Record<
  number,
  { position: WorldbookEntryPosition; exact: boolean }
> = {
  0: { position: "before_character", exact: true },
  1: { position: "after_character", exact: true },
  2: { position: "before_history", exact: false },
  3: { position: "after_history", exact: false },
  4: { position: "depth", exact: true },
  5: { position: "before_history", exact: false },
  6: { position: "after_history", exact: false },
  7: { position: "outlet", exact: false },
};

/** ST 字符串位置 → 移动端有效位置。 */
const ST_STRING_POSITIONS: Record<
  string,
  { position: WorldbookEntryPosition; exact: boolean; stPosition: number }
> = {
  before_char: { position: "before_character", exact: true, stPosition: 0 },
  after_char: { position: "after_character", exact: true, stPosition: 1 },
  before_an: { position: "before_history", exact: false, stPosition: 2 },
  after_an: { position: "after_history", exact: false, stPosition: 3 },
  depth: { position: "depth", exact: true, stPosition: 4 },
  at_depth: { position: "depth", exact: true, stPosition: 4 },
  before_em: { position: "before_history", exact: false, stPosition: 5 },
  after_em: { position: "after_history", exact: false, stPosition: 6 },
  outlet: { position: "outlet", exact: false, stPosition: 7 },
};

/** ST selectiveLogic 数字 → 移动端字符串。0 and_any / 1 not_all / 2 not_any / 3 and_all。 */
const ST_SELECTIVE_LOGIC: Record<number, WorldbookSelectiveLogic> = {
  0: "and_any",
  1: "not_all",
  2: "not_any",
  3: "and_all",
};

function resolveSelectiveLogic(raw: unknown): WorldbookSelectiveLogic {
  if (typeof raw === "number") return ST_SELECTIVE_LOGIC[raw] ?? "and_any";
  if (typeof raw === "string") {
    const key = raw.trim().toLowerCase();
    if (key === "and_all" || key === "not_any" || key === "not_all")
      return key;
    if (key === "and_any") return "and_any";
  }
  return "and_any";
}

/** ST role 0/1/2 或字符串 → 移动端消息角色。 */
function resolveStRole(raw: unknown): MessageRole | undefined {
  if (typeof raw === "number") {
    if (raw === 1) return "user";
    if (raw === 2) return "assistant";
    if (raw === 0) return "system";
    return undefined;
  }
  if (typeof raw === "string") {
    const value = raw.trim().toLowerCase();
    if (value === "user" || value === "assistant" || value === "system")
      return value;
  }
  return undefined;
}

/**
 * 解析 ST 条目插入位置。移动端已覆盖 before_character / after_character /
 * before_history / after_history / depth / outlet；AN、EM 与 Outlet 语义有损，
 * `exact` 为 false 时由调用方汇总进 warnings，避免静默丢失。
 */
function resolveStPosition(
  rawPosition: unknown,
  extensions: Record<string, unknown> | undefined
): { position: WorldbookEntryPosition; exact: boolean; stPosition?: number } {
  const value = rawPosition ?? extensions?.position;
  if (typeof value === "number") {
    const resolved = ST_NUMBER_POSITIONS[value] ?? {
      position: "before_history" as WorldbookEntryPosition,
      exact: false,
    };
    return { ...resolved, stPosition: value };
  }
  if (typeof value === "string") {
    const key = value.trim().toLowerCase();
    const resolved = ST_STRING_POSITIONS[key];
    if (resolved)
      return {
        position: resolved.position,
        exact: resolved.exact,
        stPosition: resolved.stPosition,
      };
    return { position: "before_history", exact: false };
  }
  return { position: "before_history", exact: true };
}

/** 把单条 ST 世界书条目归一化为移动端条目；无内容条目丢弃。未知字段保留在 raw。 */
function normalizeStEntry(
  raw: unknown,
  index: number,
  warnings: string[]
): MobileWorldbookEntry | null {
  if (!isRecord(raw)) return null;
  const content = readString(raw, "content").trim();
  if (!content) return null;
  const extensions = isRecord(raw.extensions) ? raw.extensions : undefined;
  const keys = normalizeKeys(raw.key ?? raw.keys);
  const { position, exact, stPosition } = resolveStPosition(
    raw.position,
    extensions
  );
  if (!exact) {
    const label = readString(raw, "comment") || `#${index}`;
    warnings.push(
      `世界书条目「${label}」的插入位置 ${String(
        raw.position ?? extensions?.position
      )} 已降级为 ${position}。`
    );
  }
  const secondaryKeys = normalizeKeys(
    raw.keysecondary ??
      raw.keySecondary ??
      raw.secondaryKeys ??
      raw.secondary_key ??
      raw.key_secondary
  );
  const order = readFiniteNumber(raw.order, raw.insertion_order);
  const depth = readFiniteNumber(raw.depth, extensions?.depth);
  const scanDepth = readFiniteNumber(
    raw.scanDepth,
    raw.scan_depth,
    extensions?.scan_depth,
    extensions?.scanDepth
  );
  const probability = readFiniteNumber(raw.probability);
  const delayUntilRecursionLevel = readFiniteNumber(
    raw.delayUntilRecursionLevel,
    raw.delay_until_recursion_level,
    extensions?.delay_until_recursion_level
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
    order: order ?? 100,
    position,
    stPosition,
    role: resolveStRole(raw.role),
    depth: depth !== undefined ? Math.max(0, Math.floor(depth)) : 4,
    scanDepth:
      scanDepth !== undefined ? Math.max(1, Math.floor(scanDepth)) : undefined,
    caseSensitive: readBoolean(
      raw.caseSensitive,
      raw.case_sensitive,
      extensions?.case_sensitive
    ),
    matchWholeWords: readBoolean(
      raw.matchWholeWords,
      raw.match_whole_words,
      extensions?.match_whole_words
    ),
    selective: raw.selective === true,
    secondaryKeys: secondaryKeys.length ? secondaryKeys : undefined,
    selectiveLogic: resolveSelectiveLogic(
      raw.selectiveLogic ??
        raw.selective_logic ??
        extensions?.selectiveLogic ??
        extensions?.selective_logic
    ),
    probability:
      probability !== undefined
        ? Math.min(100, Math.max(0, probability))
        : undefined,
    useProbability: readBoolean(raw.useProbability, raw.use_probability),
    excludeRecursion: readBoolean(
      raw.excludeRecursion,
      raw.exclude_recursion,
      extensions?.exclude_recursion
    ),
    preventRecursion: readBoolean(
      raw.preventRecursion,
      raw.prevent_recursion,
      extensions?.prevent_recursion
    ),
    delayUntilRecursion: readBoolean(
      raw.delayUntilRecursion,
      raw.delay_until_recursion,
      extensions?.delay_until_recursion
    ),
    delayUntilRecursionLevel:
      delayUntilRecursionLevel !== undefined
        ? Math.max(1, Math.floor(delayUntilRecursionLevel))
        : undefined,
    raw: { ...raw },
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
      settings: input.settings,
      rawMetadata: input.rawMetadata,
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
    const existing =
      existingIndex >= 0 ? worldbook.entries[existingIndex] : undefined;
    // 以既有条目为基底合并，避免 UI 未暴露的高级字段与 raw 在编辑时被清空。
    const entry: MobileWorldbookEntry = {
      ...(existing ?? {}),
      ...input,
      id: input.id || existing?.id || uuidv4(),
      name: input.name?.trim() || undefined,
      keys: (input.keys ?? existing?.keys ?? [])
        .map((key) => key.trim())
        .filter(Boolean),
      content: input.content,
      enabled: input.enabled ?? existing?.enabled ?? true,
      constant: input.constant ?? existing?.constant ?? false,
      order: Number.isFinite(input.order)
        ? Number(input.order)
        : (existing?.order ?? 100),
      position: input.position ?? existing?.position ?? "before_history",
      role: input.role ?? existing?.role,
      depth: Math.max(0, Math.floor(input.depth ?? existing?.depth ?? 4)),
      scanDepth: Math.max(
        1,
        Math.floor(input.scanDepth ?? existing?.scanDepth ?? 8)
      ),
      caseSensitive: input.caseSensitive ?? existing?.caseSensitive ?? false,
      matchWholeWords:
        input.matchWholeWords ?? existing?.matchWholeWords ?? false,
      selective: input.selective ?? existing?.selective ?? false,
      secondaryKeys: (input.secondaryKeys ?? existing?.secondaryKeys ?? [])
        .map((key) => key.trim())
        .filter(Boolean),
      selectiveLogic:
        input.selectiveLogic ?? existing?.selectiveLogic ?? "and_any",
      probability: input.probability ?? existing?.probability,
      useProbability:
        input.useProbability ?? existing?.useProbability ?? false,
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

  /** 仅在导入时汇总一次的高级语义 warning：字段已保留但运行时未执行。 */
  function collectRuntimeWarnings(entries: MobileWorldbookEntry[]): string[] {
    const warnings: string[] = [];
    const hasRecursion = entries.some(
      (entry) =>
        entry.excludeRecursion ||
        entry.preventRecursion ||
        entry.delayUntilRecursion ||
        entry.delayUntilRecursionLevel !== undefined
    );
    if (hasRecursion) {
      warnings.push(
        "部分条目包含递归扫描字段，已无损保存，但移动端当前不执行递归扫描。"
      );
    }
    const hasGroup = entries.some(
      (entry) =>
        typeof entry.raw?.group === "string" && entry.raw.group.trim() !== ""
    );
    if (hasGroup) {
      warnings.push(
        "部分条目属于世界书分组，分组竞争未在移动端实现，原始分组字段已保留。"
      );
    }
    const hasVector = entries.some((entry) => entry.raw?.vectorized === true);
    if (hasVector) {
      warnings.push("部分条目为向量化条目，移动端不支持向量检索，已按关键词处理。");
    }
    return warnings;
  }

  /**
   * 导入 SillyTavern 世界书（entries 数组或字典均可）。
   * 映射移动端可执行的语义：六值位置、role、次要关键词、概率、扫描深度与顺序；
   * 递归 / 分组 / 向量等仍无法执行的语义通过 warnings 汇总，原始字段无损保留在 raw。
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
    warnings.push(...collectRuntimeWarnings(entries));

    const metadata = isRecord(input.book.metadata)
      ? input.book.metadata
      : undefined;
    const baseName =
      input.name?.trim() ||
      (metadata ? readString(metadata, "name") : "") ||
      "Imported Worldbook";
    const rawSettings = isRecord(input.book.settings)
      ? input.book.settings
      : isRecord(metadata?.settings)
        ? metadata.settings
        : undefined;
    const worldbook = await createWorldbook({
      name: uniqueWorldbookName(baseName),
      description: metadata
        ? readString(metadata, "description") || undefined
        : undefined,
      entries,
      settings: rawSettings
        ? (rawSettings as MobileWorldbook["settings"])
        : undefined,
      rawMetadata: metadata ? { ...metadata } : undefined,
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
