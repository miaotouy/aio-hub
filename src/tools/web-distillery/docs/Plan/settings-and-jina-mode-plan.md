# 网页蒸馏室：全局设置页基础与显式 Jina 模式实施计划

> **文档状态**：Ready for Review  
> **制定时间**：2026-10-01  
> **模块路径**：`src/tools/web-distillery/`  
> **关联架构**：[`src/tools/web-distillery/ARCHITECTURE.md`](../../ARCHITECTURE.md)

---

## 1. 背景与目标

网页蒸馏室（Web Distillery）目前具备 `fast`（本地 Rust wreq TLS 模拟）与 `smart`（本地 Axum 代理 + WebView2 沙箱渲染）两种本地提取模式，以及可视化交互配方系统。

然而，目前系统存在以下两个关键断层：

1. **缺少设置管理基础设施**：虽然已有 `settings.json` 保存了 `lastUrl` 等少数字段，但缺乏直观的可视化设置页面来维护全局配置（例如第三方 API 凭证、默认超时时间、网络代理与默认提取行为等）。
2. **缺乏轻量云端高质量提取模式**：面对复杂外网站点、学术文献、长文博客或移动端环境时，本地 WebView 方案较重且容易受复杂网络环境影响。**Jina Reader (`r.jina.ai`)** 能提供免本地渲染、零算力开销、高质量 Markdown 输出的能力。

为保证系统架构清晰、数据流向透明，本计划不采用“隐式自动回退（Fallback）”，而是**将 Jina Reader 作为第一公民的显式模式（`jina` 模式）**引入。

调研应用已有实践（如 `transcription`、`knowledge-base`、`llm-chat` 等模块的配置中心）后，网页蒸馏室应采纳**一级 Tab 视图分仓（模式 A）**，以保持多工作台类工具架构的一致性。

施工分为前后相承的两个阶段：

- **阶段一（Phase 1）**：蒸馏室设置体系重构与可视化设置页接入（对齐项目通用配置管理、防抖落盘与交互规范）。
- **阶段二（Phase 2）**：显式 Jina 模式全链路落地（类型系统、请求通道、UI 工作台、Agent 注册）。

---

## 2. 施工分段总览

```
┌────────────────────────────────────────────────────────┐
│ Phase 1: 补充设置页基础 (Settings Infrastructure)     │
├────────────────────────────────────────────────────────┤
│ • 扩展 WebDistilleryConfig 并对齐 Store 响应式状态     │
│ • 新增设置组件 SettingsPanel.vue (第 6 个 Tab)         │
│ • 遵循平台规范：saveDebounced 防抖落盘与一键重置确认   │
│ • 密码掩码与 Jina API 连通性预检测试                   │
└──────────────────────────┬─────────────────────────────┘
                           │ 准备好凭证与全局配置环境
┌──────────────────────────▼─────────────────────────────┐
│ Phase 2: 追加显式 Jina 模式 (Explicit Jina Mode)       │
├────────────────────────────────────────────────────────┤
│ • 类型系统扩展 (DistillMode = 'fast'|'smart'|'jina'...)│
│ • 请求管道封装 (actions.ts -> jinaFetch)               │
│ • Agent 门面扩充 (web-distillery.registry.ts)          │
│ • 工作台 UI 改造 (BrowserToolbar & PreviewPanel)       │
│ • 移动端适配与验证                                     │
└────────────────────────────────────────────────────────┘
```

---

## 3. 详细设计与两段施工规范

### 阶段一：补充设置页基础 (Phase 1)

#### 3.1 配置数据结构扩展 (`stores/store.ts` & `types.ts`)

扩展现有 [`src/tools/web-distillery/stores/store.ts`](../../stores/store.ts:19) 中的 `WebDistilleryConfig`：

```typescript
export interface WebDistilleryConfig {
  // 基础运行状态
  lastUrl: string;
  defaultMode: "fast" | "smart" | "jina";
  defaultFormat: "markdown" | "text" | "html" | "json";
  defaultCleanMode: boolean; // 是否默认启用纯净模式（去除所有外链）

  // Jina 专有设置
  jina: {
    apiKey: string; // Jina Reader API Key (可选，留空走 20 RPM 免费限额)
    engine: "default" | "readerlm-v2"; // 提炼引擎，可选 ReaderLM-v2 (专用1.5B模型)
    withGeneratedAlt: boolean; // 是否启用图像智能描述生成 (X-With-Generated-Alt)
    targetSelector?: string; // 默认提取选择器 (X-Target-Selector)
    waitForSelector?: string; // 默认等待选择器 (X-Wait-For-Selector)
    removeSelector?: string; // 默认剔除选择器 (X-Remove-Selector)
  };

  // 抓取与网络偏好
  network: {
    timeout: number; // 抓取超时时间 (ms，默认 15000)
    maxAutoScrolls: number; // 智能模式默认自动滚动次数 (默认 3)
    scrollDelay: number; // 智能模式滚动延迟 (ms，默认 800)
  };

  // 规则过滤
  extractionRules: {
    include: string[];
    exclude: string[];
  };
}
```

##### Store 配置状态改造 (`stores/store.ts`)

结合 `useTranscriptionStore` 与 `knowledgeRuntimeConfigManager` 的实践，改造现有 Store 状态管理：

1. **Pinia 状态挂载**：在 `state` 中显式挂载响应式 `config: WebDistilleryConfig`。
2. **初始化与加载**：在 `store.init()` 中通过 `configManager.load()` 加载完整配置对象。
3. **防抖与自动持久化**：
   - 提供 `updateConfig(partial: Partial<WebDistilleryConfig>)` 动作；
   - 表单高频输入或参数变动时统一调用 `configManager.saveDebounced(this.config)`（默认 500ms），避免高频触发 IPC 和磁盘 I/O。
4. **一键重置动作**：提供 `resetConfig()`，恢复到 `createDefault()` 生成的基线默认值并持久化。

#### 3.2 UI 结构调整：新增设置 Tab (`WebDistillery.vue`)

在 [`src/tools/web-distillery/WebDistillery.vue`](../../WebDistillery.vue:73) 的 `el-tabs` 结构中新增第 6 个 Tab `settings`：

```vue
<!-- 设置 Tab -->
<el-tab-pane name="settings">
  <template #label>
    <div class="tab-label">
      <el-icon><Settings /></el-icon>
      <span>偏好设置</span>
    </div>
  </template>
  <div class="tab-content-padded">
    <SettingsPanel />
  </div>
</el-tab-pane>
```

#### 3.3 新增设置面板组件 (`components/settings/SettingsPanel.vue`)

参考 `TranscriptionSettings.vue` 与 `knowledge-base/views/SettingsView.vue` 的设计规范，面板采用“顶部控制条 + 分组结构化卡片”体系：

##### 头部控制栏 (Settings Header)

- 包含模块标题与职能简介。
- 右侧配备 **“一键重置 (RotateCcw)”** 危险操作按钮，调用 `ElMessageBox.confirm` 进行二次确认。
- **重要规范约束**：根据项目核心开发规范，`ElMessageBox.confirm` **必须显式设置 `lockScroll: false`**，严防 Tauri 窗口产生视口抖动和多余滚动条。

##### 三大配置卡片

容器采用项目标准主题变量（背景 `var(--card-bg)`，毛玻璃 `backdrop-filter: blur(var(--ui-blur))`，边框 `var(--border-width) solid var(--border-color)`）：

1. **Jina Reader 云端引擎配置**：
   - **Jina API Key**：使用 `el-input`，配置 `type="password"` 与 `show-password` 支持掩码切换，严格遵循日志安全协议，禁止在任何 Logger 中明文打印完整 Key。
   - **连通性测试按钮**：输入框后紧随“测试连接”按钮，带有 loading 状态指示与测试结果 Tag/消息提示。
   - **模型引擎选择**：下拉框支持 `default` 与 `readerlm-v2`（附带说明标签）。
   - **图像智能描述**：开关控件绑定 `withGeneratedAlt`。
   - **官方凭据申请**：内联提供官方获取引导链接（`https://jina.ai/reader`），支持系统外部浏览器唤起。
2. **蒸馏默认行为偏好**：
   - 默认提取模式单选/下拉（快速 / 智能 / Jina）。
   - 默认输出格式（Markdown / Text / HTML / JSON）。
   - 纯净模式默认开关（去除 Markdown 外链）。
3. **网络与本地渲染控制**：
   - 快速请求超时时间（带滑块与数字输入框，范围 5000ms - 60000ms）。
   - 智能模式沙箱渲染等待与最大滚动次数。

#### 3.4 连通性测试与防抖保存

- **防抖保存**：任何表单输入变动，触发 `store.updateConfig`，底层经由 [`createConfigManager`](@/utils/configManager.ts) 的 `saveDebounced`（500ms）在后台平滑保存。
- **连通性测试**：提供 `testJinaConnection(apiKey)` 工具函数，通过向 `https://r.jina.ai/https://example.com` 发起轻量预检请求，向用户反馈 Key 有效性与速率限制状态。

---

### 阶段二：追加显式 Jina 模式 (Phase 2)

#### 3.5 类型定义扩展 (`types.ts`)

在 [`src/tools/web-distillery/types.ts`](../../types.ts:27) 中：

```typescript
export type DistillMode = "fast" | "smart" | "jina" | "interactive";

export interface JinaFetchOptions {
  url: string;
  format?: FetchFormat;
  engine?: "default" | "readerlm-v2";
  apiKey?: string;
  cleanMode?: boolean;
  withGeneratedAlt?: boolean;
  targetSelector?: string;
  waitForSelector?: string; // 对应的标准头为 X-Wait-For-Selector
  removeSelector?: string; // 对应的标准头为 X-Remove-Selector
  timeout?: number;
}
```

#### 3.6 核心请求通道实现 (`actions.ts`)

在 [`src/tools/web-distillery/actions.ts`](../../actions.ts) 中增加 `jinaFetch`：

```typescript
export async function jinaFetch(
  options: JinaFetchOptions,
  context?: ToolContext
): Promise<FetchResult> {
  logger.info("Starting jinaFetch", { url: options.url });
  context?.reportStatus("正在通过 Jina Reader 云端引擎提炼内容...");

  return (await errorHandler.wrapAsync(
    async () => {
      const store = useWebDistilleryStore();
      const config = store.config;
      const apiKey = options.apiKey || config.jina.apiKey;
      const timeoutMs = options.timeout || config.network.timeout || 20000;

      const targetFormat = options.format || config.defaultFormat || "markdown";
      const headers: Record<string, string> = {
        Accept: "text/event-stream, text/plain, */*",
        "X-Respond-With": targetFormat, // 官方规范主要控制头
        "X-Return-Format": targetFormat, // 兼顾向后兼容
        "X-Timeout": String(Math.round(timeoutMs / 1000)), // 秒级超时头
      };

      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey.trim()}`;
      }

      // 引擎选择 (支持 ReaderLM-v2)
      const engine = options.engine || config.jina.engine;
      if (engine && engine !== "default") {
        headers["X-Engine"] = engine;
      }

      if (options.withGeneratedAlt ?? config.jina.withGeneratedAlt) {
        headers["X-With-Generated-Alt"] = "true";
      }
      if (options.targetSelector) {
        headers["X-Target-Selector"] = options.targetSelector;
      }
      // 修正：官方标准头为 X-Wait-For-Selector
      if (options.waitForSelector) {
        headers["X-Wait-For-Selector"] = options.waitForSelector;
      }
      // 支持直接在服务端剥离广告或干扰元素
      if (options.removeSelector) {
        headers["X-Remove-Selector"] = options.removeSelector;
      }

      // 统一通过 Rust 端的通用 HTTP 客户端代理请求，避开前端 CORS 与 CSP 约束
      const jinaTargetUrl = `https://r.jina.ai/${options.url.trim()}`;
      const payload = await invoke<RawFetchPayload>("distillery_quick_fetch", {
        url: jinaTargetUrl,
        options: {
          url: jinaTargetUrl,
          timeout: timeoutMs,
          headers,
        },
      });

      if (payload.statusCode >= 400) {
        throw new Error(`Jina Reader 响应异常: HTTP ${payload.statusCode}`);
      }

      let finalContent = payload.html;
      // 如果启用了 cleanMode，执行轻量纯文本净化（去除纯链接语法）
      if (options.cleanMode ?? config.defaultCleanMode) {
        finalContent = stripMarkdownLinks(finalContent);
      }

      return {
        url: options.url,
        title: extractTitleFromMarkdown(finalContent) || options.url,
        content: finalContent,
        contentLength: finalContent.length,
        format: (options.format as FetchFormat) || "markdown",
        quality: 0.95,
        mode: "jina",
        fetchedAt: getLocalISOString(),
        domSnapshot: payload.html,
      };
    },
    {
      userMessage: "Jina 提取失败，请检查网络连接或 API Key 有效性",
    }
  )) as FetchResult;
}
```

#### 3.7 Agent 注册与能力暴露 (`web-distillery.registry.ts`)

在 [`src/tools/web-distillery/web-distillery.registry.ts`](../../web-distillery.registry.ts) 中增加 `jinaFetch` 方法，并为 LLM Agent 注入精确方法契约：

```typescript
// WebDistilleryRegistry
public async jinaFetch(
  args: Record<string, unknown>,
  context?: ToolContext
): Promise<string> {
  const result = await jinaFetch({
    url: String(args.url || ""),
    format: (args.format as any) || "markdown",
    cleanMode: coerceAgentBoolean(args.cleanMode),
  }, context);
  if (!result) return "错误: Jina Reader 提炼失败。";
  return formatFetchResult(result);
}
```

方法元数据注入：

- 方法名：`jinaFetch`
- 显示名：`Jina 云端网页提炼`
- 描述：`使用 Jina Reader 云端高精度引擎将目标网页转换为极简干净的 Markdown。免浏览器开销，适合抓取公开文档、博客、技术文章与学术资料。`

#### 3.8 工作台 UI 改造

1. **`BrowserToolbar.vue` 按钮组**：
   - 提取模式选择器中增加：
     - ⚡ **快速 (本地)**
     - 🧠 **智能 (本地)**
     - 🌐 **Jina (云端)**
   - 旁边配有直观的 Tooltip 提示各自特征（“Jina 模式：由 r.jina.ai 解析，高保真输出 Markdown”）。
2. **`PreviewPanel.vue` & 右侧信息栏**：
   - 模式标签显示为专属的彩色 Badge：`JINA`（使用专属中性偏蓝主题色）。
   - 保留“发送到聊天（Send to Chat）”与“复制 Markdown”等通用操作。

---

## 4. 实施文件变更清单

| 文件路径                                                                 |  变更阶段   | 变更性质 | 职责与变更内容                                                                            |
| :----------------------------------------------------------------------- | :---------: | :------: | :---------------------------------------------------------------------------------------- |
| `src/tools/web-distillery/types.ts`                                      | Phase 1 & 2 |   修改   | 增加 `jina` 到 `DistillMode`，增加 `JinaFetchOptions` 与 `WebDistilleryConfig` 接口定义。 |
| `src/tools/web-distillery/stores/store.ts`                               | Phase 1 & 2 |   修改   | 扩展配置状态，实现配置的加载、保存及与 UI 的双向绑定。                                    |
| `src/tools/web-distillery/components/settings/SettingsPanel.vue`         |   Phase 1   |   新增   | 全局设置面板（Jina Key、提取偏好、网络超时）。                                            |
| `src/tools/web-distillery/WebDistillery.vue`                             |   Phase 1   |   修改   | Tab 导航中注册 `settings` 标签页与图标。                                                  |
| `src/tools/web-distillery/actions.ts`                                    |   Phase 2   |   修改   | 实现 `jinaFetch` 逻辑，处理请求头构建与 Markdown 包装。                                   |
| `src/tools/web-distillery/web-distillery.registry.ts`                    |   Phase 2   |   修改   | 暴露 `jinaFetch` 给 Agent，完善 ServiceMetadata。                                         |
| `src/tools/web-distillery/components/distillery/BrowserToolbar.vue`      |   Phase 2   |   修改   | 增加 Jina 模式切换与触发按钮。                                                            |
| `src/tools/web-distillery/components/distillery/DistilleryWorkbench.vue` |   Phase 2   |   修改   | 接入 `jina` 模式调度与分发分支。                                                          |
| `src/tools/web-distillery/ARCHITECTURE.md`                               |   Phase 2   |   修改   | 同步更新架构文档，记录四模式模型与设置体系。                                              |

---

## 5. 验收标准与验证方案

### 阶段一验收项

- [ ] 切换到新增的“偏好设置”Tab，界面各卡片布局整齐，符合项目主题与毛玻璃风格。
- [ ] 修改 Jina API Key、默认格式等参数后，刷新页面配置正确持久化（经由 `saveDebounced` 500ms 防抖落盘）。
- [ ] API Key 字段具备密码掩码切换；点击“测试连接”按钮能发起轻量预检并给出明确状态反馈。
- [ ] 点击“一键重置”弹出二次确认弹窗（已设置 `lockScroll: false`，无窗口跳动），确认后恢复默认配置。

### 阶段二验收项

- [ ] **UI 触发验证**：在蒸馏工作台输入目标 URL（如公开文档或博客），选择 `Jina` 模式点击蒸馏，能成功返回格式规整的 Markdown 正文，信息侧栏准确标注为 `模式: jina`。
- [ ] **未填 Key 优雅运行**：未配置 Key 时以默认 20 RPM 免费限额正常执行；配置有效 Key 后请求头自动携带 Bearer Token。
- [ ] **X-Wait-For-Selector 动态内容验证**：对于需要等待前端异步水合的页面，传入选择器后能准确等待 DOM 渲染完成并提取完整内容。
- [ ] **X-Respond-With 多格式验证**：覆盖 `markdown` 与 `text` 等不同格式返回，验证响应格式与预期完全一致。
- [ ] **Agent 调用验证**：通过 `WebDistilleryRegistry.jinaFetch` 调用，能成功返回清洗后的正文字符串，状态追踪正常上报。
- [ ] **类型与构建检查**：执行 `bun run check:frontend` 无 TypeScript 类型报错，生产打包构建无破损。
