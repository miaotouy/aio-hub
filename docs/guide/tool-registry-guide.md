# 工具注册规范详解

本文档是 [`adding-new-tool.md`](./adding-new-tool.md) 的进阶补充，专注于 `*.registry.ts` 文件的完整编写规范，包括 `settingsSchema`、Agent 方法编写格式和 `getMetadata()` 的详细说明。

---

## 1. Registry 文件结构总览

一个完整的 `*.registry.ts` 文件由两部分组成：

```typescript
// src/tools/my-tool/myTool.registry.ts

// ① 默认导出：服务注册类（可选，但推荐）
export default class MyToolRegistry implements ToolRegistry { ... }

// ② 命名导出：UI 配置（必须）
export const toolConfig: ToolConfig = { ... }
```

两者相互独立，可以只有 `toolConfig`（纯 UI 工具），也可以两者都有（带 Agent 能力的工具）。

---

## 2. `ToolConfig` — UI 注册配置

```typescript
import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import { Braces } from "lucide-vue-next"; // 或自定义 SVG 组件

export const toolConfig: ToolConfig = {
  name: "工具显示名称", // 侧边栏和标题栏显示的名称
  path: "/my-tool", // 路由路径，必须唯一，以 / 开头
  icon: markRaw(Braces), // 必须用 markRaw 包裹，避免 Vue 响应式代理
  component: () => import("./MyTool.vue"), // 动态导入，不要直接 import
  description: "工具的简短描述", // 可选，用于工具列表展示
  category: "开发工具", // 可选，现有分类见下方说明
};
```

**现有 `category` 分类**：`AI 工具` / `文本处理` / `文件管理` / `开发工具` / `媒体工具`

---

## 3. `ToolRegistry` 类 — 服务注册

### 3.1 必填属性

```typescript
export default class MyToolRegistry implements ToolRegistry {
  public readonly id = "my-tool"; // 唯一 ID，通常与路由路径一致（去掉 /）
  public readonly name = "我的工具"; // 服务显示名称
  public readonly description = "..."; // 服务描述，会出现在 Agent 工具列表中
}
```

### 3.2 可选生命周期钩子

```typescript
// 工具初始化，在注册时由 ToolRegistryManager 调用一次
async initialize(): Promise<void> {
  // 加载初始配置、建立连接等
}

// 工具销毁，应用关闭或热重载时调用
dispose(): void {
  // 清理定时器、取消订阅等
}
```

### 3.3 `settingsSchema` — 工具设置项声明

`settingsSchema` 是一个 `SettingItem[]` 数组，声明后系统会自动在设置页面渲染对应的 UI 控件。

```typescript
import type { SettingItem } from "@/types/settings-renderer";

public readonly settingsSchema: SettingItem[] = [
  // ElSwitch — 开关
  {
    id: "mt-show-hidden",          // 全局唯一 ID，建议加工具前缀避免冲突
    label: "显示隐藏文件",
    component: "ElSwitch",
    modelPath: "showHidden",       // 对应设置存储中的字段路径
    hint: "是否显示以 . 开头的隐藏文件",
    keywords: "隐藏 文件",         // 设置搜索关键词，空格分隔
    defaultValue: false,
  },

  // ElInputNumber — 数字输入
  {
    id: "mt-max-depth",
    label: "最大深度",
    component: "ElInputNumber",
    modelPath: "maxDepth",
    hint: "0 表示无限制",
    keywords: "深度 层级",
    defaultValue: 5,
    props: {
      min: 0,
      max: 20,
      step: 1,
    },
  },

  // ElSelect — 下拉选择
  {
    id: "mt-mode",
    label: "工作模式",
    component: "ElSelect",
    modelPath: "mode",
    hint: "选择处理模式",
    keywords: "模式",
    defaultValue: "fast",
    props: {
      options: [
        { label: "快速模式", value: "fast" },
        { label: "精确模式", value: "precise" },
      ],
    },
  },

  // ElInput — 文本输入
  {
    id: "mt-api-key",
    label: "API Key",
    component: "ElInput",
    modelPath: "apiKey",
    hint: "留空则使用全局配置",
    keywords: "api key 密钥",
    defaultValue: "",
    props: {
      type: "password",
      showPassword: true,
    },
  },
];
```

---

## 4. Agent 方法编写规范

### 4.1 核心原则：Facade 模式

Registry 类中的 Agent 方法是一个**适配层（Facade）**，不包含业务逻辑。业务逻辑应放在 `actions.ts` 或其他模块中，Registry 方法只负责：

1. 接收 `Record<string, unknown>` 类型的扁平参数（来自 LLM 的 JSON）
2. 将参数转换为强类型的 Options 对象
3. 调用 `actions.ts` 中的实际函数

```
LLM 调用 → Registry.agentMethod(Record<string, unknown>)
                    ↓ 参数转换
           actions.doSomething(StrongTypedOptions)
                    ↓ 返回结果
           返回给 LLM
```

### 4.2 参数转换规范

由于 LLM 传入的参数是 JSON 序列化后的 `Record<string, unknown>`，需要手动做类型转换：

```typescript
public async generateTree(args: Record<string, unknown>): Promise<TreeGenerationResult> {
  const options: GenerateTreeOptions = {
    // string 类型：用 String() 转换，提供默认值
    path: String(args.path || ""),

    // boolean 类型：需同时处理 true 和 "true" 两种情况
    showFiles: args.showFiles !== false && args.showFiles !== "false",
    showHidden: args.showHidden === true || args.showHidden === "true",

    // number 类型：用 Number() 转换，提供默认值
    maxDepth: args.maxDepth !== undefined ? Number(args.maxDepth) : 5,

    // 枚举类型：用 as 断言，提供默认值
    filterMode: (args.filterMode as GenerateTreeOptions["filterMode"]) || "none",

    // 数组类型：检查 Array.isArray
    includes: Array.isArray(args.includes)
      ? (args.includes as string[])
      : undefined,
  };

  return await generateTree(options);
}
```

**boolean 转换的两种模式**：

| 场景           | 写法                                     | 含义                    |
| -------------- | ---------------------------------------- | ----------------------- |
| 默认为 `true`  | `args.x !== false && args.x !== "false"` | 只有明确传 false 才关闭 |
| 默认为 `false` | `args.x === true \|\| args.x === "true"` | 只有明确传 true 才开启  |

### 4.3 方法命名建议

- Agent 方法应返回**格式化的、对 LLM 友好的结果**，而不是原始数据结构
- 推荐命名前缀：`get`, `analyze`, `generate`, `process`, `validate`
- 如果有原始版本和格式化版本，格式化版本加 `Formatted` 后缀，并标记为 `agentCallable: true`

```typescript
// 内部使用的原始版本
public async processText(options: TextProcessOptions): Promise<TextProcessResult | null> { ... }

// Agent 调用的格式化版本（推荐 Agent 使用）
public async getFormattedTextResult(args: Record<string, unknown>): Promise<FormattedProcessSummary | null> {
  const result = await this.processText({ ... });
  return { summary: "处理完成，应用了 N 条规则", details: { ... } };
}
```

---

## 5. `getMetadata()` — 元数据声明

`getMetadata()` 返回 `ServiceMetadata`，用于：

- Agent 工具列表的自动生成
- 服务浏览器 UI 展示
- VCP 分布式节点的能力声明

### 5.1 完整字段说明

```typescript
public getMetadata(): ServiceMetadata {
  return {
    methods: [
      {
        // ---- 基础信息 ----
        name: "generateTree",           // 方法名，必须与类中的方法名完全一致
        displayName: "生成目录树",       // 可选，UI 友好名称
        description: "根据配置选项生成目录树结构，返回树形文本和统计信息",

        // ---- 调用权限 ----
        agentCallable: true,            // 是否允许 LLM Agent 调用，默认 false
        distributedExposed: false,      // 是否通过 VCP 分布式节点暴露，默认 false

        // ---- 参数列表 ----
        parameters: [
          {
            name: "path",
            type: "string",
            description: "要分析的目标目录路径（绝对路径）",
            required: true,             // 必填参数
          },
          {
            name: "maxDepth",
            type: "number",
            description: "目录树的最大深度，0 表示无限制",
            required: false,
            defaultValue: 5,            // 可选参数需提供默认值
          },
          {
            name: "filterMode",
            // 枚举类型用联合类型字符串表示
            type: "'none' | 'gitignore' | 'custom' | 'both'",
            description: "过滤模式",
            required: false,
            defaultValue: "none",
          },
          {
            name: "options",
            // 对象类型用 properties 描述内部结构
            type: "object",
            description: "高级选项",
            required: false,
            properties: [
              { name: "encoding", type: "string", description: "文件编码" },
              { name: "followSymlinks", type: "boolean", description: "是否跟随符号链接" },
            ],
          },
        ],

        // ---- 返回类型 ----
        returnType: "Promise<TreeGenerationResult>",

        // ---- 可选：调用示例 ----
        example: `generateTree({ path: "/home/user/project", maxDepth: 3, filterMode: "gitignore" })`,

        // ---- 可选：协议配置 ----
        protocolConfig: {
          vcpCommand: "directory_tree_generate", // VCP 协议的命令名称映射
        },
      },
    ],
  };
}
```

### 5.2 `agentCallable` vs `distributedExposed`

| 字段                       | 含义                                  | 使用场景                    |
| -------------------------- | ------------------------------------- | --------------------------- |
| `agentCallable: true`      | 允许本地 LLM Agent（如内置 Chat）调用 | 大多数需要 AI 调用的方法    |
| `distributedExposed: true` | 允许通过 VCP 协议暴露给远程节点       | 需要跨设备/跨进程调用的方法 |

两者可以同时为 `true`，也可以只设置其中一个。未设置时默认均为 `false`（方法不对外暴露）。

### 5.3 `type` 字段的写法规范

| 数据类型     | `type` 字段写法                           |
| ------------ | ----------------------------------------- |
| 字符串       | `"string"`                                |
| 数字         | `"number"`                                |
| 布尔         | `"boolean"`                               |
| 字符串枚举   | `"'value1' \| 'value2' \| 'value3'"`      |
| 数组         | `"string[]"` 或 `"Array<string>"`         |
| 复杂数组     | `"Array<'statistics' \| 'commits'>"`      |
| 对象         | `"object"`（配合 `properties` 字段）      |
| 已定义的类型 | `"GenerateTreeOptions"`（类型名称字符串） |
| 可空         | `"string \| null"`                        |

---

## 6. 完整示例

以下是一个包含所有特性的完整 registry 文件示例：

```typescript
// src/tools/file-reader/fileReader.registry.ts
import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { SettingItem } from "@/types/settings-renderer";
import { markRaw } from "vue";
import { FileText } from "lucide-vue-next";
import { readFile, type ReadFileOptions, type ReadFileResult } from "./actions";

export default class FileReaderRegistry implements ToolRegistry {
  public readonly id = "file-reader";
  public readonly name = "文件读取器";
  public readonly description = "读取本地文件内容，支持多种编码格式";

  public readonly settingsSchema: SettingItem[] = [
    {
      id: "fr-default-encoding",
      label: "默认编码",
      component: "ElSelect",
      modelPath: "defaultEncoding",
      hint: "读取文件时使用的默认字符编码",
      keywords: "编码 encoding utf",
      defaultValue: "utf-8",
      props: {
        options: [
          { label: "UTF-8", value: "utf-8" },
          { label: "GBK", value: "gbk" },
          { label: "ASCII", value: "ascii" },
        ],
      },
    },
    {
      id: "fr-max-size",
      label: "最大文件大小 (MB)",
      component: "ElInputNumber",
      modelPath: "maxFileSizeMb",
      hint: "超过此大小的文件将拒绝读取",
      keywords: "大小 限制 size",
      defaultValue: 10,
      props: { min: 1, max: 100 },
    },
  ];

  /**
   * 读取文件内容（Agent facade）
   */
  public async readFile(args: Record<string, unknown>): Promise<ReadFileResult | null> {
    const options: ReadFileOptions = {
      path: String(args.path || ""),
      encoding: args.encoding ? String(args.encoding) : "utf-8",
      maxLines: args.maxLines !== undefined ? Number(args.maxLines) : undefined,
      includeMetadata: args.includeMetadata === true || args.includeMetadata === "true",
    };
    return readFile(options);
  }

  public getMetadata() {
    return {
      methods: [
        {
          name: "readFile",
          displayName: "读取文件",
          description: "读取指定路径的文件内容，支持编码设置和行数限制",
          agentCallable: true,
          parameters: [
            {
              name: "path",
              type: "string",
              description: "文件的绝对路径",
              required: true,
            },
            {
              name: "encoding",
              type: "'utf-8' | 'gbk' | 'ascii'",
              description: "文件编码格式",
              required: false,
              defaultValue: "utf-8",
            },
            {
              name: "maxLines",
              type: "number",
              description: "最多读取的行数，不传则读取全部",
              required: false,
            },
            {
              name: "includeMetadata",
              type: "boolean",
              description: "是否在结果中包含文件大小、修改时间等元数据",
              required: false,
              defaultValue: false,
            },
          ],
          returnType: "Promise<ReadFileResult | null>",
          example: `readFile({ path: "/home/user/notes.txt", maxLines: 100 })`,
        },
      ],
    };
  }
}

export const toolConfig: ToolConfig = {
  name: "文件读取器",
  path: "/file-reader",
  icon: markRaw(FileText),
  component: () => import("./FileReader.vue"),
  description: "读取本地文件内容，支持多种编码格式",
  category: "文件管理",
};
```

---

## 7. 常见问题

**Q: `id` 和路由 `path` 必须一致吗？**

不强制，但强烈建议保持一致（去掉 `/` 前缀）。例如 `path: "/git-analyzer"` 对应 `id = "git-analyzer"`。这样通过 `ToolRegistryManager.get("git-analyzer")` 就能找到对应服务。

**Q: 什么时候需要 `settingsSchema`？**

当工具有用户可配置的行为参数时（如默认值、显示偏好等），声明 `settingsSchema` 后系统会自动在 agent 设置页面渲染 UI，无需手写设置界面。

**Q: Agent 方法必须接收 `Record<string, unknown>` 吗？**

对于标记了 `agentCallable: true` 的方法，建议接收 `Record<string, unknown>` 以兼容 LLM 的 JSON 调用。对于仅供内部调用的方法（`agentCallable` 未设置或为 `false`），可以使用强类型参数。

**Q: `getMetadata()` 中的 `methods` 需要列出所有方法吗？**

不需要。只列出需要对外暴露的方法（`agentCallable: true` 或 `distributedExposed: true` 的方法）。内部辅助方法不需要出现在 metadata 中。
