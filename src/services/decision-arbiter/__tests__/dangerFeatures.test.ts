import { describe, expect, it } from "vitest";
import { detectDangerFeatures } from "../dangerFeatures";
import type { ParsedToolRequest } from "@/tools/tool-calling/types";

function req(
  args: Record<string, unknown>,
  extra: Partial<ParsedToolRequest> = {}
): ParsedToolRequest {
  return {
    requestId: "r1",
    toolId: "test",
    methodName: "run",
    toolName: "测试",
    rawBlock: "",
    args: args as Record<string, string>,
    ...extra,
  };
}

describe("detectDangerFeatures（红线 6）", () => {
  it("普通读写不命中", () => {
    const report = detectDangerFeatures(
      req({ path: "E:/project/src/main.ts", content: "const a = 1;" })
    );
    expect(report.features).toEqual([]);
  });

  it("权限提升关键词命中（sudo）", () => {
    const report = detectDangerFeatures(
      req({ command: "sudo apt install htop" })
    );
    expect(report.features).toContain("privilege-escalation");
  });

  it("递归删除命中", () => {
    expect(
      detectDangerFeatures(req({ command: "rm -rf ./build" })).features
    ).toContain("destructive-command");
    expect(
      detectDangerFeatures(
        req({ command: "Remove-Item -Recurse -Force ./data" })
      ).features
    ).toContain("destructive-command");
  });

  it("系统目录绝对路径命中", () => {
    const report = detectDangerFeatures(
      req({ path: "C:\\Windows\\System32\\config\\sam" })
    );
    expect(report.features).toContain("system-scope-path");
  });

  it("关闭防火墙（对外暴露）命中", () => {
    const report = detectDangerFeatures(
      req({ command: "netsh advfirewall set allprofiles state off" })
    );
    expect(report.features).toContain("network-exposure");
  });

  it("危险内嵌脚本（引号正文含危险调用）命中", () => {
    const report = detectDangerFeatures(
      req({
        command: `node -e "require('child_process').execSync('rm -rf /tmp/x')"`,
      })
    );
    expect(report.features).toContain("dangerous-inline-script");
  });

  it("普通脚本参数不误报（无入口特征或无危险调用）", () => {
    expect(
      detectDangerFeatures(req({ command: "node build.js --watch" })).features
    ).toEqual([]);
    expect(
      detectDangerFeatures(
        req({ command: `node -e "console.log('hello')"` })
      ).features
    ).toEqual([]);
  });

  it("git reset --hard 命中破坏性特征", () => {
    const report = detectDangerFeatures(
      req({ command: "git reset --hard HEAD~1" })
    );
    expect(report.features).toContain("destructive-command");
  });
});
