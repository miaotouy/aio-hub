# 知识库 (Knowledge Base): 架构与 RAG 开发者指南

本文档旨在深入解析 `knowledge-base` 工具的内部架构、RAG (Retrieval-Augmented Generation) 流程以及前后端协作机制。

## 1. 核心概念 (Core Concepts)

知识库工具不仅是一个文档管理器，更是一个高性能的本地 RAG 引擎。

### 1.1. 原子知识单元 (CAIU - Core Atomic Information Unit)

CAIU 是知识库的最小存储单位。

- **Key**: 唯一标识符，支持 `[[Key]]` 语法进行跨单元引用。
- **Content**: Markdown 格式的正文。
- **Tags**: 带权重的标签系统，支持语义检索。
- **Priority**: 检索时的权重加成。
- **Content Hash**: 用于检测内容变更，决定是否需要重新向量化。

### 1.2. 检索引擎 (Retrieval Engines)

系统支持多种可插拔的检索引擎（实现 `RetrievalEngine` Trait），支持热切换：

- **Keyword**: 基于 **Jieba 分词** 的倒排索引检索。采用词频 (TF) 评分，并通过非线性 Log 缩放进行分数归一化，确保字面匹配结果能与向量分数进行量级对齐。
- **Vector**: 基于 **余弦相似度 (Cosine Similarity)** 的语义检索。
  - **Tag-First 策略**: 即使 CAIU 尚未完成向量化，也能通过关联标签在标签池中进行语义召回，实现“无向量预览”检索。
  - **长度归一化**: 引入仿 BM25 的长度惩罚因子，消除长短文本在向量空间中的不公平优势。
- **Lens (透镜检索)**: 启发自光学透镜的折射与聚焦现象：
  - **上下文投射**: 利用 `history_vectors` 将历史对话上下文投影到当前查询，解决语义漂移。
  - **空间反转 (Space Inversion)**: 算法核心。构建标签亲和力矩阵，利用 **SVD (奇异值分解)** 求解拉普拉斯矩阵的伪逆，实现能量在语义图谱上的逆向传播。
  - **质感控制**: 支持颗粒 (Coarse) 与纤维 (Fine) 两种纹理，控制语义扩散的广度。
- **Blender (融合检索)**: 复杂的混合信号引擎。
  - **三路信号**: 同时发射字面量 (Literal)、语义 (Semantic)、引力 (Gravitational) 信号。
  - **残差挖掘 (Residual Mining)**: 基于 Gram-Schmidt 投影，逐层剥离查询向量中已被已知标签解释的分量，挖掘隐藏在残差空间中的微弱信号。
  - **蛛网共振 (Web Resonance)**: 根据查询词的 **信息熵 (Entropy)** 自动调节各路信号权重。

### 1.3. 标签池 (Tag Pool)

标签池是知识库的基础设施，负责管理全局的标签语义信息。

- **全局共享**: 标签池独立于具体的知识库（Base），按 Embedding 模型进行隔离。不同知识库中相同的标签共享同一个向量表示，确保了跨库检索的一致性。
- **语义降维**: 标签本身被向量化并建立 HNSW 索引，支持“以标签找标签”的语义联想。
- **标签之海 (Tag Sea) 模块**: 这是一个基于标签池和当前知识库动态构建的语义关联模块。它整合了标签的向量空间、关联权重、语法权重（如 `#rust::1.5`）和信息熵权重（IDF），为 Lens 等高级检索算法提供多维度的语义折射率计算。

---

## 2. 系统架构 (System Architecture)

项目采用典型的前后端分离架构，通过 Tauri IPC 进行通信。

### 2.1. 后端架构 (Rust - `src-tauri/src/knowledge/`)

后端负责重型计算、文件 IO 和索引管理。

- **`core.rs`**: 定义核心模型（Caiu, TagSea, SearchFilters）及 `RetrievalEngine` 接口。
- **`state.rs`**: `KnowledgeState` 持有全局 `InMemoryDatabase` 和 `GlobalTagPoolManager`。
- **`index/` (索引层)**:
  - `db.rs`: `InMemoryBase` 结构，负责条目的内存全量缓存、Key 索引及状态同步。
  - `inverted_index.rs`: 基于 Jieba 的倒排索引，支持标签和词项检索。
  - `vector_matrix.rs`: 展平的向量矩阵，支持并行余弦相似度计算。
- **`tag_pool.rs`**: 维护 **HNSW 索引**，负责标签向量的高速最近邻搜索。
- **`ops.rs`**: 负责知识库的 **预热 (Warmup)** 逻辑、按需加载向量以及批量原子写入 (Batch Upsert)。
- **`monitor.rs`**: 定义 RAG Trace 和 Index Trace 事件流，通过 Tauri Emitter 实时推送到前端。

### 2.2. 前端架构 (Vue 3 - `src/tools/knowledge-base/`)

前端负责 UI 交互、向量化流程管理和检索策略配置。

- **`stores/knowledgeBaseStore.ts`**: Pinia 状态中心，管理工作区、知识库元数据及加载状态。
- **`core/KnowledgeSearchManager.ts`**: 检索调度中心。负责 **坐标对齐**（确保 Embedding 模型一致）、**环境预热**（触发后端加载向量）及检索策略分发。
- **`core/kbIndexer.ts`**: 向量化流水线。管理 Embedding 任务队列，支持断点续传。
- **`utils/vectorCache.ts`**: 本地向量缓存，利用内容哈希避免重复调用 LLM API。
- **Composables**:
  - `useKbVectorSync`: 处理前端与后端向量状态的实时同步。
  - `useKbMonitor`: 实时监控 RAG 链路的性能指标（耗时、召回率、错误率）。

---

## 3. RAG 核心流程 (The RAG Pipeline)

### 3.1. 索引流程 (Indexing Flow)

当用户添加或修改 CAIU 时：

1. **内容预处理**:
   - **哈希计算**: 计算 Content Hash，若内容未变则跳过向量化。
   - **元数据提取**: 后端自动从 Markdown 内容中提取第一个一级标题作为 `Key`，并解析 `Tags: xxx` 或 `标签: xxx` 行作为初始标签。
2. **原子化存储**: 系统**不进行自动分片 (No Chunking)**。每个文件或手动输入的文本块被视为一个完整的 CAIU。
   - _注意_: 前端对单个 CAIU 有 12,000 字符的长度限制（可配置），超过此长度建议用户手动拆分以保证 Embedding 质量。
3. **向量化 (Embedding)**: 前端管理向量化流水线，分批调用 LLM API 生成向量（利用 `vectorCache` 避免重复请求）。
4. **持久化**: 前端将向量发送至后端，后端以 `{entryId}.vec` 文件形式存入模型隔离目录，并实时更新内存中的向量矩阵。

### 3.2. 检索流程 (Retrieval Flow)

执行一次搜索的完整生命周期：

1. **覆盖率检查**: `KnowledgeSearchManager` 检查目标库在当前模型下的向量覆盖情况。
2. **自动补全 (Optional)**: 若覆盖率不足，提示用户或后台自动补齐缺失向量。
3. **预热 (Warmup)**: 后端将向量索引加载至内存（若尚未加载）。
4. **向量化查询**: 将用户 Query 转换为向量。
5. **后端检索**:
   - 后端根据 `engineId` 调用对应引擎。
   - 执行过滤 (Filter) -> 计算 (Compute) -> 排序 (Sort)。
6. **结果增强**: 返回带高亮片段和匹配度评分的结果列表。

---

## 4. 存储结构 (Storage Structure)

知识库数据存储在用户的 `appData/knowledge/` 目录下：

```text
knowledge/
├── bases/                    # 知识库原始数据
│   └── {kbId}/
│       ├── meta.json         # 库元数据和 CAIU 索引项
│       └── entries/          # 原始数据目录 ({entryId}.json)
├── vectors/                  # 向量数据目录 (按知识库和模型隔离)
│   └── {kbId}/
│       ├── models.json       # 模型索引
│       └── {modelHash}/      # 特定模型的向量文件 ({entryId}.vec)
└── tag_pool/                 # 全局标签池 (按模型隔离)
    └── {modelHash}/
        ├── registry.json     # 标签注册表
        └── vectors.bin       # 标签向量数据 (HNSW)
```

---

## 5. 开发者调试指南

### 5.1. 性能监控

在知识库界面进入 **"监控 (Monitor)"** 视图，可以查看：

- **RAG Trace**: 记录每一次检索的详细耗时分解（向量化耗时 vs 检索耗时）。
- **Index Trace**: 记录向量化任务的吞吐量和失败原因。
- **内存占用**: 查看当前加载到内存中的向量矩阵大小。

### 5.2. 常见问题排查

- **搜索不到内容**:
  1. 检查当前选中的 Embedding 模型是否与向量化时一致。
  2. 在设置中点击 "校验向量状态" 强制同步。
- **检索速度慢**:
  1. 检查是否开启了过多的知识库。
  2. 观察监控中的向量加载耗时，考虑清理冗余的旧模型向量。
