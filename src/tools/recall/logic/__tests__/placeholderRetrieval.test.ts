import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecallEntryLookup } from "../../services/api";
import type { RecallRetrievalRequest } from "../../types/retrieval";
import { resolvePlaceholderRetrieval } from "../placeholderRetrieval";

const mocks = vi.hoisted(() => ({
  getEntries: vi.fn(),
  loadBaseMeta: vi.fn(),
  searchWithCache: vi.fn(),
}));

vi.mock("../../services/api", () => mocks);

function entry(
  id: string,
  recallId: string,
  enabled = true
): RecallEntryLookup {
  return {
    id,
    key: id,
    content: `content-${id}`,
    tags: [],
    assets: [],
    priority: 100,
    enabled,
    createdAt: 1,
    updatedAt: 1,
    recallId,
    recallName: recallId,
  };
}

function request(
  overrides: Partial<RecallRetrievalRequest> = {}
): RecallRetrievalRequest {
  return {
    mode: "static",
    modeParams: [],
    userText: "query",
    aiText: "",
    turnCount: 1,
    recentMessageTexts: [],
    settings: {},
    enabledBindings: [{ recallId: "allowed", recallName: "Allowed" }],
    ...overrides,
  };
}

describe("Recall static placeholder retrieval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("filters explicit entry IDs by enabled bindings and entry state", async () => {
    mocks.getEntries.mockResolvedValue([
      entry("allowed-entry", "allowed"),
      entry("secret-entry", "secret"),
      entry("disabled-entry", "allowed", false),
    ]);

    const response = await resolvePlaceholderRetrieval(
      request({
        modeParams: ["allowed-entry", "secret-entry", "disabled-entry"],
      })
    );

    expect(response.resultCount).toBe(1);
    expect(response.content).toContain("content-allowed-entry");
    expect(response.content).not.toContain("content-secret-entry");
    expect(response.content).not.toContain("content-disabled-entry");
  });

  it("loads static all only from the selected authorized collection", async () => {
    mocks.loadBaseMeta.mockResolvedValue({
      entries: [
        { id: "allowed-entry", enabled: true },
        { id: "disabled-entry", enabled: false },
      ],
    });
    mocks.getEntries.mockResolvedValue([
      entry("allowed-entry", "allowed"),
      entry("secret-entry", "secret"),
    ]);

    const response = await resolvePlaceholderRetrieval(
      request({ recallId: "allowed", modeParams: ["all"] })
    );

    expect(mocks.loadBaseMeta).toHaveBeenCalledTimes(1);
    expect(mocks.loadBaseMeta).toHaveBeenCalledWith("allowed");
    expect(mocks.getEntries).toHaveBeenCalledWith(["allowed-entry"]);
    expect(response.resultCount).toBe(1);
    expect(response.content).not.toContain("content-secret-entry");
  });

  it("passes the resolved preset to the pipeline-backed search", async () => {
    mocks.searchWithCache.mockResolvedValue({ results: [], vector: null });

    await resolvePlaceholderRetrieval(
      request({
        mode: "always",
        presetId: "algorithmic",
        settings: { defaultPresetId: "comprehensive" },
      })
    );

    expect(mocks.searchWithCache).toHaveBeenCalledWith(
      expect.objectContaining({ presetId: "algorithmic" })
    );
  });
});
