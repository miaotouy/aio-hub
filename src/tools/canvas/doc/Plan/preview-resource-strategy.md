# Canvas 预览资源策略决策文档

> **状态**: RFC (Request for Comments)
> **背景**: 当前 Canvas 的 `srcdoc` 内联预览模式无法加载相对路径资源（图片、字体等），导致需要一个"物理预览"按钮作为补丁。本文档分析两个大方向的利弊，供决策。

## 1. 问题本质

当前 `useCanvasPreview.ts` 的 `buildSrcdoc()` 只内联了 CSS 和 JS 引用，**完全没有处理其他资源的相对路径**。

iframe 加载 `srcdoc` 时，其 base URL 是 `about:srcdoc`，所以：

- `<img src="./logo.png">` → 请求 `about:./logo.png` → **404**
- `fetch('./data.json')` → 请求 `about:./data.json` → **404**
- `url(bg.jpg)` in CSS → **404**

而项目中早已有成熟的虚拟协议资源加载方案（参见 `agentAssetUtils.ts` 中的 `convertFileSrc`），完全可以复用。

## 2. 方向 A：完善虚拟文件系统（增强 srcdoc 模式）

### 核心思路

保持现有的 `pendingUpdates` 影子文件架构不变，增强 `buildSrcdoc()` 的资源处理能力。

### 实施方案

#### A1. 注入 `<base>` 标签（最小改动）

```typescript
// useCanvasPreview.ts - buildSrcdoc() 中追加
function injectBaseTag(html: string, basePath: string): string {
  const baseUrl = convertFileSrc(basePath.replace(/\\/g, "/")) + "/";
  return html.replace(/<head[^>]*>/i, (match) => match + `\n<base href="${baseUrl}">`);
}
```

**优点**：

- 改动量极小（约 5 行代码）
- 一次性解决所有静态资源的相对路径（`<img>`、`<video>`、`<link>`、CSS `url()` 等）
- 甚至能解决 JS 中 `fetch('./data.json')` 等动态请求（因为 `<base>` 会影响所有相对 URL 的解析）

**风险**：

- `<base>` 在 `srcdoc` iframe 中的行为需要验证（Tauri 的 `asset://` 协议是否支持作为 base）
- 如果 `<base>` 生效，那么内联的 CSS/JS 中的相对路径也会被重定向，但由于我们已经内联了内容，这不会造成问题
- `<base>` 只能有一个，如果用户的 HTML 里自己写了 `<base>`，会冲突

#### A2. 正则替换资源路径（更稳健）

```typescript
// 扫描 HTML 中的 src/href/poster/data 等属性，转换相对路径
function resolveResourcePaths(html: string, basePath: string): string {
  const baseUrl = convertFileSrc(basePath.replace(/\\/g, "/"));
  // 匹配 src="..." / href="..." 中的相对路径（排除已内联的 CSS/JS、http、data:、#）
  return html.replace(
    /(src|href|poster|data)=["'](?!https?:|data:|#|javascript:)([^"']+)["']/gi,
    (match, attr, path) => `${attr}="${baseUrl}/${path}"`,
  );
}

// 同时处理 CSS 中的 url()
function resolveCssUrls(css: string, basePath: string): string {
  const baseUrl = convertFileSrc(basePath.replace(/\\/g, "/"));
  return css.replace(/url\(["']?(?!https?:|data:)([^"')]+)["']?\)/gi, (match, path) => `url("${baseUrl}/${path}")`);
}
```

**优点**：

- 不依赖 `<base>` 标签的浏览器行为
- 可以精确控制哪些路径需要转换

**缺点**：

- 正则永远有遗漏（模板字符串、JS 动态拼接的路径等）
- CSS 内联后需要额外处理 `url()` 引用
- 维护成本较高

#### A3. 混合方案（推荐）

```
注入 <base> 标签（处理动态请求和遗漏的静态资源）
  + 正则替换（处理已内联的 CSS 中的 url()）
```

### 对现有架构的影响

| 模块                    | 影响                                         |
| ----------------------- | -------------------------------------------- |
| `useCanvasPreview.ts`   | 修改 `buildSrcdoc()`，增加资源路径处理       |
| `canvasStore.ts`        | **无影响**                                   |
| `useCanvasSync.ts`      | **无影响**                                   |
| `CanvasPreviewPane.vue` | **无影响**                                   |
| `CanvasFloatingBar.vue` | 可选：移除"物理预览"按钮，或保留作为高级选项 |
| 审批系统                | **无影响**（pendingUpdates 机制不变）        |

### 残留问题

即使完善了资源路径处理，`srcdoc` 模式仍然有一个**根本性限制**：

- **影子文件中的新资源无法预览**：如果 Agent 在影子文件中写了 `<img src="new-image.png">`，但 `new-image.png` 还没有物理落盘（它只是文本文件，不是二进制资源），图片仍然无法显示。
- 不过这个问题在实际场景中很少发生——Agent 通常引用的是已存在的资源文件，或者外部 URL。

---

## 3. 方向 B：放弃虚拟文件，直接操作物理文件

### 核心思路

取消 `pendingUpdates` 内存缓存层。Agent 的每次修改**直接写入物理磁盘**，预览始终使用 `physical` 模式。用 Git 来实现撤销和审批。

### 实施方案

```
Agent 调用 write_canvas_file / apply_canvas_diff
  → 直接调用 storage.writePhysicalFile()
  → Git 自动暂存（或用 working tree 的 dirty 状态）
  → FS Watcher 检测变化 → 通知预览窗口刷新 iframe.src
  → 用户不满意 → git checkout / git stash pop 回退
```

### 对现有架构的影响

| 模块                        | 影响                                                                                                                                                                                 |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `canvasStore.ts`            | **重写**：移除 `pendingUpdates`、`undoStacks`、`previewSnapshots`；`writeFile` 改为直接调物理写入；`commitChanges` 简化为 `git add + commit`；`discardChanges` 改为 `git checkout .` |
| `useCanvasPreview.ts`       | **大幅简化**：移除 `buildSrcdoc()`、`resolveFileContent()`、`inlineCssReferences()` 等所有 VFS 合并逻辑；只保留 `buildPhysicalPreview()`                                             |
| `useCanvasSync.ts`          | **简化**：移除 Layer 2（影子文件同步）和 Layer 3（增量推送通道）；改为通知预览窗口"文件已变更，请刷新"                                                                               |
| `useCanvasStateConsumer.ts` | **简化**：不再需要接收 pendingUpdates                                                                                                                                                |
| `CanvasPreviewPane.vue`     | **简化**：移除 `srcdoc` 分支，只保留 `src`                                                                                                                                           |
| `CanvasFloatingBar.vue`     | **简化**：移除"切换预览模式"按钮                                                                                                                                                     |
| `CanvasEditorPanel.vue`     | 编辑器保存时直接写磁盘（而非写入影子文件）                                                                                                                                           |
| `PendingChangesBar.vue`     | 改为显示 Git working tree 的 dirty 文件列表                                                                                                                                          |
| `canvas.registry.ts`        | 工具调用接口改为直接物理写入                                                                                                                                                         |
| 审批系统钩子                | **需要重新设计**：`writeFileAsPreview` / `revertPreview` 需要用 Git 操作替代                                                                                                         |
| `GitInternalService.ts`     | 需要增加 `checkout`、`stash`、`diff` 等方法                                                                                                                                          |

### 审批系统重设计

```
Agent 调用 write_canvas_file (审批模式)
  → 直接写入物理文件
  → git add (暂存)
  → 预览窗口立即看到效果（包括图片！）

用户批准 → git commit
用户拒绝 → git checkout -- <file> (恢复到上次 commit 的状态)
```

这比现在的 `previewSnapshots` 机制更简单、更可靠，而且天然支持多文件原子回退。

### 性能考量

| 场景                 | 当前 (VFS)                 | 方向 B (物理)                    |
| -------------------- | -------------------------- | -------------------------------- |
| Agent 单次修改       | 内存写入 ~0ms              | 磁盘写入 ~5-15ms                 |
| Agent 连续 10 次修改 | 内存写入 ~0ms              | 磁盘写入 ~50-150ms（可防抖）     |
| 预览刷新             | 需要 VFS 合并 + 内联 ~50ms | 直接刷新 iframe.src ~5ms         |
| 大文件跨窗口同步     | 需要序列化传输 ~20ms       | 不需要传输，FS Watcher 通知 ~1ms |

**结论**：虽然磁盘 IO 增加，但省去了 VFS 合并和跨窗口同步的开销，**整体性能可能更好**。特别是 SSD 环境下，小文件写入几乎无感。

---

## 4. 对比总结

| 维度             | 方向 A：完善 VFS          | 方向 B：物理文件优先                     |
| ---------------- | ------------------------- | ---------------------------------------- |
| **改动量**       | 小（~50 行）              | 大（重构核心模块）                       |
| **资源加载**     | 静态资源 ✅，动态请求 ⚠️  | 全部 ✅                                  |
| **实时预览**     | ✅ 影子文件即时生效       | ✅ 磁盘写入后即时生效（~5ms 延迟）       |
| **审批系统**     | 无需改动                  | 需要用 Git 操作替代                      |
| **架构复杂度**   | 维持现状（三层同步）      | 大幅降低（去掉两层同步）                 |
| **跨窗口同步**   | 需要同步影子文件          | 不需要（FS Watcher）                     |
| **Undo 机制**    | 内存快照栈                | Git checkout                             |
| **外部工具协作** | VSCode 看不到未提交的修改 | VSCode 实时看到所有修改                  |
| **多页面应用**   | ❌ 不支持页面间跳转       | ✅ 天然支持                              |
| **风险**         | `<base>` 兼容性未验证     | 需要验证 isomorphic-git 的 checkout 性能 |

---

## 5. 硬件性能深度分析

在现代计算机系统（NVMe SSD + 高频 CPU）下，方向 B 的物理 IO 开销已经变得微乎其微，甚至在整体链路上可能比 VFS 方案更快。

### 5.1. 磁盘 IO 延迟 vs 链路总延迟

| 操作阶段             | 预计耗时 (物理模式) | 备注                           |
| :------------------- | :------------------ | :----------------------------- |
| **磁盘写入 (SSD)**   | ~0.05ms - 0.2ms     | 现代 SSD 的随机写入延迟极低    |
| **Tauri IPC 往返**   | ~1ms - 3ms          | 前端到 Rust 的通信开销         |
| **FS Watcher 通知**  | ~1ms - 5ms          | 操作系统检测到变更的延迟       |
| **iframe 刷新/渲染** | ~10ms - 50ms        | **主要瓶颈**，取决于页面复杂度 |

**结论**：磁盘写入仅占整个链路耗时的不到 1%。

### 5.2. 为什么物理模式可能更快？

当前的 VFS 方案虽然是"内存写入"，但它背负了沉重的**软件层开销**：

1.  **VFS 合并**：每次预览都要遍历 `pendingUpdates` 并合并内容。
2.  **正则处理**：为了内联 CSS/JS，需要进行大量的正则匹配和字符串拼接。
3.  **序列化传输**：在跨窗口同步时，需要传输巨大的 HTML 字符串。

而物理模式直接利用操作系统的文件系统和浏览器的原生加载机制，省去了上述所有步骤。

---

## 6. 关于内置 Dev Server 的选型

方向 B 的本质是提供一个 dev server。我们不需要引入复杂的外部工具，利用现有基础设施即可实现。

### 6.1. 方案 A：Tauri `asset://` 协议 (推荐)

Tauri 原生支持 `asset://` 协议，它本质上就是一个**零配置的静态文件服务器**。

- **优点**：零额外依赖、自动处理 MIME 类型、相对路径天然支持、性能极高。
- **实现**：配合 FS Watcher + `postMessage` 触发 iframe 刷新即可实现类似 Live Reload 的效果。

### 6.2. 方案 B：微型 Axum 服务器

如果未来需要处理更复杂的 ES Module 引用或 `fetch()` 请求（避免 `asset://` 的跨域限制），可以利用项目中已有的 **Axum** 框架起一个微型 HTTP 服务。

- **优点**：真正的 HTTP 环境，支持 ESM。
- **代价**：极低（Axum 已经在项目中用于 LLM 代理）。

### 6.3. 为什么不需要迷你版 Vite/esbuild？

Agent 目前生成的 Canvas 内容以原生 HTML/CSS/JS 为主，不需要 TS/JSX 编译或 npm 模块解析。引入 Vite 等工具会增加 30MB+ 的打包体积和复杂的运行时管理，属于过度设计。

---

## 7. 咕咕的建议

### 短期（快速修复）：方向 A1

先注入 `<base>` 标签，用最小改动解决 80% 的资源加载问题。这是一个 5 分钟就能完成的修复，可以立即改善用户体验。

### 中长期（架构演进）：方向 B

如果 Canvas 模块要继续发展（支持更复杂的多文件项目、多页面应用、资源管理等），方向 B 是更健康的架构。它的核心优势是：

1. **彻底消除"两种预览模式"的割裂感** — 只有一种模式，就是真实文件预览
2. **大幅简化同步架构** — 去掉两层同步通道，降低维护成本
3. **天然支持所有资源类型** — 不需要针对每种资源类型写处理逻辑
4. **与外部工具无缝协作** — VSCode、浏览器 DevTools 看到的和预览一致

方向 B 的主要工作量在于重构 `canvasStore.ts` 和审批系统，但由于 `GitInternalService` 已经实现了基础的 Git 操作，增加 `checkout` 和 `stash` 的工作量可控。

### 本质：内置 Dev Server

方向 B 的架构本质上等同于我们日常开发使用的 `vite dev` / `webpack-dev-server`：

```
传统开发:  开发者改代码 → FS Watcher → HMR/刷新浏览器
Canvas B:  Agent 改代码 → FS Watcher → 刷新 iframe
```

触发源不同（人 vs Agent），但预览刷新链路完全一致。

这带来一个**隐藏的重大优势**：天然支持**多源编辑**。不管是 Agent 写的、用户在内置编辑器改的、还是用户在 VSCode 里改的，只要文件变了，预览就刷新。而当前的 VFS 架构做不到这一点——VSCode 的修改不会经过 `pendingUpdates`，预览窗口看不到外部修改。

这也意味着 Canvas 可以真正成为一个"**Agent + 人类协作的实时工作台**"，而不是一个只有 Agent 能写、人类只能看的单向展示窗。

---

## 6. 待决策项

1. **短期修复是否立即执行？** — 注入 `<base>` 标签，改善当前体验
2. **是否启动方向 B 的重构？** — 如果是，建议作为独立批次，与其他功能开发错开
3. **"物理预览"按钮是否保留？** — 如果方向 A 生效，可以降级为高级选项；如果走方向 B，直接移除
