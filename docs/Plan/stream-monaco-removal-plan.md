# 移除 stream-monaco 方案

> 日期:2026-06-12
> 性质:修改方案(已实施),是 [app-startup-optimization-investigation.md](./app-startup-optimization-investigation.md) 中 P0-2 的升级形态——从"懒加载化"升级为"整体移除"
> 动机:实测 CodeMirror 作为消息代码块显示引擎的本底性能大幅优于 Monaco;且 stream-monaco 是启动关键路径上单笔最大的静态负债(3.63 MB ESM Monaco + Shiki 全家桶)

## 结论先行

**移除可行,改动面小,无数据迁移。** 全仓库审计结果:

## 实施记录

### 2026-06-12 落地实施

已按本方案完成 `stream-monaco` 消息代码块路径移除:

- 删除 `src/utils/monacoShikiSetup.ts` 与 `src/tools/rich-text-renderer/components/nodes/code-block/MonacoSourceViewer.vue`;
- `CodeBlockNode.vue` 固定渲染 `CodeMirrorSourceViewer`;
- 移除 `codeEditorEngine` 设置项、类型字段、默认值、`RichTextRenderer` prop/context、llm-chat 透传绑定和测试器引擎选择器;
- `appInitStore.ts` 不再调度 Monaco/Shiki 主题初始化;
- `package.json` 删除 `stream-monaco`、`shiki` 两个直接依赖,并通过 `bun install` 刷新 `bun.lock`;
- `codeLanguages.ts` 补齐 `c`、`toml`、`lua`、`powershell` 映射,并额外补了聊天代码块常见的 `diff` 与 `ini/properties`;
- 同步更新 rich-text-renderer 架构文档、llm-chat 架构文档、用户渲染设置文档和相关性能调查文档。

与原计划的差异:

- `appInitStore.ts` 在前序启动优化中已经改成首帧后后台任务,本次实际删除的是后台 `initMonacoShikiThemes()` 调度,不是计划中旧版的首帧前 `await` 步骤;
- 额外清理了 `rich-text-renderer` 测试 store 中的 `codeEditorEngine` 持久化字段,避免测试器配置继续保存一个永远不生效的选项;
- 语言映射除计划内 4 个外,同步加入 `diff` 与 `ini/properties`;
- `bun.lock` 中仍保留 VitePress 间接依赖的 `shiki` 子树,但项目直接依赖和 `stream-monaco` 子树已移除。

- stream-monaco 只有 **2 个消费方**:`src/utils/monacoShikiSetup.ts:14`(静态导入,启动链元凶)和 `src/tools/rich-text-renderer/components/nodes/code-block/MonacoSourceViewer.vue:347`(已是动态导入);
- 消息代码块的**默认引擎已经是 CodeMirror**(`llm-chat/types/settings.ts:363`、`RichTextRenderer.vue:153`),Monaco viewer 只是遗留可选路径,`CodeMirrorSourceViewer.vue` 功能完备(懒初始化、主题、流式更新、折叠/行号/换行/字号);
- `shiki` 依赖**没有任何其他直接消费方**,可连带移除;
- `monaco-editor` 包**必须保留**(RichCodeEditor 的 @guolao AMD 栈 + 4 处懒加载视图中的 ESM 用法);
- 移动端零涉及。

收益:

| 维度          | 效果                                                                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 启动载荷      | 入口图甩掉 `editor.api2` 3.63 MB + shiki 核心/wasm/语法 chunk(17.5 MiB 起步直接 -3.7 MB 左右)                                                   |
| `initMainApp` | 删除 30% 那步的 `await initMonacoShikiThemes()`,实测 135–190ms;`initDetachedApp` 同样受益                                                       |
| 架构债        | "Shiki 主题欺骗" hack(`monacoShikiSetup.ts` 全文件)连根消失——它存在的唯一理由就是 stream-monaco 的 `shikiToMonaco` 会全局劫持 `editor.setTheme` |
| 依赖          | 移除 `stream-monaco`、`shiki` 两个直接依赖(及 alien-signals 等传递依赖)                                                                         |

唯一功能回退:高亮引擎从 Shiki(TextMate 级)换为 Lezer/legacy-modes,现有语言映射有几个缺口(`c`/`toml`/`lua`/`powershell`),`@codemirror/legacy-modes` 全有现成 mode,本方案一并补上。

---

## 一、现状盘点

### 1.1 stream-monaco 的两条消费链

```
① 启动链(静态,问题所在):
   main.ts → App.vue → appInitStore.ts:13
     → monacoShikiSetup.ts:14  import { registerMonacoThemes } from "stream-monaco"
       → stream-monaco 顶层 import * as monaco from "monaco-editor" + import { createHighlighter } from "shiki"
   运行时:initMainApp 30%(appInitStore.ts:69-70)与 initDetachedApp 35%(appInitStore.ts:139-141)
   都 await initMonacoShikiThemes() → 注册 vs-dark/vs 假主题 + 23 种语言语法预热

② 渲染链(动态,本身无启动问题):
   CodeBlockNode.vue:45-64 按 context.codeEditorEngine 分支
     ├─ engine !== 'codemirror' → MonacoSourceViewer.vue(内部 await import("stream-monaco"))
     └─ engine === 'codemirror' → CodeMirrorSourceViewer.vue(默认路径)
```

### 1.2 `codeEditorEngine` 设置的完整管线

| 层                   | 位置                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 类型定义             | `llm-chat/types/settings.ts:191`(`"monaco" \| "codemirror"`),默认值 `:363`(`"codemirror"`)                                                                                                          |
| 设置 UI              | `llm-chat/components/settings/settingsConfig.ts:579-593`(ElSelect,两个选项)                                                                                                                         |
| 透传(llm-chat)       | `MessageContent.vue:924,1083,1164`、`CompressionMessage.vue:358`、`ToolCallMessage.vue:1137`、`PresetMessageEditor.vue:274` 共 6 处 `:code-editor-engine="settings.uiPreferences.codeEditorEngine"` |
| 渲染器 props/context | `RichTextRenderer.vue:135,153,336`;`rich-text-renderer/types.ts:787,887`                                                                                                                            |
| 测试器               | `RichTextRendererTester.vue:187,259,431`、`TesterConfigSidebar.vue:122,556`(本地引擎切换器)                                                                                                         |
| 消费                 | `CodeBlockNode.vue:46`(唯一真正读取处)                                                                                                                                                              |

### 1.3 monaco-editor 的其余消费方(移除后保留,不受影响)

- **AMD 栈**(`@tomjs/vite-plugin-monaco-editor` 注入 + `@guolao/vue-monaco-editor`):`RichCodeEditor.vue`、`FilePreview.vue`、`useTextDiff.ts` 等——与本方案无关,见调查报告 P2-8;
- **ESM 值导入**(均在懒加载工具视图 chunk 内,不进入口):`PresetMessageEditor.vue:326`、`QuickActionDetail.vue:27`、`web-canvas/CanvasMonacoEditor.vue:3`、`web-canvas/MonacoModelManager.ts:1`;
- **纯类型导入**(编译期擦除):`RichCodeEditor.vue:52`、`FilePreview.vue:77`、`useTextDiff.ts:2`。

已验证兼容性:ESM 消费方使用内置主题名(`CanvasMonacoEditor.vue:21`:`isDark ? "vs-dark" : "vs"`)。移除 stream-monaco 后 `shikiToMonaco` 劫持不再安装,内置主题名**恢复原生可用**,正是 `monacoShikiSetup` 当初要绕的坑自行消失。

## 二、改动清单

### 2.1 删除文件

| 文件                                                                              | 说明                                                                          |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `src/utils/monacoShikiSetup.ts`                                                   | 整文件删除(`initMonacoShikiThemes`/`isMonacoShikiReady` 仅 appInitStore 消费) |
| `src/tools/rich-text-renderer/components/nodes/code-block/MonacoSourceViewer.vue` | 整文件删除                                                                    |

注:`MonacoSourceViewer` 里的 `ensureMonacoPassiveTouchListeners` 全局补丁(`:92-124`)随之消失。它按 `.closest(".monaco-editor")` 匹配所有 Monaco 实例,但只在消息代码块初始化时才安装——未渲染过代码块的会话里 RichCodeEditor 本就运行在无补丁状态,故不构成回退;若后续 AMD Monaco 出现 touchstart 告警,再在 RichCodeEditor 侧按需恢复。

### 2.2 `appInitStore.ts`

- 删除 `:13` 的 `import { initMonacoShikiThemes } from "@/utils/monacoShikiSetup"`;
- `initMainApp`:删除 `:68-70`(30% "初始化编辑器主题" 一步),后续 setProgress 百分比顺延微调;
- `initDetachedApp`:删除 `:139-141`(35% 同名步骤)。

### 2.3 `CodeBlockNode.vue` 简化

- 模板 `:43-66`:删除双引擎分支,固定渲染 `CodeMirrorSourceViewer`;
- 删除 `:120` 的 `import MonacoSourceViewer`;
- `:46` 不再读取 `context?.codeEditorEngine`。

### 2.4 `codeEditorEngine` 设置退役

采用**移除管线、容忍存量值**策略(避免给老配置写迁移):

- `types/settings.ts:191` 类型字段与 `:363` 默认值:删除字段;llm-chat 设置加载对多余键是宽容合并,存量 `uiPreferences.codeEditorEngine: "monaco"` 残留在用户 JSON 中无害,可不清理;
- `settingsConfig.ts:579-593`:删除该设置项;
- 6 处 llm-chat 透传绑定、`RichTextRenderer.vue` 的 prop/默认值/context 注入、`types.ts` 两处接口字段:全部删除;
- 测试器(`RichTextRendererTester.vue`、`TesterConfigSidebar.vue:122` 的切换器):删除引擎选择器与对应 ref。

> 备选方案(若想保守):保留类型与设置键,仅把 `CodeBlockNode` 改为无视该值。不推荐——会留下一个永远不生效的设置项 UI。

### 2.5 语言映射补缺(`src/utils/codeLanguages.ts`)

为对齐原 Shiki 预热清单(`monacoShikiSetup.ts:28-52` 的 23 种语言),补 4 个映射,全部走 `@codemirror/legacy-modes`(已确认 mode 文件存在):

| 语言                            | 实现                                                                                     |
| ------------------------------- | ---------------------------------------------------------------------------------------- |
| `c`                             | `mode/clike` 的 `c`(注意:现有 `cpp` 条目别名只有 `["cpp","cxx"]`,`c` 目前静默回退纯文本) |
| `toml`                          | `mode/toml`                                                                              |
| `lua`                           | `mode/lua`                                                                               |
| `powershell`(别名 `ps1`/`pwsh`) | `mode/powershell`                                                                        |

可选加分项:`diff`(`mode/diff`)、`ini/properties`(`mode/properties`)——聊天场景常见。

### 2.6 依赖与配置清理

- `package.json`:删除 `stream-monaco`(:172)、`shiki`(:170),`bun install` 刷新 lockfile;
- `monaco-editor`(:162)、`@guolao/vue-monaco-editor`、`@tomjs/vite-plugin-monaco-editor`、全部 `@codemirror/*`、`@uiw/codemirror-theme-vscode`:保留;
- `vite.config.ts` 不动(monaco-i18n NLS 劫持、`optimizeDeps.exclude: ["monaco-editor"]` 服务于保留的 AMD/ESM Monaco)。

### 2.7 文档同步

- `rich-text-renderer/ARCHITECTURE.md`、`llm-chat/docs/architecture/composables-reference.md`:删去 MonacoSourceViewer/双引擎描述;
- `docs/Plan/app-startup-optimization-investigation.md` P0-2:标注"已升级为移除方案,见本文档";
- `rich-text-renderer/docs/Plan/performance-optimization-investigation.md` 中涉及 stream-monaco 的条目如有,加一行落地说明;
- 用户文档 `docs/user-guide/tools/llm-chat/settings/rendering.md` 若描述了引擎选择,同步删除。

### 2.8 顺手项(可选,不阻塞)

- `PreCodeNode.vue` 的 `theme="monaco"` 变体样式成为死代码,可清理;
- `rich-text-renderer` store 的 `debugPreFallback` 仍被 CodeMirror viewer 使用,保留。

## 三、风险与边界

1. **高亮保真度**:Lezer/legacy-modes 的着色细腻度低于 Shiki(TextMate)。考虑到消息代码块是只读展示、用户已实测接受 CodeMirror 观感,并且默认引擎本就是 CM(绝大多数用户当前看到的就是 CM 效果),风险可控。
2. **流式更新方式**:CM viewer 是全文 `dispatch` 替换(`CodeMirrorSourceViewer.vue:201-217`)而非 stream-monaco 的增量 applyEdits;实测性能反而更好,代码块量级下无压力。
3. **存量设置值**:选了 "monaco" 的用户静默回到 CodeMirror,符合"该选项本就标注 CM 更快"的语义,无需提示。
4. **明确不在本方案范围**(避免误解为已解决):
   - AMD Monaco 的 head 同步脚本、309KB 阻塞 CSS、`editor.main.nls.js` 404(调查报告 P2-8);
   - codemirror(vendor-editor 1.23MB)经 plugin-ui eager glob 仍在入口(P0-1);
   - 其余启动项(P1-5/P1-6 等)。

## 四、实施顺序与验证

建议单 PR,提交粒度:

1. 补语言映射(2.5)——独立可合,先行;
2. 删 MonacoSourceViewer + CodeBlockNode 简化 + 设置管线退役(2.1/2.3/2.4);
3. 删 monacoShikiSetup + appInitStore 两处调用(2.1/2.2);
4. 依赖清理 + 文档同步(2.6/2.7)。

验证:

```bash
bun run build:tsc          # 类型检查:确认无残留引用
bun run test:run           # 单测回归
bun run build              # 产物验证(下一步)
```

产物断言(对照调查报告附录的统计脚本):

- `dist/index.html` 的 modulepreload 列表中 **`editor.api2-*.js` 消失**,启动资源总量较 18,363,590 B 下降 ≥ 3.5 MB;
- `dist/assets` 中不再出现 shiki 语法/wasm chunk(搜 `oniguruma`/`textmate` 关键字);
- `vendor-vue` 体积显著回落(其中误并的 Shiki vue 系语法随移除消失——manualChunks 修复前的额外红利)。

运行态验证(`bun run t:d`):

- 含多语言代码块(含 c/toml/lua/powershell)的会话正常高亮、流式渲染、折叠/换行/字号正常;
- 设置页不再出现"代码编辑器引擎"项,老配置启动无报错;
- RichCodeEditor(如 llm-chat Agent 编辑器)、web-canvas Monaco 编辑器、text-diff 工具正常,主题随明暗切换正确(验证劫持消失后内置主题可用);
- 分离窗口打开 llm-chat,代码块渲染正常(`initDetachedApp` 路径)。

回滚:无数据迁移、无格式变更,`git revert` 单 PR 即可完整回退。
