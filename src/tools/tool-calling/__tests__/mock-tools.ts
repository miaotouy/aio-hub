/**
 * Mock 工具集 — 用于 tool-calling 核心逻辑的单元测试
 *
 * 提供同步、异步、超时、安全策略等典型场景的模拟工具方法，
 * 不依赖任何 Tauri API 或 Pinia Store。
 */

import type {
  ToolRegistry,
  ServiceMetadata,
  ToolContext,
} from "@/services/types";

/**
 * 基础同步测试工具
 */
export class MockSyncTool implements ToolRegistry {
  readonly id = "mock-sync";
  readonly name = "Mock 同步工具";
  readonly description = "用于测试同步方法调用的 Mock 工具";

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "echo",
          displayName: "回显",
          description: "原样返回传入的参数",
          parameters: [
            {
              name: "message",
              type: "string",
              description: "要回显的消息",
              required: true,
            },
            {
              name: "prefix",
              type: "string",
              description: "前缀",
              required: false,
              defaultValue: "",
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "add",
          displayName: "加法",
          description: "返回两个数字的和",
          parameters: [
            {
              name: "a",
              type: "number",
              description: "第一个数",
              required: true,
            },
            {
              name: "b",
              type: "number",
              description: "第二个数",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "toggleFlag",
          displayName: "切换标志",
          description: "将字符串 true/false 转为布尔值并返回",
          parameters: [
            {
              name: "flag",
              type: "boolean",
              description: "标志",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "notCallable",
          displayName: "不可调用方法",
          description: "此方法未标记 agentCallable，不应被 Agent 调用",
          parameters: [],
          returnType: "Promise<string>",
          agentCallable: false,
        },
      ],
    };
  }

  async echo(args: { message: string; prefix?: string }): Promise<string> {
    const prefix = args.prefix || "";
    return `${prefix}${args.message}`;
  }

  async add(args: { a: number; b: number }): Promise<string> {
    return String(Number(args.a) + Number(args.b));
  }

  async toggleFlag(args: { flag: boolean }): Promise<string> {
    return String(args.flag);
  }

  async notCallable(): Promise<string> {
    return "should not be called";
  }
}

/**
 * 超时测试工具
 */
export class MockTimeoutTool implements ToolRegistry {
  readonly id = "mock-timeout";
  readonly name = "Mock 超时工具";
  readonly description = "用于测试超时熔断的 Mock 工具";

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "longRunning",
          displayName: "长时间运行",
          description: "模拟一个耗时很长的操作，用于测试超时",
          parameters: [
            {
              name: "delayMs",
              type: "number",
              description: "延迟毫秒数",
              required: false,
              defaultValue: 5000,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  async longRunning(args: { delayMs?: number }): Promise<string> {
    const delay = Number(args.delayMs) || 5000;
    await new Promise((resolve) => setTimeout(resolve, delay));
    return "done";
  }
}

/**
 * 安全策略测试工具
 */
export class MockSecurityTool implements ToolRegistry {
  readonly id = "mock-security";
  readonly name = "Mock 安全工具";
  readonly description = "用于测试安全策略（死区拦截、强制审批）的 Mock 工具";

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "safeRead",
          displayName: "安全读取",
          description: "正常读取操作",
          parameters: [
            {
              name: "path",
              type: "string",
              description: "路径",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "dangerousWrite",
          displayName: "危险写入",
          description: "写入操作，需要审批",
          parameters: [
            {
              name: "path",
              type: "string",
              description: "路径",
              required: true,
            },
            {
              name: "content",
              type: "string",
              description: "内容",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  /**
   * 安全策略检查：safeRead 允许，dangerousWrite 需要审批
   */
  checkSecurityPolicy(
    methodName: string,
    _args: Record<string, unknown>
  ): { status: "allow" | "approve" | "block"; message?: string } {
    if (methodName === "dangerousWrite") {
      return { status: "approve", message: "写入操作需要用户审批" };
    }
    return { status: "allow" };
  }

  async safeRead(args: { path: string }): Promise<string> {
    return `read:${args.path}`;
  }

  async dangerousWrite(args: {
    path: string;
    content: string;
  }): Promise<string> {
    return `wrote to ${args.path}: ${args.content}`;
  }
}

/**
 * 异步任务测试工具
 */
export class MockAsyncTool implements ToolRegistry {
  readonly id = "mock-async";
  readonly name = "Mock 异步工具";
  readonly description = "用于测试异步任务提交与状态管理的 Mock 工具";

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "longTask",
          displayName: "长任务",
          description: "模拟一个异步长任务",
          parameters: [
            {
              name: "duration",
              type: "number",
              description: "持续时间（秒）",
              required: false,
              defaultValue: 1,
            },
            {
              name: "shouldFail",
              type: "boolean",
              description: "是否模拟失败",
              required: false,
              defaultValue: false,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
          executionMode: "async",
          asyncConfig: {
            hasProgress: true,
            cancellable: true,
            estimatedDuration: 1,
          },
        },
      ],
    };
  }

  async longTask(
    args: { duration?: number; shouldFail?: boolean },
    context?: ToolContext
  ): Promise<string> {
    const duration = (Number(args.duration) || 1) * 1000;
    const shouldFail = args.shouldFail === true;

    // 模拟进度上报
    if (context?.reportStatus) {
      context.reportStatus("任务开始执行", 0);
    }

    await new Promise((resolve, reject) => {
      setTimeout(() => {
        if (shouldFail) {
          reject(new Error("模拟任务失败"));
        } else {
          resolve(undefined);
        }
      }, duration);
    });

    if (context?.reportStatus) {
      context.reportStatus("任务执行完成", 100);
    }

    return "任务完成";
  }
}

/**
 * 带 Schema 默认值的测试工具（用于测试参数合并优先级）
 */
export class MockSchemaTool implements ToolRegistry {
  readonly id = "mock-schema";
  readonly name = "Mock Schema 工具";
  readonly description =
    "用于测试参数合并优先级（Schema 默认值 < Agent 预设 < LLM 实时参数）";

  /** Schema 默认值（用 any 绕过 ToolRegistry 的严格类型约束，executor 内部通过 (toolInstance as any).settingsSchema 访问） */
  settingsSchema: any = [
    { modelPath: "theme", defaultValue: "light" },
    { modelPath: "fontSize", defaultValue: 14 },
  ];

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "getConfig",
          displayName: "获取配置",
          description: "返回合并后的配置参数",
          parameters: [
            {
              name: "theme",
              type: "string",
              description: "主题",
              required: false,
            },
            {
              name: "fontSize",
              type: "number",
              description: "字号",
              required: false,
            },
            {
              name: "extra",
              type: "string",
              description: "额外参数",
              required: false,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  async getConfig(args: Record<string, unknown>): Promise<string> {
    return JSON.stringify(args);
  }
}
