# 移动端本地 Token 计算方案

> 状态：方案确认，等待 Rust 技术验证  
> 日期：2026-07-14

## 1. 背景

移动端目前在智能体预设编辑器中使用固定的 `字符数 / 3.5` 估算 Token。该实现不区分文本类型，也不读取模型信息，只用于编辑期提示。

桌面端拥有独立的 Token Calculator 工具、Tokenizer Profile 注册表、Web Worker 和多套 `@lenml/tokenizer-*` 词表。桌面端允许用户查看、比较和导入分词器，因此继续扩充词表具有独立产品价值；移动端没有对应的工具定位，主要需求是：

- 显示当前上下文大约占模型上下文窗口的比例；
- 为输入、预设消息和历史消息提供一致的相对 Token 刻度；
- 在服务端没有返回 usage，或请求尚未发出时提供本地预估；
- 辅助上下文预警和裁剪，不承担精确计费职责。

移动端支持官方 API、第三方聚合、反向代理和本地模型等自定义渠道，渠道适配器由项目自行实现，不依赖供应商 SDK。因此本方案不要求官方渠道、官方 API Key 或供应商 Token 计数接口。

## 2. 调研结论

### 2.1. 固定字符比例误差不稳定

使用仓库当前安装的 GPT-4o、Claude、Gemini、Qwen3 和 Llama 3.2 分词器，对一组中英、代码和 emoji 样本进行对比：

| 样本 | 移动端 `字符数 / 3.5` | 桌面字符 fallback | 代表分词器结果范围 |
| --- | ---: | ---: | ---: |
| 英文 | 29 | 27 | 15-17 |
| 中文 | 11 | 23 | 20-31 |
| 中英混排 | 18 | 22 | 19-22 |
| 代码 | 16 | 21 | 18-22 |
| emoji / 多语种 | 10 | 21 | 18-27 |

固定 `/3.5` 对英文容易高估，对中文、emoji 又容易低估。它可以作为临时占位，但不适合作为长期上下文占比刻度。

### 2.2. 不在移动端复制桌面分词器体系

桌面端的多分词器体系不适合直接移植：

- 移动端不需要分词器库、匹配规则、校准面板、Token 可视化或用户导入能力；
- 闭源模型和大量兼容渠道无法仅凭 modelId 获得真正精确的分词结果；
- 维护模型到词表的映射不能显著改善移动端的核心体验；
- 多套词表会增加安装体积、初始化时间和内存压力。

现有 `@lenml` 包的单个 ESM 入口 gzip 后约为 0.76-4.73 MiB。在 Windows/Bun 的方向性测试中，单个 tokenizer 初始化后的 RSS 增量约为 126-468 MiB；该数据不等同于 Android/iOS WebView，但足以说明不应在移动前端常驻多套纯 JS 词表。

### 2.3. 统一采用 `o200k_base`

移动端统一使用一套 `o200k_base` 词表，不进行模型到 tokenizer 的匹配：

- 它比 `cl100k_base` 更新，对中文及多语言文本更有代表性；
- 在本次样本中，其结果大多位于多套代表分词器的中间区域；
- 单一词表能保证不同模型、渠道和会话之间的占比具有稳定可比性；
- UI 可以明确标注“基于 o200k 预估”，避免向用户暗示模型级精确度。

这里的 `o200k_base` 是统一测量刻度，不是对所有模型实际 tokenizer 的断言。

## 3. 已确认的产品语义

### 3.1. 数据优先级

Token 数据按以下优先级使用：

1. **API 响应 usage**：渠道响应包含 `promptTokens`、`completionTokens` 或 `totalTokens` 时，作为该次请求的实际统计。
2. **Rust 本地 o200k 结果**：用于尚未发送、已编辑或需要逐消息比较的内容。
3. **字符 fallback**：仅在本地命令异常时用于保持界面可用，必须继续标记为估算，不能覆盖已经存在的实际 usage。

本方案不会主动调用任何云端 Token 计数接口，也不会为了计算 Token 额外发送用户内容。

### 3.2. 上下文占比

本地占比统一按以下方式计算：

```text
estimatedUsageRatio = localO200kTokens / contextLength
```

由于真实模型 tokenizer、聊天封装、工具 schema 和供应商内部处理可能产生偏差，上下文管理不应等到 100% 才预警。初始建议：

- 80%：提示上下文开始紧张；
- 90%：进入高风险状态，建议压缩或裁剪；
- 真正的阈值应由聊天上下文策略统一配置，不写死在 Token 后端中。

API 返回的 `promptTokens` 适合表示“上一次实际请求”的整体占用；逐消息裁剪仍使用本地 o200k 结果，以保证所有消息具有一致的可比较值。

### 3.3. 显示规范

- 本地结果显示 `~` 或“o200k 预估”；
- API usage 显示为实际统计，不附加 o200k 标签；
- 不使用“精准计算”“模型精确 Token”等表述；
- 不向用户提供移动端 tokenizer 选择器。

## 4. 目标架构

移动端 Token 计算下沉为通用 Rust 后端能力，不注册为前端工具模块：

```text
Agent Manager / LLM Chat / Context Pipeline
                    |
                    v
 mobile/src/utils/tokenCounting.ts
          （薄 IPC 调用封装）
                    |
                    v
       Tauri command: count_tokens
                    |
                    v
 mobile/src-tauri/src/token_counting.rs
       （o200k 初始化、缓存、批量编码）
```

明确不新增以下移动端内容：

- `mobile/src/tools/token-calculator/`；
- Token Calculator registry、路由或页面；
- tokenizer profile store；
- 模型匹配规则和校准 UI；
- Web Worker 分词实现。

前端只保留跨模块复用所必需的 IPC 类型与调用封装。`usePresetTokenCalculator` 是 Agent Manager 的消费适配层，不拥有 tokenizer 实现。

## 5. Rust 侧设计

### 5.1. 依赖技术验证

第一选择是在 Rust 侧引入支持 `o200k_base` 的 tokenizer crate。具体 crate 和版本在技术验证后确定，不能只根据名称选型。候选方案必须满足：

- 完全离线运行，不在首次使用时下载词表；
- 可构建 Android 和 iOS target；
- 许可证与应用分发兼容；
- `o200k_base` 行为可用固定样本与桌面结果交叉验证；
- 词表能够在进程内复用，避免每次 command 重建；
- 安装体积和真实设备峰值内存可以接受。

若 Rust crate 无法满足移动 target 或内存要求，再单独评估 WASM/lite 方案；不直接默认回退到桌面 `@lenml/tokenizer-gpt4o`。

### 5.2. 模块与缓存

计划新增：

```text
mobile/src-tauri/src/token_counting.rs
```

模块负责：

- 懒初始化并缓存唯一的 o200k tokenizer；
- 对单段文本计数；
- 对多段文本批量计数，减少预设消息和上下文重算时的 IPC 往返；
- 把初始化或编码错误作为结构化错误返回前端；
- 对较长文本使用阻塞任务线程，避免占用 Tauri 主线程。

不持久化 tokenizer 实例或计算缓存。消息级缓存由调用方依据内容和业务生命周期决定，避免 Rust 后端持有跨会话状态。

### 5.3. Command 草案

Rust 返回给前端的结构体必须使用 `#[serde(rename_all = "camelCase")]`。

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenCountResult {
    pub count: usize,
    pub tokenizer: &'static str,
    pub estimated: bool,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenCountBatchResult {
    pub counts: Vec<usize>,
    pub total: usize,
    pub tokenizer: &'static str,
    pub estimated: bool,
}

#[tauri::command]
pub async fn count_tokens(text: String) -> Result<TokenCountResult, String>;

#[tauri::command]
pub async fn count_tokens_batch(
    texts: Vec<String>,
) -> Result<TokenCountBatchResult, String>;
```

两个 command 需要在 `mobile/src-tauri/src/lib.rs` 的 `tauri::generate_handler![]` 中注册。

批量接口保持输入顺序，`counts[index]` 必须与 `texts[index]` 对应。空字符串返回 0；总数使用各项之和，不额外假设聊天消息封装开销。

## 6. 前端接入

### 6.1. 通用 IPC 封装

计划新增薄封装：

```text
mobile/src/utils/tokenCounting.ts
```

它只负责：

- 定义与 Rust camelCase 返回值一致的 TypeScript 类型；
- 调用 `count_tokens` / `count_tokens_batch`；
- 统一模块级错误处理；
- 在 command 失败时返回明确的 fallback 结果。

该文件不是工具 service，不参与工具注册系统。

### 6.2. Agent Manager

`usePresetTokenCalculator` 调整为异步消费层：

- 正确排除禁用消息和禁用消息组；
- 一次批量提交所有启用消息，获得单条和总计结果；
- 文本变化时防抖计算，避免每次键入都触发 IPC；
- 用请求序号或内容快照丢弃过期结果；
- 页面卸载后不再回写状态；
- UI 显示“o200k 预估”。

### 6.3. LLM Chat 与上下文管理

后续由聊天上下文管道复用同一 IPC 封装：

- 发送前估算当前完整上下文占比；
- 为逐消息裁剪提供稳定的消息级相对成本；
- 响应含 usage 时保存实际统计，并优先用于该次请求的展示；
- 不根据渠道类型切换 tokenizer。

工具 schema、附件和多模态 Token 不属于首个 Rust o200k command 的范围。需要时由上下文管道按实际请求结构追加独立估算，避免把供应商协议逻辑塞进通用文本 tokenizer。

## 7. 性能与验证

Rust 技术验证必须在实现接入前完成以下检查：

1. `o200k_base` 固定样本结果与桌面 GPT-4o tokenizer 对齐；
2. `bun run build` 通过；
3. `bun run check:backend` 通过；
4. Android debug 构建通过，iOS 在具备构建环境时验证；
5. 在真实 Android 设备记录首次初始化耗时、二次调用耗时和进程峰值内存；
6. 验证 100 条消息批量计数不会导致明显 UI 卡顿；
7. 验证中文、英文、混排、代码、emoji、长文本和空字符串；
8. 验证快速连续输入时旧请求不会覆盖新结果；
9. 验证 command 失败时 UI 仍保持可用且继续标记为估算。

首轮建议验收目标如下，最终阈值以真实设备数据调整：

| 指标 | 建议目标 |
| --- | --- |
| 二次短文本计数 | 小于 20 ms |
| 100 条中等消息批量计数 | 小于 100 ms |
| 首次初始化 | 不阻塞页面交互 |
| 运行时内存 | 显著低于直接加载 `@lenml/tokenizer-gpt4o` 的前端方案 |

## 8. 实施阶段

### 阶段 1：Rust 可行性验证

- [ ] 选择并验证支持 o200k 的 Rust crate；
- [ ] 完成 Android target 编译；
- [ ] 用固定样本对齐桌面 tokenizer；
- [ ] 测量真实设备初始化耗时、批量性能与峰值内存；
- [ ] 记录依赖许可证和打包体积变化。

### 阶段 2：后端能力与薄封装

- [ ] 新增 `token_counting.rs`；
- [ ] 注册单条和批量 Tauri command；
- [ ] 新增前端 IPC 类型与调用封装；
- [ ] 添加 Rust 单元测试和前端 mock 测试。

### 阶段 3：业务接入

- [ ] 替换 Agent Manager 的 `/3.5` 字符估算；
- [ ] 接入 LLM Chat 上下文占比；
- [ ] 统一实际 usage 与本地估算的展示优先级；
- [ ] 增加上下文 80% / 90% 分级预警。

## 9. 与桌面端的边界

| 维度 | 桌面端 | 移动端 |
| --- | --- | --- |
| 产品定位 | 独立 Token 工具 + 跨模块服务 | 后端通用能力 |
| tokenizer 数量 | 可继续扩充和允许用户导入 | 固定一套 o200k |
| 前端模块 | 有页面、registry、store、Worker | 无独立工具模块 |
| 模型匹配 | 支持 profile 和规则 | 不匹配模型 |
| 结果语义 | 展示具体 tokenizer 与置信度 | 始终标记 o200k 预估 |
| 主要用途 | 分析、比较、计算、开发工具 | 上下文占比和裁剪参考 |

桌面端搜集更多 tokenizer 与移动端保持单一词表并不冲突。两端只需在 API usage 的持久化字段和“估算/实际”语义上保持一致，不要求共享实现。

## 10. 明确不做

- 不调用官方或第三方云端 Token 计数接口；
- 不要求用户提供官方 API Key；
- 不引入任何供应商 SDK；
- 不为移动端维护完整模型-tokenizer 映射；
- 不根据 OpenAI-compatible 等渠道协议推断模型词表；
- 不在移动端提供 tokenizer 下载、导入、切换和可视化；
- 不把 o200k 本地结果描述为模型实际计费 Token。
