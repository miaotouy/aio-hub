import { describe, it, expect, beforeEach, vi } from "vitest";
import GitAnalyzerRegistry from "../git-analyzer.registry";
import type { GitCommit } from "../types";

const {
  mockAnalyzeRepository,
  mockGetAuthorCommits,
  mockGetCommitDetail,
  mockGetBranchList,
} = vi.hoisted(() => ({
  mockAnalyzeRepository: vi.fn(),
  mockGetAuthorCommits: vi.fn(),
  mockGetCommitDetail: vi.fn(),
  mockGetBranchList: vi.fn(),
}));

vi.mock("../actions", () => ({
  analyzeRepository: mockAnalyzeRepository,
  getAuthorCommits: mockGetAuthorCommits,
  getCommitDetail: mockGetCommitDetail,
  getBranchList: mockGetBranchList,
}));

const commit: GitCommit = {
  hash: "abc123456789",
  author: "Alice",
  email: "alice@example.com",
  date: "2026-06-28T09:00:00+08:00",
  message: "feat: add registry tests",
  full_message: "feat: add registry tests\n\nCover agent facade paths.",
  tags: ["v1.0.0"],
  branches: ["main"],
  stats: {
    additions: 12,
    deletions: 3,
    files: 2,
  },
  files: [
    {
      path: "src/tools/git-analyzer/git-analyzer.registry.ts",
      status: "modified",
      additions: 12,
      deletions: 3,
    },
  ],
};

describe("git-analyzer registry", () => {
  beforeEach(() => {
    mockAnalyzeRepository.mockReset();
    mockGetAuthorCommits.mockReset();
    mockGetCommitDetail.mockReset();
    mockGetBranchList.mockReset();
  });

  it("getFormattedAnalysis 应适配 Agent 参数并拼装分析报告", async () => {
    mockAnalyzeRepository.mockResolvedValue({
      summary: "done",
      details: {
        path: "C:/repo",
        branch: "main",
        statistics: {
          totalCommits: 2,
          contributors: 1,
          timeSpan: 1,
          averagePerDay: 2,
        },
        topContributors: [{ name: "Alice", count: 2 }],
        recentCommits: [commit],
      },
    });

    const registry = new GitAnalyzerRegistry();
    const output = await registry.getFormattedAnalysis({
      path: "C:/repo",
      branch: "main",
      limit: "25",
      dateFormat: "iso",
      includeStatistics: "false",
      includeTimeline: "true",
      includeEmail: "true",
      includeFullMessage: "true",
      includeFiles: "true",
      includeStats: "true",
    });

    expect(mockAnalyzeRepository).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "C:/repo",
        branch: "main",
        limit: 25,
        includeStatistics: false,
        includeTimeline: true,
        includeEmail: true,
        includeFullMessage: true,
        includeFiles: true,
        includeStats: true,
      })
    );
    expect(output).toContain("# Git 仓库分析摘要");
    expect(output).toContain("统计概览");
    expect(output).toContain("| Alice | 2 | 100.0% |");
    expect(output).toContain("Alice <alice@example.com>");
    expect(output).toContain("Cover agent facade paths.");
    expect(output).toContain(
      "`src/tools/git-analyzer/git-analyzer.registry.ts`"
    );
    expect(output).toContain("+12 -3");
  });

  it("getAuthorCommits 应按作者参数查询并格式化列表", async () => {
    mockGetAuthorCommits.mockResolvedValue([commit]);

    const registry = new GitAnalyzerRegistry();
    const output = await registry.getAuthorCommits({
      path: "C:/repo",
      author: "ali",
      branch: "main",
      limit: "5",
      includeEmail: "true",
      includeFiles: "false",
    });

    expect(mockGetAuthorCommits).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "C:/repo",
        author: "ali",
        branch: "main",
        limit: 5,
        includeEmail: true,
        includeFiles: false,
      })
    );
    expect(output).toContain("共 1 条记录");
    expect(output).toContain("abc1234");
    expect(output).toContain("Alice <alice@example.com>");
    expect(output).not.toContain("**文件变更**");
  });

  it("getCommitDetail 和 getBranchList 应格式化单提交与分支列表", async () => {
    mockGetCommitDetail.mockResolvedValue(commit);
    mockGetBranchList.mockResolvedValue(["main", "feature/testing"]);

    const registry = new GitAnalyzerRegistry();

    await expect(
      registry.getCommitDetail({ path: "C:/repo", hash: "abc1234" })
    ).resolves.toContain("### abc1234");
    await expect(registry.getBranchList({ path: "C:/repo" })).resolves.toBe(
      "## 分支列表\n\n- main\n- feature/testing"
    );
    expect(mockGetCommitDetail).toHaveBeenCalledWith({
      path: "C:/repo",
      hash: "abc1234",
    });
    expect(mockGetBranchList).toHaveBeenCalledWith("C:/repo");
  });

  it("底层动作抛错时应返回 Agent 友好的错误文本", async () => {
    mockAnalyzeRepository.mockRejectedValue(new Error("not a git repository"));
    mockGetAuthorCommits.mockRejectedValue(new Error("author failed"));
    mockGetCommitDetail.mockRejectedValue(new Error("missing commit"));
    mockGetBranchList.mockRejectedValue(new Error("branch failed"));

    const registry = new GitAnalyzerRegistry();

    await expect(
      registry.getFormattedAnalysis({ path: "C:/repo" })
    ).resolves.toBe("❌ 仓库分析失败: not a git repository");
    await expect(
      registry.getAuthorCommits({ path: "C:/repo", author: "Alice" })
    ).resolves.toBe("❌ 获取作者提交记录失败: author failed");
    await expect(
      registry.getCommitDetail({ path: "C:/repo", hash: "missing" })
    ).resolves.toBe("❌ 获取提交详情失败: missing commit");
    await expect(registry.getBranchList({ path: "C:/repo" })).resolves.toBe(
      "❌ 获取分支列表失败: branch failed"
    );
  });

  it("getMetadata 应声明所有 registry 方法均可被 Agent 调用", () => {
    const registry = new GitAnalyzerRegistry();
    const metadata = registry.getMetadata();

    expect(metadata.methods.map((method) => method.name)).toEqual([
      "getFormattedAnalysis",
      "getAuthorCommits",
      "getCommitDetail",
      "getBranchList",
    ]);
    expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
  });
});
