# Token Calculator: 架构与开发者指南

本文档旨在解析 Token Calculator 工具的内部架构、设计理念和数据流，为后续开发提供清晰的指引。

## 1. 核心概念

Token Calculator 是一个专为 LLM 应用场景设计的精确 Token 计数工具，旨在提供精确、高效、多模态的 Token 计算能力。

### 1.1. Web Worker 离线计算 (Off-main-thread Calculation)

为了确保在处理超长文本或复杂分词时 UI 界面不卡顿，工具将所有核心计算逻辑移至 Web Worker 中执行。

- **主从架构**: UI 线程仅负责展示和交互，Worker 线程负责 Tokenizer 加载、文本编码/解码及多模态计算。
- **异步代理**: 通过 `calculator.proxy.ts` 封装复杂的 `postMessage` 通信，为 UI 层提供简洁的 Promise API。
- **容错机制**: 代理层内置了 Worker 异常捕获与自动重启逻辑，确保计算服务的可用性。

### 1.2. 动态 Tokenizer 加载策略 (Dynamic Tokenizer Loading)

为了平衡功能全面性与初始加载性能，工具采用 **懒加载 + 缓存** 的策略来管理不同模型家族的 Tokenizer。

- **加载器映射**: 内部维护一个从 Tokenizer ID 到动态 `import()` 语句的映射表。
- **加载流程**:
  1. 检查缓存中是否存在已实例化的 Tokenizer。
  2. 若无，则根据模型 ID 查找对应的加载器。
  3. 动态导入 Tokenizer 库，实例化后存入缓存。
- **核心优势**:
  - **性能**: 显著减少应用的初始加载体积，只在需要时加载特定的 Tokenizer 库。
  - **可扩展性**: 新增 Tokenizer 支持只需在映射表中添加一行代码，无需修改核心逻辑。

### 1.3. 多模态 Token 计算 (Multimodal Token Calculation)

除了文本，工具还内置了对多种主流视觉模型图片 Token 计算逻辑的支持。

- **OpenAI 瓦片法 (Tile-based)**: 模拟 OpenAI 的官方算法，通过缩放和切片计算出等效的 Token 消耗。
- **固定成本法 (Fixed Cost)**: 对于一些模型，每张图片有固定的 Token 成本。
- **预估法 (Estimation)**: 对于 Claude 3 等模型，由于实际 Token 数由 API 返回，工具提供一个基于官方文档的预估值。

### 1.4. Token 可视化 (Token Visualization)

为了帮助用户直观理解文本是如何被切分的，工具提供了 Token 可视化功能。

- **实现方式**:
  1. 在 Worker 中使用对应的 Tokenizer 对文本进行编码 (`encode`)。
  2. 将返回的 `tokenId` 数组逐个解码 (`decode`) 回字符串。
  3. 将解码后的片段数组传回主线程。
  4. UI 层为每个 Token 片段应用不同的背景色并渲染。

## 2. 架构概览

- **View (`TokenCalculator.vue`)**: 负责 UI 渲染和用户交互。
- **State (`useTokenCalculatorState`)**: 全局 Composable，管理输入内容、计算模式、计算结果等状态。
- **Proxy (`calculator.proxy.ts`)**: Worker 通信代理，负责将 UI 层的请求转发给 Worker。
- **Worker (`calculator.worker.ts`)**: 运行在独立线程的计算节点，调用 Engine 执行任务。
- **Engine (`core/tokenCalculatorEngine.ts`)**: 核心计算引擎，**纯逻辑实现**，不依赖任何 UI 环境，可在主线程/Worker 中通用。
- **Config (`config.ts`)**: 负责用户偏好（如默认计算模式、面板宽度）的持久化存储。

## 3. 数据流：计算一段文本的 Token

```mermaid
sequenceDiagram
    participant User as 用户
    participant UI as UI 层 (Vue/State)
    participant Proxy as Proxy (Worker 代理)
    participant Worker as Worker 线程
    participant Engine as Engine (核心引擎)

    User->>UI: 输入文本或选择模型
    UI->>Proxy: (异步) calculateTokens(text, modelId)
    Proxy->>Worker: postMessage({ method, params })

    Worker->>Engine: 调用计算方法

    alt Tokenizer 未加载
        Engine->>Engine: 动态 import() 并实例化
    end

    Engine-->>Worker: 返回计算结果
    Worker-->>Proxy: postMessage({ type: 'response', result })
    Proxy-->>UI: Resolve Promise
    UI->>User: 响应式更新界面
```

## 4. 核心逻辑

- **回退估算**: 当无法找到精确的 Tokenizer 时，启用一个基于字符类型（中文、英文、特殊符号）的经验公式进行估算。
- **性能优化**: 对 Token 可视化功能设置了最大显示数量限制（默认 5000），避免超大文本输入导致浏览器渲染卡顿。

## 5. 未来展望

- **Tokenizer 更新**: 保持对 `@lenml/tokenizer-*` 等上游依赖的关注，及时更新以支持最新的模型。
- **特殊 Token 处理**: 增加对不同模型特殊 Token（如 `bos`, `eos`, `tool_code`）的识别和计数。
