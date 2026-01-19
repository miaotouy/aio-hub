# VCP Connector 设计文档 (Finalized Planning)

## 1. 概述

VCP (Variable & Command Protocol) 是一个 AI 中间件，负责处理 RAG (检索增强生成)、推理链以及 Agent 协作。

本工具（VCP Connector）旨在为 `all-in-one-tools` 提供一站式的 VCP 状态监控与调试能力。通过 WebSocket 监听 VCP 的实时广播，实现异步任务通知、RAG 检索过程可视化以及推理链的实时追踪。

**当前策略**：优先实现**独立监控面板**，作为独立的调试与观察工具。In-Chat 增强（灵视）等集成功能留待后续 `llm-chat` 插件系统完善后再行接入。

## 2. 核心协议规范 (WebSocket)

连接路径：`${wsUrl}/vcpinfo/VCP_Key=${vcpKey}`

### 2.1 消息类型定义

基于对 `RAG_Observer.html` 逻辑的实地调查，本工具处理以下核心消息：

| 消息类型 (`type`)            | 视觉标识         | 描述                | 关键字段                                     |
| :--------------------------- | :--------------- | :------------------ | :------------------------------------------- |
| `RAG_RETRIEVAL_DETAILS`      | 蓝色 (`#3498db`) | 知识库检索详情      | `dbName`, `results[]`, `tagStats`, `useTime` |
| `META_THINKING_CHAIN`        | 紫色 (`#9b59b6`) | 元思考链/推理过程   | `chainName`, `stages[]`, `query`             |
| `AGENT_PRIVATE_CHAT_PREVIEW` | 黄色 (`#f1c40f`) | Agent 内部私聊预览  | `agentName`, `query`, `response`             |
| `AI_MEMO_RETRIEVAL`          | 青色 (`#1abc9c`) | 记忆/备忘录回溯详情 | `mode`, `diaryCount`, `extractedMemories`    |
| `PLUGIN_STEP_STATUS`         | -                | 插件工作流实时步骤  | `pluginName`, `stepName`, `status`           |

## 3. 连接策略

### 3.1 本地自动同步 (Local Sync)

- **逻辑**：利用前端逻辑结合现有的 Rust 后端文件命令，探测本地 VCP 目录（如 `../VCP/`）或读取 `VCP_PATH` 环境变量。
- **解析**：复用现有的 `read_text_file_force` 命令读取 `.env` 文件，解析其中的 `VCP_PORT` 和 `VCP_KEY`。
- **地址**：自动构建为 `ws://127.0.0.1:${PORT}/vcpinfo/VCP_Key=${VCP_KEY}`。

### 3.2 远程手动模式 (Remote)

- **配置**：手动输入 WS 地址与 Key，支持跨机器部署。状态持久化于本地存储。

## 4. 技术规格 (Technical Specifications)

### 4.1 数据模型 (TypeScript Interfaces)

```typescript
// 基础消息接口
interface VcpBaseMessage {
  type: string;
  timestamp: number;
}

// RAG 检索详情
interface RagRetrievalMessage extends VcpBaseMessage {
  type: "RAG_RETRIEVAL_DETAILS";
  dbName: string;
  query: string;
  k: number;
  useTime: string;
  useRerank: boolean;
  useTagMemo: boolean;
  tagWeight?: number;
  coreTags?: string[];
  results: Array<{
    text: string;
    score?: number;
    originalScore?: number;
    source: "rag" | "time";
    matchedTags?: string[];
    coreTagsMatched?: string[];
  }>;
}

// 元思考链 (META_THINKING_CHAIN)
interface ThinkingStage {
  stage: number;
  clusterName: string;
  k: number;
  resultCount: number;
  results: Array<{
    text: string;
    score: number;
    source?: string;
  }>;
}

interface ThinkingChainMessage extends VcpBaseMessage {
  type: "META_THINKING_CHAIN";
  chainName: string;
  query: string;
  stages: ThinkingStage[];
}

// Agent 私聊预览
interface AgentChatPreviewMessage extends VcpBaseMessage {
  type: "AGENT_PRIVATE_CHAT_PREVIEW";
  agentName: string;
  query: string;
  response: string;
}

// 记忆回溯
interface AiMemoRetrievalMessage extends VcpBaseMessage {
  type: "AI_MEMO_RETRIEVAL";
  mode: string;
  diaryCount: number;
  extractedMemories: string;
}
```

### 4.2 状态管理 (Pinia Store)

- `vcpStore` 维护全局连接状态（`status: 'connected' | 'disconnected' | 'connecting' | 'error'`）。
- 维护广播消息历史列表 `messages: VcpBaseMessage[]`。
- 提供 `clearMessages`、`togglePause` 等操作。
- 自动清理逻辑：超过 `maxHistory` (默认 500) 时移除旧消息。

### 4.3 WebSocket 管理 (`useVcpWebSocket`)

- **心跳机制**：每 30s 发送 ping，检测 pong 超时。
- **重连逻辑**：指数退避重连（1s, 2s, 4s... 30s）。
- **状态追踪**：实时更新 Store 中的连接状态和延迟（Ping）。

## 5. UI 布局设计

采用 `el-container` 响应式布局，适配项目暗色模式：

- **Aside (320px) - 配置与过滤**:
  - **Connection Panel**:
    - [Input] WS 地址 (带自动探测开关)
    - [Input] VCP Key (Password)
    - [Button] 连接/断开 (状态联动)
  - **Filter Panel**:
    - [Checkbox Group] 消息类型过滤
    - [Input] 关键词实时搜索
  - **Stats Panel**:
    - 消息速率 (msg/min)
    - 连接时长

- **Main - 实时流**:
  - **Sticky Header**:
    - 状态指示灯 (Green/Orange/Red)
    - [Button] 清空、暂停、导出 JSON
  - **Scroll Area**:
    - 虚拟滚动列表渲染广播卡片。
    - **卡片渲染逻辑**：
      - 不同类型应用不同边框色。
      - RAG 卡片：高亮展示 Core Tags 和 Score。
      - Chain 卡片：展示阶段路径。
      - 点击卡片：弹出 `JsonViewer` 抽屉查看原始报文。

## 6. 目录结构

```text
src/tools/vcp-connector/
├── vcpConnector.registry.ts      # 工具注册
├── VcpConnector.vue              # 主布局
├── components/
│   ├── monitor/
│   │   ├── BroadcastCard.vue     # 广播消息渲染
│   │   ├── ConnectionPanel.vue   # 连接配置
│   │   └── FilterPanel.vue       # 过滤与搜索
│   └── shared/
│       └── JsonViewer.vue        # JSON 查看器
├── composables/
│   └── useVcpWebSocket.ts        # 通信逻辑
├── stores/
│   └── vcpStore.ts               # 状态管理
└── types/
    └── protocol.ts               # 协议定义
```

## 7. 实施 Phase 划分

1. **Phase 1**: 基础架构。协议定义、Store 实现、WebSocket 核心连接逻辑。
2. **Phase 2**: 配置管理。本地 `.env` 探测命令 (Rust) 与配置持久化。
3. **Phase 3**: UI 实现。主布局、连接面板、基础广播卡片。
4. **Phase 4**: 视觉增强。适配 RAG/Chain/Memo 的差异化渲染逻辑，实现虚拟列表优化。
