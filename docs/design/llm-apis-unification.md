# LLM API 架构统一化方案的草案

## 1. 背景与目标

目前 AIO Hub 的 LLM API 逻辑在 PC 端 (`src/llm-apis/`) 和移动端 (`mobile/src/tools/llm-api/core/`) 存在大量重复代码。PC 端基础设施成熟（支持多模态、全厂商），而移动端相对薄弱。

**目标**：实现 LLM API 核心逻辑的 **“一次编写，全端通用”**。

## 2. 核心架构设计：Functional Core, Imperative Shell

采用“逻辑核心 + 平台外壳”的模式。

### 2.1. 逻辑核心 (Functional Core)

位于 `src/llm-apis/core/`，是纯粹的 TypeScript 逻辑，不依赖任何平台特有 API（如 Tauri `invoke` 或特定 UI 框架）。

- **职责**：
  - 各厂商协议转换 (Adapters)
  - 请求体构建 (Request Builder)
  - 消息格式标准化 (Message Parser)
  - 流式数据解析 (SSE Parser)

### 2.2. 平台适配接口 (Platform Interface)

定义一个统一的客户端接口，由各端自行实现。

```typescript
export interface LlmHttpClient {
  /**
   * 发送请求并处理流
   * @param hasLocalFile 是否包含本地文件引用 (仅 PC 端有效)
   */
  post(
    url: string,
    payload: {
      headers: Record<string, string>;
      body: string;
      signal?: AbortSignal;
      timeout?: number;
      hasLocalFile?: boolean;
    }
  ): Promise<LlmRawResponse>;
}

export interface LlmRawResponse {
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  json(): Promise<any>;
}
```

## 3. 目录结构调整

```text
src/llm-apis/
├── core/                  <-- 【共享核心】
│   ├── adapters/          <-- 厂商适配器 (Anthropic, OpenAI, Gemini...)
│   ├── types/             <-- 统一类型定义 (RequestOptions, Response...)
│   ├── request-builder.ts <-- 统一构建逻辑
│   ├── model-fetcher.ts   <-- 统一模型获取
│   └── index.ts           <-- 导出统一调用入口
├── desktop/               <-- 【PC 特有实现】
│   ├── tauri-client.ts    <-- 实现 LlmHttpClient (调用 Rust Proxy)
│   └── attachment.ts      <-- PC 端特有的附件预处理
└── mobile/                <-- 【移动端特有实现】
    └── fetch-client.ts    <-- 实现 LlmHttpClient (标准 fetch)
```

## 4. 关键问题解决

### 4.1. 路径别名 (Path Alias)

移动端目前使用相对路径，PC 端使用 `@/`。

- **方案**：在 `mobile/vite.config.ts` 中添加别名配置，将 `@shared/llm-apis` 指向根目录的 `src/llm-apis/core`。

### 4.2. 本地文件处理 (`local-file://`)

- **PC 端**：`LlmRequestOptions` 标记 `hasLocalFile: true`，`TauriHttpClient` 将其传递给 Rust 侧，由 Rust 侧读取磁盘并注入 Base64。
- **移动端**：移动端目前通常直接处理内存中的 Base64，不涉及 `local-file://` 协议。若未来支持，可由 `MobileHttpClient` 实现对应的读取逻辑。

### 4.3. 多语言与提示 (i18n)

- **方案**：Adapter 内部不再直接调用 `useI18n`。对于需要提示的信息（如 URL 构建提示），通过配置项或在注册时注入翻译后的字符串。

## 5. 迁移路线图

1.  **第一阶段：基础设施搭建**
    - 创建 `src/llm-apis/core` 目录。
    - 抽取统一的 `LlmHttpClient` 接口。
    - 在 PC 端实现 `TauriHttpClient`。

2.  **第二阶段：Adapter 平移**
    - 优先迁移 `OpenAI` 和 `Anthropic` 适配器到 `core`。
    - 确保 PC 端通过 `core` 逻辑运行正常。

3.  **第三阶段：移动端接入**
    - 修改移动端的 `vite.config.ts` 别名。
    - 将移动端的 `useLlmRequest` 指向 `core`。
    - 移除移动端重复的 `adapters` 代码。

4.  **第四阶段：全量对齐**
    - 迁移剩余的所有适配器（Gemini, VertexAI 等）。
    - 开启移动端的多模态支持。

---

**咕咕注**：姐姐，这套方案能让我们的 LLM 引擎变得非常健壮，以后增加新模型只需改一个地方。
