## 方案设计：Canvas Linter Plugin

### 核心架构

#### 1. 插件定位

创建一个名为 `canvas-linter` 的 **JavaScript 插件**，专门为 Canvas 工具提供静态代码检查能力。

#### 2. 技术选型对比

| Linter          | 实现方式              | 性能    | 优势                                  | 劣势                               |
| --------------- | --------------------- | ------- | ------------------------------------- | ---------------------------------- |
| **Oxlint**      | Sidecar (Rust 二进制) | ⚡️ 极快 | Rust 原生，速度是 ESLint 的 50-100 倍 | 规则集较少，生态不如 ESLint 成熟   |
| **ESLint**      | JS Worker (浏览器版)  | 🐢 较慢 | 规则丰富，生态成熟，配置灵活          | 大文件性能差，需要打包体积大       |
| **Monaco 内置** | Web Worker            | ⚡️ 快   | 零配置，已集成                        | 仅支持基础语法检查，无法自定义规则 |

**推荐方案**：**Oxlint (Sidecar) + Monaco 内置**的混合架构

- **Monaco 内置**：处理 HTML/CSS 和基础 JS 语法错误（实时反馈）
- **Oxlint Sidecar**：处理复杂的 JS/TS 代码质量检查（按需触发）

### 3. 插件架构设计

```
plugins/canvas-linter/
├── manifest.json              # 插件清单
├── index.ts                   # 插件逻辑入口
├── sidecar/                   # Oxlint 二进制
│   ├── oxlint-win32-x64.exe
│   ├── oxlint-darwin-x64
│   └── oxlint-linux-x64
├── adapters/
│   ├── MonacoAdapter.ts       # Monaco Markers 提取器
│   └── OxlintAdapter.ts       # Oxlint 调用封装
└── types.ts                   # 类型定义
```

#### manifest.json 示例

```json
{
  "id": "canvas-linter",
  "name": "Canvas 代码检查器",
  "version": "1.0.0",
  "description": "为 Canvas 工具提供 JS/CSS/HTML 静态代码检查，支持 Oxlint 和 Monaco 双引擎",
  "author": "AIO Hub Team",
  "icon": "🔍",
  "tags": ["Canvas", "Linter", "代码质量"],
  "host": {
    "appVersion": ">=0.5.6",
    "apiVersion": 2
  },
  "type": "javascript",
  "main": "index.ts",
  "methods": [
    {
      "name": "lintFile",
      "displayName": "检查文件",
      "description": "对指定文件进行静态代码检查",
      "agentCallable": true,
      "parameters": [
        { "name": "canvasId", "type": "string", "required": true },
        { "name": "filePath", "type": "string", "required": true },
        { "name": "engine", "type": "string", "description": "monaco | oxlint | auto", "required": false }
      ],
      "returnType": "Promise<LintResult>"
    }
  ]
}
```

### 4. 核心功能实现

#### A. Monaco Markers 实时监听

在 `RichCodeEditor` 挂载后，监听 `onDidChangeMarkers` 事件：

```typescript
// MonacoAdapter.ts
export function watchMonacoMarkers(
  editor: monaco.editor.IStandaloneCodeEditor,
  onError: (errors: StaticError[]) => void,
) {
  const model = editor.getModel();
  if (!model) return;

  // 监听 Markers 变化
  monaco.editor.onDidChangeMarkers((uris) => {
    if (uris.some((uri) => uri.toString() === model.uri.toString())) {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });

      const errors = markers
        .filter((m) => m.severity === monaco.MarkerSeverity.Error)
        .map((m) => ({
          line: m.startLineNumber,
          column: m.startColumn,
          message: m.message,
          source: "monaco",
          severity: "error",
        }));

      onError(errors);
    }
  });
}
```

#### B. Oxlint Sidecar 调用

通过 Tauri Command 调用 Oxlint 二进制：

```typescript
// OxlintAdapter.ts
export async function lintWithOxlint(filePath: string, content: string): Promise<LintResult> {
  // 1. 写入临时文件（Oxlint 需要真实文件路径）
  const tempFile = await writeTempFile(content, filePath);

  // 2. 调用 Oxlint
  const result = await invoke("run_oxlint", {
    filePath: tempFile,
    config: {
      /* Oxlint 配置 */
    },
  });

  // 3. 清理临时文件
  await removeTempFile(tempFile);

  return parseOxlintOutput(result);
}
```

### 5. 与 Canvas 工具集成

#### 扩展 `useCanvasErrors`

```typescript
// useCanvasErrors.ts (扩展)
export interface StaticError {
  id: string;
  canvasId: string;
  filePath: string;
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning" | "info";
  source: "monaco" | "oxlint"; // 错误来源
  timestamp: number;
}

const staticErrors = ref<StaticError[]>([]);

function addStaticError(error: Omit<StaticError, "id" | "timestamp">) {
  staticErrors.value.push({
    ...error,
    id: generateId(),
    timestamp: Date.now(),
  });
}

// 格式化静态错误上下文（给 Agent）
function getFormattedStaticErrorContext(canvasId: string): string {
  const errors = staticErrors.value.filter((e) => e.canvasId === canvasId);
  if (errors.length === 0) return "";

  let context = `🔍 Static Lint Errors (${errors.length}):\n`;
  errors.forEach((err, idx) => {
    context += `${idx + 1}. [${err.severity.toUpperCase()}] ${err.filePath}:${err.line}:${err.column}\n`;
    context += `   ${err.message} (${err.source})\n`;
  });

  return context;
}
```

#### 在 Agent 上下文中注入

修改 [`CanvasAgentService`](src/tools/canvas/services/CanvasAgentService.ts) 的上下文构建逻辑：

```typescript
const errorContext = [
  getFormattedStaticErrorContext(canvasId), // 静态错误
  getFormattedErrorContext(canvasId), // 运行时错误
]
  .filter(Boolean)
  .join("\n\n");
```

### 6. 用户体验设计

#### A. 自动触发时机

- **Monaco 实时**：编辑器内容变化后 500ms（防抖）
- **Oxlint 按需**：
  - Agent 完成修改后自动触发
  - 用户点击"全量检查"按钮
  - Commit 前自动检查

#### B. 错误展示

在 Canvas 编辑器底部状态栏显示：

```
🔍 静态检查: 2 个错误, 3 个警告 | 🚀 运行时: 1 个错误
```

点击后展开详细列表，支持跳转到对应行。

### 7. 配置系统

在插件的 `settingsSchema` 中定义用户可配置项：

```json
{
  "settingsSchema": {
    "engine": {
      "type": "select",
      "label": "检查引擎",
      "default": "auto",
      "options": [
        { "label": "自动选择", "value": "auto" },
        { "label": "仅 Monaco", "value": "monaco" },
        { "label": "仅 Oxlint", "value": "oxlint" },
        { "label": "双引擎", "value": "both" }
      ]
    },
    "autoLint": {
      "type": "boolean",
      "label": "自动检查",
      "default": true,
      "description": "编辑器内容变化时自动触发检查"
    },
    "oxlintRules": {
      "type": "object",
      "label": "Oxlint 规则配置",
      "default": {}
    }
  }
}
```

### 8. 优势总结

✅ **可插拔**：不需要 Linter 的用户不会有任何性能负担  
✅ **高性能**：Oxlint 的 Rust 实现速度极快，适合大型项目  
✅ **灵活配置**：用户可以选择引擎、自定义规则  
✅ **Agent 友好**：静态错误自动注入到 Agent 上下文  
✅ **开发体验**：类似 VSCode 的实时反馈  
✅ **可扩展**：未来可以支持更多 Linter（Biome, Rome 等）

### 9. 实施路线图

**Phase 1** (MVP)：Monaco 内置检查 + 基础错误上报  
**Phase 2**：集成 Oxlint Sidecar  
**Phase 3**：UI 优化（错误面板、跳转）  
**Phase 4**：规则配置系统
