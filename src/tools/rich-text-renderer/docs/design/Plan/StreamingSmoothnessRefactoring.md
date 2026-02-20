# 流式渲染平滑化重构设计方案 (RFC)

**状态**: `Implementing`
**版本**: 1.2 (Finalized with Deep Analysis & User Feedback)
**日期**: 2026-02-20
**目标**: 解决 AIO 渲染引擎流式输出时的阵发性（Burst）感，实现丝滑打字机效果，同时通过架构优化将长文场景下的解析/Diff 开销从 $O(n)$ 降至近似 $O(1)$。

> **⚠️ 核心约束 (Safety First)**:
> 性能优化**严禁**收紧或修改现有的 `MarkdownBoundaryDetector` 稳定区界定逻辑。
> 任何“引用冻结”操作必须发生在现有安全边界之内。样式完整性（如 HTML 标签闭合、CSS 继承链）的优先级高于解析性能。

---

## 1. 现状深度分析

### 1.1 核心问题诊断
1.  **调度层：网络抖动透传**
    - 现状：`RichTextRenderer.vue` 在订阅流时，每收到一个 Chunk 就立即触发 `setContent`。
    - 后果：输出节奏完全受限于网络包到达时间。虽然 `useMarkdownAst` 有 80ms 节流，但这仅是“批量应用 Patch”，解析器依然在频繁进行重型计算，且视觉上仍有明显的“瞬跳”感。
2.  **解析层：无效的重复解析 ($O(n)$)**
    - 现状：`StreamProcessorV2.ts` 每次更新都会调用 `parseAsync` 重新解析整个 `stableText`。
    - 后果：对于 50k 字的长文，即使末尾只增加一个字符，也要重新解析前 49.9k 字。虽然在 Worker 中运行，但主线程的通信和后续 Diff 依然无法逃避 $O(n)$ 复杂度。
3.  **Diff 层：重型文本提取开销**
    - 现状：`diffSingleNode` 通过 `getNodeTextContent` 递归提取整个子树的文本进行字符串比对。
    - 后果：这使得 Diff 算法的开销随文档长度线性增长，成为了长文渲染卡顿的主因。
4.  **状态层：Race Condition**
    - 现状：流式数据可能在 `RichTextRenderer.vue` 挂载完成前到达，导致首屏内容丢失或初始化异常。

### 1.2 性能目标
- **解析/Diff 耗时**：长文场景（>50k字）下单次增量更新耗时 < 2ms。
- **视觉更新率**：稳定保持在 60fps（或随显示器刷新率），无肉眼可见的节奏跳变。

---

## 2. 详细设计方案

### 2.1 调度层：StreamController (平滑化核心)
引入 `StreamController` 类，作为 `StreamSource` 与 `StreamProcessor` 之间的缓冲调度层。

#### 核心机制
-   **rAF 驱动循环**：使用 `requestAnimationFrame` 驱动消费循环。
-   **双端队列缓冲**：
    - `rawBuffer`: 存放网络层到达的原始字符。
    - `displayBuffer`: 存放已通过平滑化处理、待喂给解析器的字符。
-   **自适应步进 (Adaptive Ticking)**：
    - **基础速率**：每帧消费 1-2 个字符。
    - **加速逻辑**：若 `rawBuffer` 积压 > 200 字符，线性增加每帧消费数：`charsPerFrame = Math.min(10, Math.ceil(backlog / 50))`。
    - **紧急冲刷**：若积压 > 1000 字符（如大段代码块粘贴），直接一次性同步，放弃平滑。
-   **语义感知切分 (Semantic Awareness)**：
    - **普通文本**：优先在空格、标点、换行处完成“一帧”的消费，避免单词中间断开。
    - **代码块模式**：通过简单的正则检测当前是否处于 ` ``` ` 内部。在代码块内**禁用语义切分**，采用绝对匀速输出，防止代码缩进或特殊符号导致的节奏震荡。
    - **代码块二次缓冲与节流更新**：由于 Monaco Editor 的高亮引擎（Tokenization）在频繁更新时会有显著开销，代码块组件内部需建立二级缓冲区。**核心策略是“时间驱动的批量节流”**：不再随 rAF 逐帧更新字符，而是以固定的频率（如 60-100ms）将缓冲区内积压的内容批量同步给 Monaco。这种“快进式”的批量更新能显著减少 Monaco 的重绘次数，彻底消除高亮闪烁。

### 2.2 解析层：$O(1)$ 幂等优化
通过缓存和引用冻结，彻底消除重复解析。

#### 优化逻辑
1.  **稳定区引用冻结 (Stable Ref Freezing)**：
    - `StreamProcessorV2` 记录 `lastStableText`。
    - **逻辑**：`if (newStableText === lastStableText) { useCachedStableAst(); }`
    - 效果：只要没有发生跨块边界的合并，稳定区的 AST 引用保持不变，Diff 算法将直接跳过这部分节点的递归。
2.  **快速指纹 Diff (Fast Fingerprinting)**：
    - 在 `AstNode` 的 `props` 中引入 `_fp` (Fingerprint) 属性。
    - **计算公式**：`fp = length + ":" + content[0] + ":" + content[last]`。
    - **Diff 策略**：
        - 优先比对 `oldNode.type === newNode.type`。
        - 其次比对 `oldNode.props._fp === newNode.props._fp`。
        - 若指纹一致，**直接判定内容未变**，跳过 `getNodeTextContent` 的递归调用。
3.  **待定区局部解析**：
    - 仅对 `pendingText` 进行解析，并将其生成的 AST 挂载到主树末尾。

### 2.3 状态层：挂载保护与 Patch 合并
-   **Pre-buffered Queue**：在 `RichTextRenderer.vue` 中引入 `isMounted` 标志位。未挂载前的所有 chunk 存入队列，`onMounted` 时以高倍速“追赶”回放。
-   **Patch 聚合优化**：在 `useMarkdownAst` 中，将 32ms 内的多个 `replace-node` 针对同一 ID 的操作合并为最后一次。

---

## 3. 架构图示

```mermaid
graph TD
    Source[StreamSource] -->|Raw Chunks| PreBuffer{Mounted?}
    PreBuffer -->|No| Queue[Pre-buffered Queue]
    PreBuffer -->|Yes| Controller[StreamController]
    
    subgraph Scheduler[调度层: rAF Smooth Loop]
        Controller -->|Adaptive Rate| Logic{In Code Block?}
        Logic -->|No| Semantic[Semantic Splitter]
        Logic -->|Yes| Constant[Constant Rate]
        Semantic --> Smoothed[Display Buffer]
        Constant --> Smoothed
    end
    
    Smoothed -->|setContent| Processor[StreamProcessorV2]
    
    subgraph Parser[解析层: O(1) Optimization]
        Processor -->|Check| Cache{Stable Text Changed?}
        Cache -->|No| Reuse[Reuse Stable AST Ref]
        Cache -->|Yes| FullParse[Full Parse]
        Reuse --> FPDiff[Fast Fingerprint Diff]
        FullParse --> FPDiff
    end
    
    FPDiff -->|Patches| Store[useMarkdownAst]
    Store -->|rAF Flush| View[Vue Renderer]
```

---

## 4. 实施计划

### 阶段一：解析器性能加固 (Parser & Diff)
- [x] **指纹系统**：在 `CustomParser` 生成文本类节点（text, code_block, inline_code）时计算 `_fp`。
- [x] **引用冻结**：在 `StreamProcessorV2` 中实现 `lastStableText` 校验逻辑。
- [x] **Diff 优化**：重构 `diffSingleNode`，优先使用 `_fp` 进行比对，废弃 `getNodeTextContent` 的全量调用。

### 阶段二：调度器实现 (StreamController)
- [x] **核心开发**：编写 `StreamController.ts`，实现基于 rAF 的消费循环。
- [x] **平滑策略**：实现自适应速率算法和代码块检测逻辑。
- [x] **集成**：将 `RichTextRenderer.vue` 的数据流改为 `StreamSource -> StreamController -> StreamProcessor`。

### 阶段三：鲁棒性与调优 (Robustness)
- [x] **挂载保护**：实现 `preBufferedQueue` 逻辑，确保首屏数据不丢失。
- [x] **开关控制**：增加 `smoothingEnabled` prop，允许在低端设备或调试时关闭平滑化。
- [x] **性能压测**：使用 `RichTextRendererTester` 模拟 100k 字长文流式输出，监控 CPU 占用率。

---

## 5. 预期效果
-   **视觉**：字符像水流一样匀速涌出，即使网络有 500ms 抖动，用户看到的依然是平滑的打字效果。
-   **性能**：
    -   长文解析不再随长度变慢。
    -   主线程阻塞时间（Long Task）在流式过程中减少 80% 以上。
-   **体验**：彻底消除长文中打字机效果导致的页面“微冻结”现象。