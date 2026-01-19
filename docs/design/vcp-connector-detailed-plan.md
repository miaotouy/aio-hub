# VCP Connector 详细施工计划

## 1. 项目现状调查

### 1.1 已有组件与规范

#### 工具注册机制

- **自动注册系统**：`src/services/auto-register.ts` 扫描 `src/tools/**/*.registry.ts` 文件。
- **ToolConfig**：UI 工具配置，包含 `name`、`path`、`icon`、`component`、`description`、`category`。
- **ToolRegistry**：服务接口，可选，用于提供工具 API。
- **示例**：`llm-chat` 工具同时提供 `toolConfig` 和 `ToolRegistry` 类。

#### 状态管理

- **Pinia Store**：项目广泛使用 Pinia 进行状态管理。
- **Store 模式**：每个工具可拥有自己的 store，例如 `llmChatStore`。

#### 错误处理与日志

- **模块化错误处理器**：`createModuleErrorHandler(moduleName)`，必须使用。
- **模块化日志**：`createModuleLogger(moduleName)`，必须使用。
- **规范**：禁止重复记录日志，错误处理器自动处理用户提示。

#### UI 组件库

- **Element Plus**：主要 UI 框架。
- **通用组件**：`BaseDialog`、`DraggablePanel`、`Avatar`、`RichCodeEditor`、`LlmModelSelector`、`ModelSelectDialog`、`ImageViewer`、`VideoPlayer`、`FileIcon`、`DropZone`、`IconPresetSelector`、`DynamicIcon`、`DetachPreviewHint`、`InfoCard`、`DocumentViewer`。
- **主题外观系统**：`useThemeAppearance` 提供 CSS 变量（`--card-bg`、`--ui-blur`、`--border-color` 等），组件必须适配。

#### 网络通信

- **WebSocket**：项目中暂无现成的 WebSocket composable，需要新建。
- **Rust 后端命令**：`read_text_file_force` 可用于读取本地 `.env` 文件。

#### 消息流 UI 参考

- **虚拟滚动**：`llm-chat` 的 `MessageList.vue` 使用 `@tanstack/vue-virtual` 实现虚拟列表，适合大量消息。
- **卡片渲染**：`ChatMessage.vue` 提供丰富的消息渲染逻辑，可借鉴。

### 1.2 缺失部分

1. **WebSocket 管理 composable**：需要创建 `useVcpWebSocket`，包含连接、心跳、重连、状态管理。
2. **VCP 协议类型定义**：设计文档中已有接口，但需完善并放置于 `types/protocol.ts`。
3. **Pinia Store for VCP**：`vcpStore` 管理连接状态、消息历史、过滤状态。
4. **UI 组件**：
   - `BroadcastCard.vue`：渲染不同类型的广播消息（RAG、Chain、Memo 等）。
   - `ConnectionPanel.vue`：连接配置面板，支持本地自动探测和手动输入。
   - `FilterPanel.vue`：消息类型过滤和关键词搜索。
   - `JsonViewer.vue`：JSON 原始报文查看器（可复用现有组件或新建）。
5. **本地自动同步逻辑**：调用 Rust 命令读取 VCP 目录下的 `.env` 文件，解析 `VCP_PORT` 和 `VCP_KEY`。
6. **工具注册文件**：`vcpConnector.registry.ts` 包含 `toolConfig` 和可选的 `ToolRegistry` 类。

## 2. 详细实施步骤

### Phase 1: 基础架构（预计 2-3 天）

1. **创建目录结构**：

   ```
   src/tools/vcp-connector/
   ├── vcpConnector.registry.ts
   ├── VcpConnector.vue
   ├── components/
   │   ├── monitor/
   │   │   ├── BroadcastCard.vue
   │   │   ├── ConnectionPanel.vue
   │   │   └── FilterPanel.vue
   │   └── shared/
   │       └── JsonViewer.vue
   ├── composables/
   │   └── useVcpWebSocket.ts
   ├── stores/
   │   └── vcpStore.ts
   └── types/
       └── protocol.ts
   ```

2. **协议类型定义**（`types/protocol.ts`）：
   - 完善设计文档中的接口，增加 `PLUGIN_STEP_STATUS` 等。
   - 导出联合类型 `VcpMessage`。

3. **Pinia Store**（`stores/vcpStore.ts`）：
   - 状态：`status`、`messages`、`filter`、`stats`。
   - 操作：`clearMessages`、`togglePause`、`addMessage`、`setFilter`。
   - 持久化：连接配置（WS URL、Key）保存到 localStorage。

4. **WebSocket Composable**（`composables/useVcpWebSocket.ts`）：
   - 基于原生 `WebSocket` 封装。
   - 心跳机制（30s ping/pong）。
   - 指数退避重连。
   - 自动解析消息并调用 store 的 `addMessage`。
   - 错误处理使用模块化错误处理器。

### Phase 2: 配置管理（预计 1-2 天）

1. **本地自动探测**：
   - 在 `ConnectionPanel.vue` 中实现“自动探测”按钮。
   - 调用 Rust 命令 `read_text_file_force` 读取 `../VCP/.env` 或环境变量 `VCP_PATH` 指向的目录。
   - 解析 `VCP_PORT` 和 `VCP_KEY`，构建 WS URL。
   - 若失败，回退到手动输入。

2. **配置持久化**：
   - 将 WS URL 和 Key 保存到 localStorage，下次启动自动填充。

### Phase 3: UI 实现（预计 2-3 天）

1. **主布局**（`VcpConnector.vue`）：
   - 使用 `el-container` 布局，左侧配置面板（320px），右侧消息流。
   - 适配主题外观系统（使用 CSS 变量）。

2. **连接面板**（`ConnectionPanel.vue`）：
   - 输入框、自动探测开关、连接/断开按钮。
   - 状态指示灯（绿/橙/红）。

3. **过滤面板**（`FilterPanel.vue`）：
   - 复选框组过滤消息类型。
   - 关键词实时搜索。

4. **消息卡片**（`BroadcastCard.vue`）：
   - 根据消息类型应用不同边框色。
   - RAG 卡片：显示 Core Tags、Score、检索结果摘要。
   - Chain 卡片：显示阶段路径。
   - 点击卡片弹出 `JsonViewer` 抽屉。

5. **JSON 查看器**（`JsonViewer.vue`）：
   - 可复用现有组件或使用 `el-dialog` 展示格式化 JSON。

### Phase 4: 视觉增强与优化（预计 1-2 天）

1. **虚拟滚动**：若消息数量大（>500），引入 `@tanstack/vue-virtual` 优化性能。
2. **动画效果**：新消息入场动画、连接状态过渡。
3. **统计面板**：显示消息速率、连接时长等。
4. **导出功能**：将消息历史导出为 JSON 文件。

## 3. 技术细节

### 3.1 WebSocket 连接 URL 格式

- 本地：`ws://127.0.0.1:${PORT}/vcpinfo/VCP_Key=${VCP_KEY}`
- 远程：用户手动输入完整 URL。

### 3.2 错误处理规范

- 每个文件必须创建模块化错误处理器和日志器。
- 示例：
  ```typescript
  const logger = createModuleLogger("tools/vcp-connector/composables/useVcpWebSocket");
  const errorHandler = createModuleErrorHandler("tools/vcp-connector/composables/useVcpWebSocket");
  ```

### 3.3 主题适配

- 所有组件背景使用 `var(--card-bg)`。
- 需要毛玻璃效果时添加 `backdrop-filter: blur(var(--ui-blur))`。
- 边框使用 `var(--border-color)`。

### 3.4 视觉渲染规范 (High Fidelity)

为了保持与 `RAG_Observer` 的高度一致，渲染需遵循以下细节：

- **配色与标识**：
  - RAG (`#3498db`): 图标使用 `Database`。
  - Chain (`#9b59b6`): 图标使用 `GitBranch`。
  - Agent (`#f1c40f`): 图标使用 `MessageSquare`。
  - Memo (`#1abc9c`): 图标使用 `StickyNote`。

- **RAG 专用逻辑**：
  - **Score Badge**: `score >= 0.8` (Success), `score >= 0.5` (Warning), `score < 0.5` (Danger)。
  - **TagBoost**: 若 `originalScore !== score`，Badge 需呈现金色渐变并带 `⚡` 标识。
  - **Core Tags**: 顶部展示带 `✨` 标识的闪烁标签。
  - **Tag Highlighting**: 匹配到的标签在内容中需以金色 (`#ffc107`) 高亮显示。

- **Chain 专用逻辑**：
  - **Path**: 顶部展示 `A → B → C` 的阶段路径。
  - **Nesting**: 阶段内嵌套渲染子 RAG 结果卡片。

- **交互细节**：
  - **卡片动画**：使用 `cubic-bezier(0.68, -0.55, 0.27, 1.55)` 实现果冻入场效果。
  - **文本折叠**：超过 150 字符自动折叠，提供展开/收起按钮。

### 3.5 与现有工具集成

- 暂无直接依赖，独立工具。
- 未来可考虑与 `llm-chat` 集成（灵视功能），但当前阶段仅独立监控面板。

## 4. 风险与应对

1. **WebSocket 连接不稳定**：重连机制和用户提示。
2. **VCP 协议变更**：类型定义需灵活，可扩展。
3. **性能问题**：虚拟滚动和消息数量限制（默认 500 条）。
4. **跨平台兼容性**：本地路径探测在 Windows/macOS/Linux 上的差异。

## 5. 验收标准

- [ ] 能够成功连接 VCP WebSocket 并接收实时广播。
- [ ] 消息按类型正确渲染，颜色区分明显。
- [ ] 支持过滤和搜索。
- [ ] 配置持久化，重启后恢复。
- [ ] 错误处理友好，日志记录完整。
- [ ] UI 适配主题外观，视觉一致。

## 6. 后续扩展

1. **In-Chat 灵视**：未来 `llm-chat` 插件系统完善后，可将 VCP 消息实时注入聊天界面。
2. **历史回放**：保存消息历史到本地数据库，支持时间线回放。
3. **告警规则**：自定义规则触发通知（如 RAG 检索结果为空时告警）。

---

_计划制定时间：2026-01-19_
_制定者：kilo咕咕_
