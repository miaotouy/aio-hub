import { describe, expect, it, vi } from "vitest";
import {
  parseKnowledgeResearchRequest,
  runKnowledgeResearch,
} from "../research";
import { KnowledgeAccessError } from "../access";

const authorizeKnowledgeLibraryScope = vi.hoisted(() => vi.fn());
const searchKnowledgeForAgent = vi.hoisted(() => vi.fn());
const readKnowledgeForAgent = vi.hoisted(() => vi.fn());

vi.mock("../application", () => ({
  authorizeKnowledgeLibraryScope,
  searchKnowledgeForAgent,
  readKnowledgeForAgent,
}));

describe("knowledge research", () => {
  it("parses and bounds research budgets", () => {
    expect(
      parseKnowledgeResearchRequest({ question: "查找安装说明" })
    ).toMatchObject({
      question: "查找安装说明",
      maxRounds: 3,
      maxToolCalls: 12,
      evidenceBudget: 24000,
      output: "report",
    });
    expect(() =>
      parseKnowledgeResearchRequest({ question: "x", maxRounds: 99 })
    ).toThrow("maxRounds 必须在 1 到 8 之间");
  });

  it("keeps citations and reports progress while reusing search/read", async () => {
    authorizeKnowledgeLibraryScope.mockResolvedValue(["library-a"]);
    searchKnowledgeForAgent.mockResolvedValue({
      query: "查找安装说明",
      requestedStrategy: "auto",
      traces: [],
      hits: [
        {
          libraryId: "library-a",
          documentId: "doc-a",
          chunkId: "chunk-a",
          chunkIndex: 0,
          title: "安装说明",
          sourcePath: "C:/docs/install.md",
          snippet: "先安装运行环境，再执行启动命令。",
          score: 1,
          rankScore: 1,
          signals: [],
        },
      ],
      totalCandidates: 1,
      truncated: false,
    });
    readKnowledgeForAgent.mockResolvedValue({
      libraryId: "library-a",
      documentId: "doc-a",
      sourcePath: "C:/docs/install.md",
      title: "安装说明",
      chunks: [
        {
          libraryId: "library-a",
          documentId: "doc-a",
          chunkId: "chunk-a",
          chunkIndex: 0,
          title: "安装说明",
          sourcePath: "C:/docs/install.md",
          startOffset: 0,
          endOffset: 20,
          content: "先安装运行环境，再执行启动命令。",
        },
      ],
      truncated: false,
    });
    const progress = vi.fn();
    const result = await runKnowledgeResearch(
      { agentId: "agent-a", access: {} as never },
      {
        question: "查找安装说明",
        maxRounds: 1,
        maxToolCalls: 4,
        evidenceBudget: 2000,
      },
      { onProgress: progress }
    );
    expect(result.citations).toHaveLength(1);
    expect(result.citations[0].sourcePath).toBe("C:/docs/install.md");
    expect(result.terminationReason).toBe("completed");
    expect(searchKnowledgeForAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ libraryIds: ["library-a"], strategy: "auto" })
    );
    expect(readKnowledgeForAgent).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        chunkId: "chunk-a",
        maxChars: expect.any(Number),
      })
    );
    expect(progress).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "done" })
    );
  });

  it("stops on cancellation without discarding collected evidence", async () => {
    authorizeKnowledgeLibraryScope.mockResolvedValue(["library-a"]);
    searchKnowledgeForAgent.mockImplementation(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                hits: [],
                traces: [],
                requestedStrategy: "auto",
                query: "q",
                totalCandidates: 0,
                truncated: false,
              }),
            20
          )
        )
    );
    const controller = new AbortController();
    const promise = runKnowledgeResearch(
      { agentId: "agent-a", access: {} as never },
      { question: "需要取消的研究", maxRounds: 1 },
      { signal: controller.signal }
    );
    controller.abort();
    await expect(promise).resolves.toMatchObject({
      terminationReason: "cancelled",
      citations: [],
    });
  });

  it("retains evidence and failure stage after a later search fails", async () => {
    authorizeKnowledgeLibraryScope.mockResolvedValue(["library-a"]);
    searchKnowledgeForAgent
      .mockResolvedValueOnce({
        query: "先查事实；再查冲突",
        requestedStrategy: "auto",
        traces: [],
        hits: [
          {
            libraryId: "library-a",
            documentId: "doc-a",
            chunkId: "chunk-a",
            chunkIndex: 0,
            title: "事实",
            sourcePath: "C:/facts.md",
            snippet: "已收集的事实证据",
            score: 1,
            rankScore: 1,
            signals: [],
          },
        ],
        totalCandidates: 1,
        truncated: false,
      })
      .mockRejectedValueOnce(new Error("第二轮检索失败"));
    readKnowledgeForAgent.mockResolvedValue({
      libraryId: "library-a",
      documentId: "doc-a",
      sourcePath: "C:/facts.md",
      title: "事实",
      chunks: [],
      truncated: false,
    });
    const result = await runKnowledgeResearch(
      { agentId: "agent-a", access: {} as never },
      {
        question: "先查事实；再查冲突",
        maxRounds: 2,
        maxToolCalls: 6,
        evidenceBudget: 2000,
      }
    );
    expect(result.terminationReason).toBe("failed");
    expect(result.failureStage).toBe("search");
    expect(result.citations).toHaveLength(1);
    expect(result.gaps).toContain("search 阶段失败：第二轮检索失败");
  });

  it("enforces a deadline around a pending tool call", async () => {
    authorizeKnowledgeLibraryScope.mockResolvedValue(["library-a"]);
    searchKnowledgeForAgent.mockReturnValue(new Promise(() => undefined));
    const result = await runKnowledgeResearch(
      { agentId: "agent-a", access: {} as never },
      { question: "超时研究", maxRounds: 1, timeoutMs: 5 }
    );
    expect(result.terminationReason).toBe("timeout");
    expect(result.citations).toEqual([]);
  });

  it("does not turn permission failures into a research result", async () => {
    authorizeKnowledgeLibraryScope.mockRejectedValueOnce(
      new KnowledgeAccessError("LIBRARY_UNAUTHORIZED", "没有资料库权限")
    );
    await expect(
      runKnowledgeResearch(
        { agentId: "agent-a", access: {} as never },
        { question: "越权研究" }
      )
    ).rejects.toMatchObject({ code: "LIBRARY_UNAUTHORIZED" });
  });

  it("flags explicit positive and negative evidence as a potential conflict", async () => {
    authorizeKnowledgeLibraryScope.mockResolvedValue(["library-a"]);
    searchKnowledgeForAgent.mockResolvedValue({
      query: "离线运行",
      requestedStrategy: "auto",
      traces: [],
      hits: [
        {
          libraryId: "library-a",
          documentId: "doc-a",
          chunkId: "p",
          chunkIndex: 0,
          title: "运行限制",
          sourcePath: "C:/a.md",
          snippet: "支持离线运行",
          score: 1,
          rankScore: 1,
          signals: [],
        },
        {
          libraryId: "library-a",
          documentId: "doc-a",
          chunkId: "n",
          chunkIndex: 1,
          title: "运行限制",
          sourcePath: "C:/a.md",
          snippet: "不支持离线运行",
          score: 0.9,
          rankScore: 0.9,
          signals: [],
        },
      ],
      totalCandidates: 2,
      truncated: false,
    });
    readKnowledgeForAgent.mockResolvedValue({
      libraryId: "library-a",
      documentId: "doc-a",
      sourcePath: "C:/a.md",
      title: "运行限制",
      chunks: [],
      truncated: false,
    });
    const result = await runKnowledgeResearch(
      { agentId: "agent-a", access: {} as never },
      {
        question: "离线运行",
        maxRounds: 1,
        maxToolCalls: 6,
        evidenceBudget: 2000,
      }
    );
    expect(result.conflicts).toContain("《运行限制》存在互相否定的证据片段");
  });
});
