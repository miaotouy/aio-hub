# 会话批量导入与管理方案设计 (Session Batch Management Plan)

为了提升多会话场景下的管理效率，本项目将引入**会话批量管理与导入导出功能**。
根据实际体验评估，侧边栏空间狭窄不适合承载复杂的批量操作控件，因此我们采用**独立弹窗（BatchManagerDialog）**的设计方案，将所有批量筛选、勾选、导出、删除和导入操作集中在宽敞的模态框中进行。

---

## 1. 核心架构设计

### 1.1 导出包格式 (ZIP 压缩包)

采用 `.zip` 压缩包作为标准导出格式，保持与本地存储结构高度一致，便于备份与无损还原：

```text
aiohub-chat-backup-YYYYMMDD.zip
├── metadata.json               # 导出的会话索引列表 (ChatSessionIndex[])、导出时间、版本等
└── sessions/
    ├── {sessionId-1}.json      # 会话 1 的完整树状数据 (ChatSessionIndex & ChatSessionDetail)
    ├── {sessionId-2}.json      # 会话 2 的完整树状数据
    └── ...
```

### 1.1.1 实施校正记录

- 当前项目实际持久化结构是 `sessions-index.json` 索引文件 + `sessions/{sessionId}.json` 独立会话文件。
- `saveSession()` 会从单会话文件中移除 `isFavorite` / `favoriteFolderId`，收藏信息只保存在索引内。因此批量导出必须在 `metadata.json` 中保留完整 `ChatSessionIndex[]`，导入解析时再把索引中的收藏字段合并回会话索引。
- 桌面端保存 ZIP 使用 Tauri `@tauri-apps/plugin-fs.writeFile()`，服务层实际返回 `Uint8Array`，不返回浏览器下载用 `Blob`。
- LLM Chat store 操作在分离窗口下会通过 `executeOrProxy()` 转发到主窗口，因此新增的 `import-sessions` / `batch-delete-sessions` / `batch-move-sessions-to-folder` 需要同步补到 `useLlmChatSync.ts` 的 action 分发中。

### 1.2 导入冲突解决策略

当导入的会话 ID 与本地已有会话冲突时，提供以下策略：

1. **保留两者 (Keep Both)**（默认）：为导入的会话生成全新的 UUID，并将名称重命名为 `原名称 (导入副本)`。
2. **覆盖本地 (Overwrite)**：直接用导入的数据覆盖本地同 ID 会话。
3. **跳过 (Skip)**：检测到冲突则不导入该会话。

---

## 2. UI/UX 交互设计

### 2.1 侧边栏入口

在 [`SessionsSidebar.vue`](src/tools/llm-chat/components/sidebar/SessionsSidebar.vue) 的操作区（刷新/清理按钮旁）添加一个“批量管理”按钮：

- 图标：`Files` 图标。
- 提示：`批量管理会话`。
- 触发：点击后打开 `BatchManagerDialog.vue`。

### 2.2 批量管理弹窗 (`BatchManagerDialog.vue`)

采用 `BaseDialog` 承载，尺寸设为 `width="1000px"`，`height="80vh"`，提供极佳的操作视野。

#### 2.2.1 顶部筛选工具栏

- **搜索框**：按名称模糊搜索会话。
- **收藏夹筛选**：下拉选择特定收藏夹。
- **智能体筛选**：下拉选择特定智能体。
- **导入按钮**：点击触发批量导入流程。

#### 2.2.2 中部会话表格 (`el-table`)

- **多选列**：支持全选、单选。
- **会话名称**：支持点击跳转（关闭弹窗并激活该会话）。
- **关联智能体**：展示智能体头像与名称。
- **消息数**：展示有效消息数量。
- **更新时间**：格式化显示最后更新时间。

#### 2.2.3 底部批量操作栏

- **已选统计**：显示 `已选择 X 项`。
- **批量导出**：点击后弹出导出选项（格式、细粒度内容），打包为 ZIP 下载。
- **批量移动**：点击后选择收藏夹，批量移动。
- **批量删除**：点击后弹出二次确认框（`ElMessageBox.confirm`，需设置 `lockScroll: false`），确认后批量删除。

---

## 3. 代码实现规划

### 3.1 核心服务层：[`sessionImportExportService.ts`](src/tools/llm-chat/services/sessionImportExportService.ts)

封装基于 `jszip` 的打包、解压、解析与冲突处理逻辑：

- `exportSessionsAsZip(sessions: Array<{ index: ChatSessionIndex, detail: ChatSessionDetail }>, options: ExportOptions): Promise<Uint8Array>`
- `parseImportFile(fileData: ArrayBuffer): Promise<{ metadata: any, sessions: any[] }>`
- `resolveConflicts(imported: any[], strategy: 'keep' | 'overwrite' | 'skip', existingIds: Set<string>): ResolvedSessionImport`

### 3.2 Store 扩展：[`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts)

提供批量写入和删除的底层支持：

- `importSessions(sessions: Array<{ index: ChatSessionIndex, detail: ChatSessionDetail }>): Promise<void>`
- `batchDeleteSessions(sessionIds: string[]): Promise<void>`
- `batchMoveSessionsToFolder(sessionIds: string[], folderId: string | null): Promise<void>`

---

## 4. 实施步骤

1. **Step 1**: 编写 [`sessionImportExportService.ts`](src/tools/llm-chat/services/sessionImportExportService.ts) 核心逻辑。
2. **Step 2**: 在 [`llmChatStore.ts`](src/tools/llm-chat/stores/llmChatStore.ts) 中实现批量导入与删除 Action。
3. **Step 3**: 编写 `BatchManagerDialog.vue` 批量管理弹窗组件。
4. **Step 4**: 在 [`SessionsSidebar.vue`](src/tools/llm-chat/components/sidebar/SessionsSidebar.vue) 中接入弹窗入口。
5. **Step 5**: 运行类型检查与测试，确保完美合入。
