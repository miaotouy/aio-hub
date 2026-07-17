import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PipelineContext } from "../../../types/pipeline";
import { KnowledgeProcessor } from "../knowledge-processor";

const searchKnowledge = vi.hoisted(() => vi.fn());

vi.mock("@/tools/knowledge-base/service", () => ({ searchKnowledge }));

function createContext(
  overrides: Partial<PipelineContext> = {}
): PipelineContext {
  return {
    messages: [],
    agentConfig: {
      knowledgeConfig: { enabled: false, bindings: [] },
    },
    logs: [],
    sharedData: new Map(),
    index: {} as PipelineContext["index"],
    detail: {} as PipelineContext["detail"],
    settings: {} as PipelineContext["settings"],
    timestamp: 0,
    ...overrides,
  } as PipelineContext;
}

describe("KnowledgeProcessor", () => {
  beforeEach(() => {
    searchKnowledge.mockReset();
    searchKnowledge.mockResolvedValue([
      {
        sourceType: "knowledge",
        libraryId: "library-1",
        libraryName: "Docs",
        documentId: "document-1",
        sourcePath: "docs/guide.md",
        title: "Guide",
        chunkId: "chunk-1",
        chunkIndex: 2,
        heading: "Install",
        content: "Use Bun.",
        score: 0.8,
        signals: [{ signalType: "knowledge-bm25", score: 0.8 }],
      },
    ]);
  });

  it("uses only authorized library IDs and emits source metadata", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content: "【knowledge::library=library-1::strategy=keyword】",
        },
        { role: "user", content: "install", sourceType: "session_history" },
      ],
      agentConfig: {
        knowledgeConfig: {
          enabled: true,
          bindings: [
            {
              libraryId: "library-1",
              libraryName: "Docs",
              enabled: true,
            },
          ],
        },
      } as PipelineContext["agentConfig"],
    });

    await new KnowledgeProcessor().execute(context);

    expect(searchKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "install",
        libraryIds: ["library-1"],
        strategy: "keyword",
      })
    );
    expect(context.messages[0].content).toContain("docs/guide.md#3");
    expect(
      context.logs[context.logs.length - 1]?.details.sources[0]
    ).toMatchObject({
      sourceType: "knowledge",
      libraryId: "library-1",
      chunkIndex: 2,
    });
  });

  it("does not retrieve unauthorized IDs and reports positional syntax", async () => {
    const context = createContext({
      messages: [
        {
          role: "system",
          content: "【knowledge::old::4】 【knowledge::library=library-other】",
        },
      ],
      agentConfig: {
        knowledgeConfig: {
          enabled: true,
          bindings: [
            {
              libraryId: "library-1",
              libraryName: "Docs",
              enabled: true,
            },
          ],
        },
      } as PipelineContext["agentConfig"],
    });

    await new KnowledgeProcessor().execute(context);

    expect(searchKnowledge).not.toHaveBeenCalled();
    expect(context.logs.map((log) => log.message)).toEqual([
      "Knowledge 占位符参数必须使用 key=value",
      "Knowledge 占位符引用未授权资料库",
    ]);
  });
});
