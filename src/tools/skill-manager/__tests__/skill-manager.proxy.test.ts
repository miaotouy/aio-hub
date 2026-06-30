import { describe, it, expect, beforeEach, vi } from "vitest";
import { SkillManagerProxy } from "../services/SkillManagerProxy";
import type { SkillManifest } from "../types";

const {
  mockStore,
  mockReadResource,
  mockListDirectory,
  mockRunScript,
  mockGetEnvVarsForExecution,
} = vi.hoisted(() => {
  const manifest: SkillManifest = {
    name: "demo-skill",
    description: "Demo skill for tests",
    instructions: "Use this skill carefully.",
    basePath: "C:/skills/demo-skill",
    source: "user",
    license: "MIT",
    scripts: [
      {
        name: "hello",
        relativePath: "scripts/hello.js",
        language: "javascript",
        description: "Say hello",
        size: 512,
      },
    ],
    files: [
      {
        name: "guide.md",
        relativePath: "references/guide.md",
        size: 2048,
        mimeType: "text/markdown",
      },
    ],
  };

  return {
    mockStore: {
      config: {
        runtimeSettings: {
          javascript: { command: "C:/tools/bun.exe" },
          python: { command: "python.exe" },
          shell: { command: "bash" },
          powershell: { command: "powershell.exe" },
        },
        terminalPreferences: {
          defaultShell: "powershell",
          commandChainStyle: "semicolon",
        },
      },
      manifests: [manifest],
      enabledManifests: [manifest],
      getSkillEnvVars: vi.fn(() => ({ FROM_CONFIG: "1" })),
    },
    mockReadResource: vi.fn(),
    mockListDirectory: vi.fn(),
    mockRunScript: vi.fn(),
    mockGetEnvVarsForExecution: vi.fn(),
  };
});

vi.mock("@tauri-apps/plugin-os", () => ({
  type: vi.fn(() => "windows"),
  platform: vi.fn(() => "windows"),
  arch: vi.fn(() => "x86_64"),
  version: vi.fn(() => "10.0.0"),
}));

vi.mock("../stores/skillManagerStore", () => ({
  useSkillManagerStore: () => mockStore,
}));

vi.mock("../services/SkillService", () => ({
  SkillService: {
    readResource: mockReadResource,
    listDirectory: mockListDirectory,
    runScript: mockRunScript,
  },
}));

vi.mock("../services/envFileManager", () => ({
  getEnvVarsForExecution: mockGetEnvVarsForExecution,
}));

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

describe("skill-manager proxy", () => {
  beforeEach(() => {
    mockReadResource.mockReset();
    mockListDirectory.mockReset();
    mockRunScript.mockReset();
    mockGetEnvVarsForExecution.mockReset();
    mockStore.getSkillEnvVars.mockClear();
    mockGetEnvVarsForExecution.mockResolvedValue({ FROM_ENV: "2" });
  });

  it("getMetadata 应暴露通用工具并动态挂载 activate_<skill> 方法", async () => {
    const proxy = new SkillManagerProxy();
    const metadata = proxy.getMetadata();

    expect(metadata.methods.map((method) => method.name)).toEqual([
      "skill_run_script",
      "skill_read_file",
      "skill_list_dir",
      "activate_demo-skill",
    ]);
    expect(metadata.methods.every((method) => method.agentCallable)).toBe(true);
    expect(typeof (proxy as any)["activate_demo-skill"]).toBe("function");

    const instructions = await (proxy as any)["activate_demo-skill"]();
    expect(instructions).toContain('<skill_context id="skill:demo-skill">');
    expect(instructions).toContain("Use this skill carefully.");
    expect(instructions).toContain("`references/guide.md` (2.0 KB)");
    expect(instructions).toContain("`hello`: Say hello");
    expect(instructions).toContain("操作系统: windows 10.0.0 (windows)");
    expect(instructions).toContain(
      "可用运行时: bun.exe, python.exe, bash, powershell.exe"
    );
  });

  it("skill_run_script 应合并环境变量并格式化成功、失败和 null 结果", async () => {
    mockRunScript.mockResolvedValueOnce({
      success: true,
      stdout: "hello\n",
      stderr: "",
      exitCode: 0,
      durationMs: 12,
    });
    const proxy = new SkillManagerProxy();

    await expect(
      proxy.skill_run_script({
        skill_id: "demo-skill",
        script_name: "hello",
        args: "--name Codex",
      })
    ).resolves.toBe("hello\n");
    expect(mockStore.getSkillEnvVars).toHaveBeenCalledWith("demo-skill");
    expect(mockGetEnvVarsForExecution).toHaveBeenCalledWith("demo-skill", {
      FROM_CONFIG: "1",
    });
    expect(mockRunScript).toHaveBeenCalledWith(
      "demo-skill",
      "hello",
      "--name Codex",
      mockStore.config.runtimeSettings,
      { FROM_ENV: "2" }
    );

    mockRunScript.mockResolvedValueOnce({
      success: false,
      stdout: "",
      stderr: "boom",
      exitCode: 2,
      durationMs: 8,
    });
    await expect(
      proxy.skill_run_script({
        skill_id: "demo-skill",
        script_name: "hello",
      })
    ).resolves.toBe("脚本执行失败（exit code: 2）\nstderr: boom");

    mockRunScript.mockResolvedValueOnce(null);
    await expect(
      proxy.skill_run_script({
        skill_id: "demo-skill",
        script_name: "hello",
      })
    ).resolves.toBe("脚本执行出错，请查看日志。");
  });

  it("skill_read_file 和 skill_list_dir 应返回资源内容并处理空结果", async () => {
    const proxy = new SkillManagerProxy();
    mockReadResource.mockResolvedValueOnce("# Guide");
    mockReadResource.mockResolvedValueOnce("");
    mockListDirectory.mockResolvedValueOnce([
      "SKILL.md",
      "references/guide.md",
    ]);
    mockListDirectory.mockResolvedValueOnce([]);

    await expect(
      proxy.skill_read_file({
        skill_id: "demo-skill",
        path: "references/guide.md",
      })
    ).resolves.toBe("# Guide");
    await expect(
      proxy.skill_read_file({
        skill_id: "demo-skill",
        path: "missing.md",
      })
    ).resolves.toBe("读取文件失败或文件为空。");
    await expect(
      proxy.skill_list_dir({
        skill_id: "demo-skill",
        sub_dir: "references",
      })
    ).resolves.toBe("- SKILL.md\n- references/guide.md");
    await expect(
      proxy.skill_list_dir({
        skill_id: "demo-skill",
      })
    ).resolves.toBe("目录为空");
  });

  it("激活不存在的 skill 时应返回缺失清单提示", async () => {
    const proxy = new SkillManagerProxy() as any;

    const result = await proxy["buildSkillInstruction"]("missing-skill");

    expect(result).toBe('未找到技能 "missing-skill" 的清单。');
  });
});
