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
          worldbook.id !== exceptId && normalizeName(worldbook.name) === normalized
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
    const index = worldbooks.value.findIndex((worldbook) => worldbook.id === id);
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
      depth: Math.max(0, Math.floor(input.depth ?? 0)),
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

  async function removeEntry(worldbookId: string, entryId: string): Promise<void> {
    const worldbook = worldbooks.value.find((item) => item.id === worldbookId);
    if (!worldbook) return;
    const entries = worldbook.entries.filter((entry) => entry.id !== entryId);
    if (entries.length === worldbook.entries.length) return;
    worldbook.entries = entries;
    worldbook.updatedAt = new Date().toISOString();
    await persist();
  }

  function getWorldbooksByIds(ids: readonly string[] | undefined): MobileWorldbook[] {
    if (!ids?.length) return [];
    const byId = new Map(worldbooks.value.map((worldbook) => [worldbook.id, worldbook]));
    return ids
      .map((id) => byId.get(id))
      .filter((worldbook): worldbook is MobileWorldbook => !!worldbook && worldbook.enabled);
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
  };
});