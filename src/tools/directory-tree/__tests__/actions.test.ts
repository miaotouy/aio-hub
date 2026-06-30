import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import DirectoryTreeRegistry from "../directory-tree.registry";
import {
  calculateMaxDepth,
  collectIncludedNodes,
  findAllNodesAndPaths,
  findNodeAndPath,
  formatSize,
  generateTree,
  matchNamePattern,
  renderTree,
} from "../actions";
import type { TreeNode } from "../config";

const { mockHandleError } = vi.hoisted(() => ({
  mockHandleError: vi.fn(),
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
    handle: mockHandleError,
    wrapAsync: async <T>(fn: () => Promise<T>) => {
      try {
        return await fn();
      } catch {
        return null;
      }
    },
  }),
}));

const mockInvoke = vi.mocked(invoke);

const tree: TreeNode = {
  name: "repo",
  is_dir: true,
  size: 4096,
  children: [
    {
      name: "src",
      is_dir: true,
      size: 2048,
      children: [
        {
          name: "main.ts",
          is_dir: false,
          size: 1536,
          children: [],
        },
        {
          name: "Button.vue",
          is_dir: false,
          size: 512,
          children: [],
        },
      ],
    },
    {
      name: "docs",
      is_dir: true,
      size: 1024,
      children: [
        {
          name: "README.md",
          is_dir: false,
          size: 300,
          children: [],
        },
      ],
    },
    {
      name: "debug.log",
      is_dir: false,
      size: 2048,
      children: [],
    },
  ],
};

describe("directory-tree actions", () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    mockHandleError.mockReset();
  });

  describe("pattern and tree helpers", () => {
    it("matchNamePattern 应支持子串匹配、glob 和非法 glob 容错", () => {
      expect(matchNamePattern("Button.vue", "button")).toBe(true);
      expect(matchNamePattern("Button.vue", "*.vue")).toBe(true);
      expect(matchNamePattern("Button.vue", "*.ts")).toBe(false);
      expect(matchNamePattern("Button.vue", "[")).toBe(false);
    });

    it("collectIncludedNodes 应保留匹配节点及其祖先", () => {
      const included = collectIncludedNodes(tree, ["*.vue"]);
      const names = [...included].map((node) => node.name);

      expect(names).toEqual(
        expect.arrayContaining(["repo", "src", "Button.vue"])
      );
      expect(names).not.toContain("README.md");
    });

    it("目录命中 includePattern 时应包含其后代", () => {
      const included = collectIncludedNodes(tree, ["docs"]);
      const names = [...included].map((node) => node.name);

      expect(names).toEqual(
        expect.arrayContaining(["repo", "docs", "README.md"])
      );
    });

    it("findNodeAndPath 应支持精确路径、片段路径和根路径", () => {
      expect(findNodeAndPath(tree, ".")?.path).toEqual(["repo"]);
      expect(findNodeAndPath(tree, "repo/src/main.ts")?.node.name).toBe(
        "main.ts"
      );
      expect(findNodeAndPath(tree, "src/Button.vue")?.path).toEqual([
        "repo",
        "src",
        "Button.vue",
      ]);
      expect(findNodeAndPath(tree, "missing")).toBeNull();
    });

    it("findAllNodesAndPaths 应返回所有匹配路径且去重", () => {
      const results = findAllNodesAndPaths(tree, "src/main.ts");

      expect(results).toHaveLength(1);
      expect(results[0].path).toEqual(["repo", "src", "main.ts"]);
    });

    it("formatSize 和 calculateMaxDepth 应返回稳定结果", () => {
      expect(formatSize(512)).toBe("512 B");
      expect(formatSize(1536)).toBe("1.50 KB");
      expect(calculateMaxDepth(tree)).toBe(2);
    });
  });

  describe("renderTree", () => {
    it("应渲染目录树、大小和目录统计", () => {
      const output = renderTree(tree, {
        showFiles: true,
        showSize: true,
        showDirSize: true,
        showDirItemCount: true,
      });

      expect(output).toContain("repo (4.00 KB) [1 file, 2 dirs]");
      expect(output).toContain("├── src/ (2.00 KB) [2 files]");
      expect(output).toContain("│   ├── main.ts (1.50 KB)");
      expect(output).toContain("└── debug.log (2.00 KB)");
    });

    it("应隐藏文件并按最大深度截断", () => {
      const output = renderTree(tree, {
        showFiles: false,
        maxDepth: 1,
      });

      expect(output).toContain("repo");
      expect(output).toContain("├── src/");
      expect(output).toContain("└── docs/");
      expect(output).not.toContain("main.ts");
      expect(output).not.toContain("README.md");
    });

    it("应支持包含路径、包含模式和排除模式", () => {
      const byPath = renderTree(tree, {
        includePathChains: [["repo", "src"]],
      });
      expect(byPath).toContain("repo");
      expect(byPath).toContain("src/");
      expect(byPath).not.toContain("docs/");

      const includedNodes = collectIncludedNodes(tree, ["*.md"]);
      const byPattern = renderTree(tree, {
        includedNodes,
      });
      expect(byPattern).toContain("README.md");
      expect(byPattern).not.toContain("main.ts");

      const excluded = renderTree(tree, {
        excludePattern: ".log",
      });
      expect(excluded).not.toContain("debug.log");
    });

    it("传入生成参数和统计信息时应包含元数据头", () => {
      const output = renderTree(
        tree,
        { showFiles: true },
        {
          path: "C:/repo",
          showFiles: true,
          showHidden: false,
          maxDepth: 2,
          filterMode: "custom",
          customPattern: "*.log",
          includeMetadata: true,
        },
        {
          total_dirs: 3,
          total_files: 4,
          show_files: true,
          show_hidden: false,
          max_depth: "2",
          filter_count: 1,
          generated_at: "2026-06-28 00:00:00",
        }
      );

      expect(output).toContain("# 目录树生成信息");
      expect(output).toContain("- 过滤规则数: 1");
      expect(output).toContain("- 目标路径: C:/repo");
      expect(output).toContain("## 目录结构");
    });
  });

  describe("generateTree / registry", () => {
    it("generateTree 应把过滤规则传给 Rust command 并补生成时间", async () => {
      mockInvoke.mockResolvedValue({
        structure: tree,
        stats: {
          total_dirs: 3,
          total_files: 4,
          show_files: true,
          show_hidden: false,
          max_depth: "5",
          filter_count: 2,
          generated_at: "",
        },
      });

      const result = await generateTree({
        path: "C:/repo",
        showFiles: true,
        showHidden: false,
        maxDepth: 5,
        filterMode: "both",
        customPattern: "\n# comment\n*.log\ndist\n",
      });

      expect(mockInvoke).toHaveBeenCalledWith("generate_directory_tree", {
        path: "C:/repo",
        showFiles: true,
        showHidden: false,
        maxDepth: 5,
        ignorePatterns: ["__USE_GITIGNORE__", "*.log", "dist"],
      });
      expect(result.structure).toBe(tree);
      expect(result.stats.generated_at).toMatch(
        /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
      );
    });

    it("generateTree 失败时应记录错误并继续抛出", async () => {
      const error = new Error("backend failed");
      mockInvoke.mockRejectedValue(error);

      await expect(
        generateTree({
          path: "C:/repo",
          showFiles: true,
          showHidden: false,
          maxDepth: 5,
          filterMode: "gitignore",
        })
      ).rejects.toThrow("backend failed");
      expect(mockHandleError).toHaveBeenCalledWith(error, expect.any(Object));
    });

    it("registry 应适配扁平化 Agent 参数并渲染结果", async () => {
      mockInvoke.mockResolvedValue({
        structure: tree,
        stats: {
          total_dirs: 3,
          total_files: 4,
          show_files: true,
          show_hidden: true,
          max_depth: "2",
          filter_count: 1,
          generated_at: "",
        },
      });

      const registry = new DirectoryTreeRegistry();
      const metadata = registry.getMetadata();
      const result = await registry.generateTree({
        path: "C:/repo",
        showFiles: "false",
        showHidden: "true",
        showSize: "true",
        showDirSize: "true",
        maxDepth: "2",
        filterMode: "custom",
        customPattern: "*.log",
        includeMetadata: "true",
      });

      expect(metadata.methods[0].name).toBe("generateTree");
      expect(metadata.methods[0].agentCallable).toBe(true);
      expect(mockInvoke).toHaveBeenCalledWith(
        "generate_directory_tree",
        expect.objectContaining({
          showFiles: false,
          showHidden: true,
          maxDepth: 2,
          ignorePatterns: ["*.log"],
        })
      );
      expect(result).toContain("# 目录树生成信息");
      expect(result).toContain("repo (4.00 KB)");
      expect(result).toContain("src/ (2.00 KB)");
      expect(result).not.toContain("main.ts");
    });
  });
});
