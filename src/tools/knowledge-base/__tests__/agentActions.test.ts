import { describe, it, expect, beforeEach, vi } from "vitest";
import registryInstances from "../knowledge-base.registry";
import {
  batchUpdateMetadata,
  deleteEntry,
  listEntriesMetadata,
  listKnowledgeBases,
  searchEntries,
  updateEntryContent,
  upsertEntry,
} from "../actions/agentActions";
import type { Caiu, KnowledgeBaseMeta } from "../types";

const {
  mockInvoke,
  mockKbStorage,
  mockStore,
  mockCalculateHash,
} = vi.hoisted(() => ({
  mockInvoke: vi.fn(),
  mockKbStorage: {
    loadWorkspace: vi.fn(),
    loadBaseMeta: vi.fn(),
    loadEntry: vi.fn(),
    saveEntry: vi.fn(),
    deleteEntry: vi.fn(),
  },
  mockStore: {
    activeBaseId: "kb-1",
    activeEntryId: "entry-1",
    config: {
      defaultEmbeddingModel: "",
      embeddingRequestSettings: {},
    },
    validateVectorStatus: vi.fn(async () => undefined),
    updateGlobalStats: vi.fn(async () => undefined),
  },
  mockCalculateHash: vi.fn(async (content: string) => `hash:${content.length}`),
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: mockInvoke,
}));

vi.mock("../utils/kbStorage", () => ({
  kbStorage: mockKbStorage,
}));

vi.mock("../utils/kbUtils", () => ({
  calculateHash: mockCalculateHash,
}));

vi.mock("../stores/knowledgeBaseStore", () => ({
  useKnowledgeBaseStore: () => mockStore,
}));

vi.mock("@/composables/useLlmProfiles", () => ({
  useLlmProfiles: () => ({
    profiles: { value: [] },
  }),
}));

vi.mock("../logic/orchestrator", () => ({
  IndexingOrchestrator: vi.fn(() => ({
    indexEntry: vi.fn(),
  })),
}));

vi.mock("@/utils/modelIdUtils", () => ({
  getPureModelId: vi.fn((value: string) => value),
  getProfileId: vi.fn((value: string) => value),
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock("@/utils/errorHandler", () => ({
  createModuleErrorHandler: () => ({
    handle: vi.fn(),
  }),
}));

function createEntry(overrides: Partial<Caiu> = {}): Caiu {
  return {
    id: "entry-1",
    key: "Rust Notes",
    content:
      "Rust ownership notes with enough original text for precise replacement.",
    summary: "Rust ownership notes",
    tags: [
      { name: "rust", weight: 1 },
      { name: "memory", weight: 1 },
    ],
    assets: [],
    priority: 100,
    enabled: true,
    createdAt: 1000,
    updatedAt: 2000,
    contentHash: "hash:old",
    ...overrides,
  };
}

function createMeta(): KnowledgeBaseMeta {
  return {
    id: "kb-1",
    name: "Dev Notes",
    description: "Developer notes",
    createdAt: 100,
    updatedAt: 300,
    vectorization: {
      isIndexed: true,
      lastIndexedAt: 250,
      modelId: "embedding-model",
      provider: "test",
      dimension: 3,
    },
    entries: [
      {
        id: "entry-1",
        key: "Rust Notes",
        summary: "Rust ownership notes",
        tags: ["rust", "memory"],
        priority: 100,
        enabled: true,
        updatedAt: 2000,
        vectorStatus: "ready",
        vectorizedModels: ["embedding-model"],
        totalTokens: 42,
      },
      {
        id: "entry-2",
        key: "Vue Notes",
        summary: "Vue composition notes",
        tags: ["vue"],
        priority: 80,
        enabled: false,
        updatedAt: 1500,
        vectorStatus: "none",
        vectorizedModels: [],
        totalTokens: 12,
      },
    ],
    tags: [],
    icon: null,
    config: {
      searchTopK: 5,
      minScore: 0.5,
    },
  };
}

describe("knowledge-base agent actions", () => {
  let meta: KnowledgeBaseMeta;
  let entries: Map<string, Caiu>;

  beforeEach(() => {
    meta = createMeta();
    entries = new Map([
      ["entry-1", createEntry()],
      ["entry-2", createEntry({
        id: "entry-2",
        key: "Vue Notes",
        content: "Vue composition API notes",
        tags: [{ name: "vue", weight: 1 }],
        priority: 80,
        enabled: false,
      })],
    ]);

    mockInvoke.mockReset();
    mockKbStorage.loadWorkspace.mockReset();
    mockKbStorage.loadBaseMeta.mockReset();
    mockKbStorage.loadEntry.mockReset();
    mockKbStorage.saveEntry.mockReset();
    mockKbStorage.deleteEntry.mockReset();
    mockStore.validateVectorStatus.mockClear();
    mockStore.updateGlobalStats.mockClear();
    mockStore.activeBaseId = "kb-1";
    mockStore.activeEntryId = "entry-1";
    mockCalculateHash.mockClear();

    mockKbStorage.loadWorkspace.mockResolvedValue({
      version: "2.0.0",
      config: {},
      bases: [
        {
          id: "kb-1",
          name: "Dev Notes",
          description: "Developer notes",
          entryCount: 2,
          updatedAt: 300,
          isIndexed: true,
          path: "bases/kb-1",
        },
        {
          id: "kb-2",
          name: "Life Notes",
          description: null,
          entryCount: 0,
          updatedAt: 200,
          isIndexed: false,
          path: "bases/kb-2",
        },
      ],
    });
    mockKbStorage.loadBaseMeta.mockImplementation(async (kbId: string) =>
      kbId === "kb-1" ? meta : null
    );
    mockKbStorage.loadEntry.mockImplementation(
      async (_kbId: string, entryId: string) => entries.get(entryId) || null
    );
    mockKbStorage.saveEntry.mockImplementation(
      async (_kbId: string, entry: Caiu) => {
        entries.set(entry.id, { ...entry });
      }
    );
  });

  it("searchEntries 应解析 kbNames、调用后端搜索并格式化 Agent 结果", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        kbId: "kb-1",
        kbName: "Dev Notes",
        score: 0.88,
        highlight: "ownership",
        caiu: {
          id: "entry-1",
          key: "Rust Notes",
          content: "Rust ownership notes",
          summary: "Rust summary",
          tags: [{ name: "rust" }, { name: "memory" }],
        },
      },
    ]);

    const result = await searchEntries({
      kbNames: ["Dev Notes"],
      query: "ownership",
      engineId: "keyword",
      limit: 3,
      tags: ["rust"],
      minScore: 0.2,
    });

    expect(mockInvoke).toHaveBeenCalledWith("kb_search", {
      query: "ownership",
      filters: {
        kbIds: ["kb-1"],
        tags: ["rust"],
        minScore: 0.2,
        limit: 3,
        engineId: "keyword",
        enabledOnly: true,
      },
      engineId: "keyword",
    });
    expect(result).toMatchObject({
      success: true,
      count: 1,
      results: [
        {
          index: 1,
          id: "entry-1",
          key: "Rust Notes",
          tags: ["rust", "memory"],
          score: 0.88,
          kbName: "Dev Notes",
        },
      ],
    });
  });

  it("upsertEntry 应创建新条目、保存内容并触发当前库状态同步", async () => {
    const result = await upsertEntry({
      kbName: "Dev Notes",
      key: "New Entry",
      content: "New markdown content",
      tags: ["new", "agent"],
      priority: 77,
      enabled: false,
    });

    expect(result).toMatchObject({
      success: true,
      kbId: "kb-1",
      isNew: true,
      vectorized: false,
      message: '成功创建条目 "New Entry"',
    });
    expect(mockKbStorage.saveEntry).toHaveBeenCalledWith(
      "kb-1",
      expect.objectContaining({
        key: "New Entry",
        content: "New markdown content",
        contentHash: "hash:20",
        tags: [
          { name: "new", weight: 1 },
          { name: "agent", weight: 1 },
        ],
        priority: 77,
        enabled: false,
      })
    );
    expect(mockStore.validateVectorStatus).toHaveBeenCalledTimes(1);
  });

  it("updateEntryContent 应支持精确替换预览且 dryRun 不保存", async () => {
    const result = await updateEntryContent({
      kbId: "kb-1",
      key: "Rust",
      targetContent: "ownership notes with enough original text",
      replaceWith: "borrow checker notes with new precise text",
      dryRun: true,
    });

    expect(result).toMatchObject({
      success: true,
      mode: "exact",
      matchedCount: 1,
      replacedCount: 0,
      entries: [
        {
          id: "entry-1",
          key: "Rust Notes",
          oldContent: "ownership notes with enough original text",
          newContent: "borrow checker notes with new precise text",
          changes: ["精确内容替换"],
        },
      ],
    });
    expect(mockKbStorage.saveEntry).not.toHaveBeenCalled();
  });

  it("deleteEntry 应要求显式确认，确认后删除并清空当前选中条目", async () => {
    await expect(
      deleteEntry({ kbId: "kb-1", entryId: "entry-1" })
    ).resolves.toMatchObject({
      success: false,
      error: "请设置 confirm: true 以确认删除操作",
    });

    const result = await deleteEntry({
      kbId: "kb-1",
      entryId: "entry-1",
      confirm: true,
    });

    expect(result).toMatchObject({
      success: true,
      deletedId: "entry-1",
      deletedKey: "Rust Notes",
    });
    expect(mockKbStorage.deleteEntry).toHaveBeenCalledWith("kb-1", "entry-1");
    expect(mockStore.activeEntryId).toBeNull();
  });

  it("batchUpdateMetadata 应批量调整启用状态和标签并限制单次数量", async () => {
    const result = await batchUpdateMetadata({
      kbId: "kb-1",
      entryIds: ["entry-1", "entry-2"],
      enabled: true,
      addTags: ["reviewed"],
      removeTags: ["memory"],
    });

    expect(result).toEqual({
      success: true,
      updatedCount: 2,
      message: "批量更新完成，成功更新 2 条条目",
    });
    expect(mockKbStorage.saveEntry).toHaveBeenCalledTimes(2);
    expect(entries.get("entry-1")).toMatchObject({
      enabled: true,
      tags: [
        { name: "rust", weight: 1 },
        { name: "reviewed", weight: 1 },
      ],
    });

    const tooMany = await batchUpdateMetadata({
      kbId: "kb-1",
      entryIds: Array.from({ length: 101 }, (_, index) => `e-${index}`),
    });
    expect(tooMany).toMatchObject({
      success: false,
      error: "单次批量更新数量不能超过 100 条",
    });
  });

  it("listEntriesMetadata 和 listKnowledgeBases 应支持过滤、分页和统计开关", async () => {
    const entriesResult = await listEntriesMetadata({
      kbName: "Dev Notes",
      tags: ["rust"],
      enabled: true,
      limit: 500,
      offset: 0,
      sortBy: "priority",
      sortOrder: "desc",
    });

    expect(entriesResult).toMatchObject({
      success: true,
      total: 1,
      count: 1,
      entries: [
        {
          id: "entry-1",
          key: "Rust Notes",
          tags: ["rust", "memory"],
          vectorStatus: "ready",
        },
      ],
    });

    const basesResult = await listKnowledgeBases({
      query: "dev",
      includeStats: true,
    });
    expect(basesResult).toMatchObject({
      success: true,
      total: 1,
      bases: [
        {
          id: "kb-1",
          name: "Dev Notes",
          stats: {
            totalEntries: 2,
            enabledEntries: 1,
            totalTokens: 54,
            vectorizedEntries: 1,
          },
        },
      ],
    });
  });

  it("registry 应拆分 basic/admin 实例并声明所有方法为 agentCallable", () => {
    const [basic, admin] = registryInstances;
    const basicMetadata = basic.getMetadata!();
    const adminMetadata = admin.getMetadata!();

    expect(basic.id).toBe("kb-basic");
    expect(admin.id).toBe("kb-admin");
    expect(basicMetadata.methods.map((method) => method.name)).toEqual([
      "searchEntries",
      "upsertEntry",
      "updateEntryContent",
    ]);
    expect(adminMetadata.methods.map((method) => method.name)).toEqual([
      "listKnowledgeBases",
      "listEntriesMetadata",
      "batchUpdateMetadata",
      "deleteEntry",
    ]);
    expect(
      [...basicMetadata.methods, ...adminMetadata.methods].every(
        (method) => method.agentCallable
      )
    ).toBe(true);
  });
});
