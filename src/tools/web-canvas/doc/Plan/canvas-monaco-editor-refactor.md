# Canvas Monaco Editor 重构方案

## 1. 背景与目标

### 1.1 当前问题

- [`CanvasEditorPanel.vue`](../../components/workbench/CanvasEditorPanel.vue) 使用通用的 `RichCodeEditor`，无法访问 Monaco 的高级 API
- 无法实现 LSP 集成、静态错误标记、AI 代码生成预览等高级功能
- 通用组件的抽象层限制了 Canvas 的扩展性

### 1.2 重构目标

✅ 创建 Canvas 专属的 Monaco 编辑器组件  
✅ 完全掌控 Monaco Editor 实例，支持所有原生 API  
✅ 预留 LSP 集成接口（参考 [`lsp集成设想.md`](../design/lsp集成设想.md)）  
✅ 支持多文件 Model 管理（通过 URI 区分）  
✅ 适配项目主题外观系统  
✅ 支持静态错误标记（Markers）和运行时错误跳转

---

## 2. 架构设计

### 2.1 组件层级结构

```
src/tools/canvas/components/
├── editor/                          # 新增：编辑器专属目录
│   ├── CanvasMonacoEditor.vue      # 核心：Monaco 编辑器封装
│   ├── MonacoModelManager.ts       # Model 生命周期管理
│   └── types.ts                    # 编辑器相关类型定义
├── workbench/
│   └── CanvasEditorPanel.vue       # 修改：使用新编辑器
└── ...
```

### 2.2 核心组件：`CanvasMonacoEditor.vue`

#### 2.2.1 职责定位

- **单一职责**：专注于 Monaco Editor 的初始化、配置和生命周期管理
- **无业务逻辑**：不处理文件读写、Git 状态等业务，仅负责编辑器本身
- **高度可配置**：通过 Props 和 Slots 提供灵活的定制能力

#### 2.2.2 核心功能

1. **Model 管理**：支持多文件场景，通过 URI 区分不同文件
2. **主题适配**：自动同步项目的明暗主题和外观变量
3. **事件系统**：暴露 Monaco 的核心事件（内容变化、光标移动、Markers 变化等）
4. **实例暴露**：通过 `defineExpose` 暴露 `editor` 实例供父组件调用高级 API
5. **LSP 预留**：提供 `onEditorReady` 钩子，方便后续挂载 Language Client

#### 2.2.3 Props 设计

```typescript
interface CanvasMonacoEditorProps {
  /** 文件路径（用于生成 Model URI） */
  filepath: string;
  /** 编辑器内容 */
  modelValue: string;
  /** 语言标识符 */
  language: string;
  /** 是否只读 */
  readonly?: boolean;
  /** 自定义编辑器选项 */
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
  /** Canvas ID（用于多画布场景的 URI 隔离） */
  canvasId?: string;
}
```

#### 2.2.4 Emits 设计

```typescript
interface CanvasMonacoEditorEmits {
  /** 内容变化 */
  (e: "update:modelValue", value: string): void;
  /** Markers 变化（静态错误） */
  (e: "markersChange", markers: monaco.editor.IMarker[]): void;
  /** 光标位置变化 */
  (e: "cursorPositionChange", position: monaco.Position): void;
  /** 编辑器挂载完成 */
  (e: "editorReady", editor: monaco.editor.IStandaloneCodeEditor): void;
}
```

#### 2.2.5 暴露的方法

```typescript
defineExpose({
  /** Monaco Editor 实例（供高级操作） */
  editor: monaco.editor.IStandaloneCodeEditor,
  /** 跳转到指定行列 */
  revealPosition: (line: number, column: number) => void,
  /** 添加装饰器（用于 AI 预览等） */
  addDecorations: (decorations: monaco.editor.IModelDeltaDecoration[]) => string[],
  /** 清除装饰器 */
  clearDecorations: (ids: string[]) => void,
  /** 获取当前光标位置 */
  getCursorPosition: () => monaco.Position | null,
  /** 设置只读状态 */
  setReadOnly: (readonly: boolean) => void,
});
```

---

### 2.3 Model 管理器：`MonacoModelManager.ts`

#### 2.3.1 职责

- 统一管理所有 Canvas 文件的 Monaco Model
- 避免重复创建 Model（通过 URI 缓存）
- 自动清理不再使用的 Model

#### 2.3.2 核心 API

```typescript
class MonacoModelManager {
  /**
   * 获取或创建 Model
   * @param canvasId Canvas ID
   * @param filepath 文件路径
   * @param content 初始内容
   * @param language 语言标识符
   */
  getOrCreateModel(canvasId: string, filepath: string, content: string, language: string): monaco.editor.ITextModel;

  /**
   * 销毁指定 Model
   */
  disposeModel(canvasId: string, filepath: string): void;

  /**
   * 销毁指定 Canvas 的所有 Model
   */
  disposeCanvasModels(canvasId: string): void;

  /**
   * 生成 Model URI
   */
  private generateUri(canvasId: string, filepath: string): monaco.Uri;
}

export const monacoModelManager = new MonacoModelManager();
```

#### 2.3.3 URI 设计规范

```
canvas://{canvasId}/{filepath}
```

**示例**：

- `canvas://abc123/index.html`
- `canvas://abc123/src/main.js`

**优势**：

- 支持多画布同时打开
- 与 LSP 的 `textDocument/uri` 规范对齐
- 便于后续实现跨文件引用追踪

---

## 3. 主题适配方案

### 3.1 复用现有逻辑

直接复用 [`RichCodeEditor.vue`](../../../components/common/RichCodeEditor.vue:669-681) 中的主题适配 CSS：

```vue
<style scoped>
:deep(.monaco-editor) {
  --vscode-editor-background: var(--code-block-bg, var(--input-bg)) !important;
  --vscode-editorGutter-background: var(--code-block-bg, var(--input-bg)) !important;
  /* ... 其他变量 */
}
</style>
```

### 3.2 动态主题切换

```typescript
import { useTheme } from "@/composables/useTheme";

const { isDark } = useTheme();
const monacoTheme = computed(() => (isDark.value ? "vs-dark" : "vs"));

watch(monacoTheme, (newTheme) => {
  monaco.editor.setTheme(newTheme);
});
```

---

## 4. LSP 集成预留接口

### 4.1 编辑器挂载钩子

在 `CanvasMonacoEditor.vue` 中提供 `@editorReady` 事件：

```vue
<CanvasMonacoEditor
  v-model="fileContent"
  :filepath="activeTab"
  :language="currentLanguage"
  @editorReady="handleEditorReady"
/>
```

```typescript
function handleEditorReady(editor: monaco.editor.IStandaloneCodeEditor) {
  // 未来在这里挂载 LSP Client
  // lspClient.attachEditor(editor);
}
```

### 4.2 Markers 监听

```typescript
function handleMarkersChange(markers: monaco.editor.IMarker[]) {
  // 将静态错误同步到 Store
  const errors = markers
    .filter((m) => m.severity === monaco.MarkerSeverity.Error)
    .map((m) => ({
      line: m.startLineNumber,
      column: m.startColumn,
      message: m.message,
      source: "monaco",
    }));

  // 未来可以注入到 Agent 上下文
  console.log("Static errors:", errors);
}
```

---

## 5. 与现有系统的集成

### 5.1 修改 `CanvasEditorPanel.vue`

**Before**:

```vue
<RichCodeEditor
  v-model="fileContent"
  :language="currentLanguage"
  editor-type="monaco"
  @update:model-value="handleContentChange"
/>
```

**After**:

```vue
<CanvasMonacoEditor
  v-model="fileContent"
  :canvas-id="canvasId"
  :filepath="activeTab"
  :language="currentLanguage"
  @update:model-value="handleContentChange"
  @markersChange="handleMarkersChange"
  @editorReady="handleEditorReady"
  ref="editorRef"
/>
```

### 5.2 新增功能：错误跳转

```typescript
const editorRef = ref<InstanceType<typeof CanvasMonacoEditor>>();

function jumpToError(line: number, column: number) {
  editorRef.value?.revealPosition(line, column);
}
```

### 5.3 新增功能：AI 修改预览

```typescript
function previewAiChange(line: number, oldText: string, newText: string) {
  const decorations = [
    {
      range: new monaco.Range(line, 1, line, oldText.length + 1),
      options: {
        className: "ai-preview-decoration",
        glyphMarginClassName: "ai-preview-glyph",
        hoverMessage: { value: "**AI 建议修改**\n\n点击应用" },
      },
    },
  ];

  const ids = editorRef.value?.addDecorations(decorations);
  // 保存 ids 用于后续清除
}
```

---

## 6. 类型定义

### 6.1 `src/tools/canvas/components/editor/types.ts`

```typescript
import type * as monaco from "monaco-editor";

/**
 * 编辑器装饰器配置
 */
export interface EditorDecoration {
  range: monaco.IRange;
  options: monaco.editor.IModelDecorationOptions;
}

/**
 * 静态错误（来自 Monaco Markers）
 */
export interface StaticError {
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  message: string;
  severity: "error" | "warning" | "info";
  source: "monaco" | "lsp" | "oxlint";
}

/**
 * 编辑器状态快照（用于 Diff 预览）
 */
export interface EditorSnapshot {
  content: string;
  cursorPosition: monaco.Position;
  scrollPosition: { scrollTop: number; scrollLeft: number };
}
```

---

## 7. 实施路线图

### Phase 1: 基础重构（MVP）

- [x] 创建 `CanvasMonacoEditor.vue` 组件
- [x] 实现 `MonacoModelManager.ts`
- [x] 修改 `CanvasEditorPanel.vue` 使用新编辑器
- [x] 主题适配验证

### Phase 2: 错误系统集成

- [ ] 实现 Markers 监听和错误跳转
- [ ] 在底部状态栏显示错误统计
- [ ] 支持点击错误列表跳转到对应行

### Phase 3: 高级功能

- [ ] AI 修改预览（Inline Decorations）
- [ ] 多光标协作支持
- [ ] Diff 视图集成

### Phase 4: LSP 集成

- [ ] 接入 `monaco-languageclient`
- [ ] 实现跳转、补全、重构等功能
- [ ] 参考 [`lsp集成设想.md`](../design/lsp集成设想.md) 完整实施

---

## 8. 风险评估与缓解

### 8.1 性能风险

**风险**：大文件编辑时 Monaco 可能卡顿  
**缓解**：

- 启用 `automaticLayout: true` 减少手动布局计算
- 对超大文件（>1MB）显示警告并建议使用外部编辑器

### 8.2 兼容性风险

**风险**：现有依赖 `RichCodeEditor` 的代码可能受影响  
**缓解**：

- `RichCodeEditor` 保持不变，仅 Canvas 使用新编辑器
- 通过 Feature Flag 控制新编辑器的启用

### 8.3 学习成本

**风险**：团队成员需要熟悉 Monaco API  
**缓解**：

- 提供详细的 API 文档和使用示例
- 在 `CanvasMonacoEditor` 中封装常用操作

---

## 9. 成功指标

✅ **功能完整性**：支持所有 `RichCodeEditor` 的基础功能  
✅ **扩展性**：可以轻松添加 LSP、装饰器等高级功能  
✅ **性能**：大文件（100KB+）编辑流畅，无明显卡顿  
✅ **主题一致性**：与项目整体外观系统完美适配  
✅ **开发体验**：提供清晰的 API 和完善的类型提示

---

## 10. 后续优化方向

1. **虚拟滚动**：对超大文件启用虚拟滚动优化
2. **WebWorker 集成**：将语法高亮和 LSP 放入 Worker
3. **协作编辑**：基于 CRDT 实现多人实时协作
4. **插件系统**：允许用户自定义编辑器行为

---

## 附录：参考资料

- [Monaco Editor API](https://microsoft.github.io/monaco-editor/api/index.html)
- [monaco-languageclient](https://github.com/TypeFox/monaco-languageclient)
- [LSP 集成设想](../design/lsp集成设想.md)
- [RichCodeEditor 源码](../../../components/common/RichCodeEditor.vue)
