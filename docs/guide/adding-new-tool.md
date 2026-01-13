# 添加新工具指南

本指南将引导你完成向 AIO Hub 添加新工具的全过程，涵盖桌面端和移动端的开发规范。

## 1. 准备工作

在开始之前，请确定你的工具类型：

- **纯前端工具**: 仅包含 UI 和前端逻辑（如 JSON 格式化）。
- **后端支持工具**: 需要 Rust 后端命令支持（如文件操作、系统调用）。
- **Agent 服务**: 需要暴露给 LLM 使用的能力（通常通过桌面端的 Registry 实现）。

---

## 2. 桌面端开发规范 (Desktop)

桌面端工具位于 `src/tools/` 目录下，采用**自动发现机制**。

### 2.1 创建目录结构

建议结构如下：

```
src/tools/my-new-tool/
├── MyNewTool.vue           # 主 UI 组件
├── my-new-tool.registry.ts # 核心注册文件（必须以 .registry.ts 结尾）
├── types.ts                # 类型定义
└── utils.ts                # 工具函数
```

> **注意**: 请使用具有辨识度的文件名（如 `MyNewTool.vue`），**不要使用 `index.vue`**。

### 2.2 实现注册逻辑 (`*.registry.ts`)

这是桌面端最关键的文件，它负责 UI 注册和服务注册。

```typescript
// src/tools/my-new-tool/my-new-tool.registry.ts
import { markRaw } from "vue";
import { Braces } from "lucide-vue-next";
import type { ToolConfig, ToolRegistry } from "@/services/types";

/**
 * 1. UI 配置注册
 * 系统会自动扫描并调用 toolsStore.addTool 将此配置加入工具列表
 */
export const toolConfig: ToolConfig = {
  name: "我的新工具",
  path: "/my-new-tool",
  icon: markRaw(Braces),
  // 必须使用动态导入以优化性能
  component: () => import("./MyNewTool.vue"),
  description: "这是一个很棒的新工具",
  category: "开发工具", // 现有分类：AI 工具, 文本处理, 文件管理, 开发工具
};

/**
 * 2. 服务逻辑注册 (可选)
 * 如果需要暴露功能给 Agent 或其他模块调用，请实现 ToolRegistry 接口
 */
class MyNewToolRegistry implements ToolRegistry {
  public readonly id = "my-new-tool-service";
  public readonly name = "我的新工具服务";
  public readonly description = "提供某某核心处理能力";

  public async doSomething(text: string): Promise<string> {
    return `Processed: ${text}`;
  }

  // (推荐) 提供元数据供服务浏览器展示
  public getMetadata() {
    return {
      methods: [
        {
          name: "doSomething",
          description: "处理文本示例",
          parameters: [{ name: "text", type: "string", required: true }],
          returnType: "Promise<string>",
        },
      ],
    };
  }
}

// 必须默认导出类，以便系统自动实例化
export default MyNewToolRegistry;
```

### 2.3 调整显示顺序

打开 `src/config/tools.ts`，将你的工具路径（如 `/my-new-tool`）添加到 `DEFAULT_TOOLS_ORDER` 数组的合适位置。未添加的工具将默认排在末尾。

---

## 3. 移动端开发规范 (Mobile)

移动端工具位于 `mobile/src/tools/` 目录下，遵循**独立重构、全量对齐**原则。

### 3.1 创建目录结构

```
mobile/src/tools/my-new-tool/
├── views/
│   └── MyNewToolView.vue   # 移动端视图
├── locales/                # 多语言包
│   ├── zh-CN.json
│   └── en-US.json
├── registry.ts             # 移动端注册文件（固定名称）
└── ...
```

### 3.2 实现注册逻辑 (`registry.ts`)

移动端需要显式注册路由和语言包。

```typescript
// mobile/src/tools/my-new-tool/registry.ts
import { registerToolLocales, useI18n } from "@/i18n";
import { Braces } from "lucide-vue-next";
import { markRaw } from "vue";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 1. 注册语言包（必须在导出前调用）
registerToolLocales("my-new-tool", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "my-new-tool",
  // 使用 getter 以支持动态切换语言
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.my-new-tool.common.工具名称");
  },
  get description() {
    const { tRaw } = useI18n();
    return tRaw("tools.my-new-tool.common.工具描述");
  },
  icon: markRaw(Braces), // 推荐使用 markRaw 包裹的 Lucide 组件
  // 路由配置需放在 route 对象下
  route: {
    path: "/tools/my-new-tool",
    name: "MyNewTool",
    component: () => import("./views/MyNewToolView.vue"),
    meta: {
      get title() {
        const { tRaw } = useI18n();
        return tRaw("tools.my-new-tool.common.工具名称");
      },
    },
  },
  // 可选：初始化钩子
  async init() {
    // 执行 store 初始化等异步操作
  },
};
```

### 3.3 移动端 i18n 规范

- **Key 命名**: 使用中文作为 Key，例如 `"工具名称": "我的工具"`。
- **命名空间**:
  - **私有文案**: 建议在工具内使用 `common` 或功能模块作为二级命名空间，例如 `tools.my-new-tool.common.名称`。
  - **全局文案**: 移动端提供全局语言包（`mobile/src/i18n/locales/`），包含 `common` (通用按钮/状态)、`nav` (导航) 等。
- **调用方式**:
  - 私有文案：使用 `tRaw('tools.my-new-tool.xxx')`。
  - 全局文案：优先使用 `t('common.xxx')` 以获得类型安全和自动补全。

---

## 4. (桌面端进阶) 添加 Rust 后端命令

如果工具需要调用系统底层能力：

1. **Rust 实现**: 在 `src-tauri/src/commands/` 下创建新模块，并使用 `#[tauri::command]` 标记。
2. **注册命令**: 在 `src-tauri/src/lib.rs` 的 `generate_handler!` 中添加该命令。
3. **前端调用**:
   ```typescript
   import { invoke } from "@tauri-apps/api/core";
   const result = await invoke("my_custom_command", { arg1: "val" });
   ```

---

## 5. 开发建议与测试

1. **错误处理**: 必须使用 `createModuleErrorHandler` 创建独立的错误处理器。
2. **日志记录**: 必须使用 `createModuleLogger` 创建独立的日志记录器。
3. **样式适配**:
   - 桌面端：优先使用 `var(--card-bg)` 等主题变量。
   - 移动端：字体类必须使用 `rem` 单位以适配字体缩放。
4. **测试**:
   - 运行 `bun run t:d` (桌面端) 或 `bun run mtad` (Android) 进行实时预览。
   - 验证图标显示、多语言切换及核心逻辑是否正常。
