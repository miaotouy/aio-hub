# Chat 会话收藏夹功能设计方案

> **状态**: ~~Draft~~ 大体完工
> **创建日期**: 2026-06-08  
> **相关模块**: llm-chat

---

## 1. 需求分析

为 LLM Chat 工具的会话管理增加“收藏夹”功能，实现以下操作闭环：

1. **快速收藏/取消收藏**：用户可一键将当前会话标记为收藏（星标），或取消收藏。
2. **选择收藏夹**：用户在收藏时或后续整理时，可将会话归入某个自定义收藏夹（如"常用 Prompt"、"报错排查"）。
3. **整理移动**：支持在收藏夹之间移动会话、从收藏夹中移除会话。
4. **查看收藏**：提供专门的双栏弹窗，让用户浏览所有已收藏的会话，并按收藏夹分类筛选。

### 设计目标

- **高性能**：收藏状态和收藏夹元数据全部存储在轻量级会话索引（`sessions-index.json`）中，不直接读写会话详情文件（`sessions/{sessionId}.json`）来获取收藏信息。
- **低耦合**：不对现有会话详情的数据结构做任何侵入性修改。
- **向下兼容**：旧版本的索引文件加载时自动补全收藏相关字段。
- **语义化**：数据模型清晰，操作意图明确。

---

## 2. 存储结构设计

### 2.1. `ChatSessionIndex` 扩展

文件：[`src/tools/llm-chat/types/session.ts`](../../types/session.ts)

在 `ChatSessionIndex` 中增加两个可选字段：

```typescript
export interface ChatSessionIndex {
  // ... 现有字段（id, name, displayAgentId, messageCount, createdAt, updatedAt）

  /**
   * 是否标记为收藏（快速收藏/星标）
   */
  isFavorite?: boolean;

  /**
   * 所属收藏夹 ID（若为 null 或 undefined 则表示未分类收藏）
   */
  favoriteFolderId?: string | null;
}
```

### 2.2. 收藏夹实体定义

在 `useChatStorageSeparated.ts` 中定义 `FavoriteFolder` 接口，并在 `SessionsIndex` 中引入收藏夹列表：

```typescript
/**
 * 收藏夹实体
 */
export interface FavoriteFolder {
  id: string;
  name: string;
  icon?: string; // 收藏夹图标（支持 Emoji 或 Lucide 图标名）
  createdAt: string;
  updatedAt: string;
}

/**
 * 会话索引结构扩展
 */
interface SessionsIndex {
  version: string;
  currentSessionId: string | null;
  sessions: ChatSessionIndex[];

  /** 自定义收藏夹列表 */
  favoriteFolders?: FavoriteFolder[];
}
```

### 2.3. 数据存储流向示意

```
Disk: sessions-index.json
├── version: "1.1.2"
├── currentSessionId: "xxx"
├── sessions: ChatSessionIndex[]
│   └── 每个 ChatSessionIndex 增加:
│       ├── isFavorite?: boolean
│       └── favoriteFolderId?: string | null
└── favoriteFolders: FavoriteFolder[]
    └── [{ id, name, icon, createdAt, updatedAt }, ...]

Disk: sessions/{sessionId}.json
└── (无变化，不涉及收藏相关字段)
```

### 2.4. 设计优势

| 操作                   | 需要读取的文件                  | 需要写入的文件        | 性能           |
| ---------------------- | ------------------------------- | --------------------- | -------------- |
| 快速收藏/取消收藏      | `sessions-index.json`（已加载） | `sessions-index.json` | ⚡ 极快        |
| 创建/重命名/删除收藏夹 | `sessions-index.json`（已加载） | `sessions-index.json` | ⚡ 极快        |
| 移动会话到收藏夹       | `sessions-index.json`（已加载） | `sessions-index.json` | ⚡ 极快        |
| 加载收藏夹弹窗         | `sessions-index.json`（已加载） | 无                    | 🔥 无需额外 IO |

---

## 3. Store 逻辑设计

文件：[`src/tools/llm-chat/stores/llmChatStore.ts`](../../stores/llmChatStore.ts)

### 3.1. 新增状态

```typescript
const favoriteFolders = ref<FavoriteFolder[]>([]);
```

### 3.2. 新增 Getter

```typescript
/** 所有已收藏的会话列表 */
const favoriteSessions = computed(() => {
  return sessions.value.filter((s) => s.isFavorite);
});

/** 获取指定收藏夹下的会话 */
const getSessionsByFolderId = computed(() => {
  return (folderId: string | null) => {
    return sessions.value.filter(
      (s) => s.isFavorite && s.favoriteFolderId === folderId
    );
  };
});
```

### 3.3. 新增 Actions

```typescript
/**
 * 切换会话的收藏状态（快速收藏/取消收藏）
 */
async function toggleFavorite(sessionId: string): Promise<void> {
  const index = sessionIndexMap.value.get(sessionId);
  if (!index) return;

  index.isFavorite = !index.isFavorite;
  if (!index.isFavorite) {
    index.favoriteFolderId = null;
  }
  index.updatedAt = new Date().toISOString();
  persistSessions();
}

/**
 * 创建新收藏夹
 */
async function createFavoriteFolder(
  name: string,
  icon?: string
): Promise<string> {
  const newFolder: FavoriteFolder = {
    id: `folder-${crypto.randomUUID()}`,
    name,
    icon: icon || "📁",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  favoriteFolders.value.push(newFolder);
  persistSessions();
  return newFolder.id;
}

/**
 * 重命名收藏夹
 */
async function renameFavoriteFolder(
  folderId: string,
  name: string
): Promise<void> {
  const folder = favoriteFolders.value.find((f) => f.id === folderId);
  if (!folder) return;
  folder.name = name;
  folder.updatedAt = new Date().toISOString();
  persistSessions();
}

/**
 * 删除收藏夹（将该文件夹下所有会话的 folderId 置空，保留收藏状态）
 */
async function deleteFavoriteFolder(folderId: string): Promise<void> {
  favoriteFolders.value = favoriteFolders.value.filter(
    (f) => f.id !== folderId
  );
  sessions.value.forEach((session) => {
    if (session.favoriteFolderId === folderId) {
      session.favoriteFolderId = null;
    }
  });
  persistSessions();
}

/**
 * 移动会话到指定收藏夹
 */
async function moveSessionToFolder(
  sessionId: string,
  folderId: string | null
): Promise<void> {
  const index = sessionIndexMap.value.get(sessionId);
  if (!index) return;

  index.isFavorite = true;
  index.favoriteFolderId = folderId;
  index.updatedAt = new Date().toISOString();
  persistSessions();
}
```

### 3.4. 状态同步

- `loadSessions()` 加载索引时，同时恢复 `favoriteFolders`。
- `persistSessions()` 时，一并持久化 `favoriteFolders`。

---

## 4. UI 交互设计

### 4.1. 快速收藏（SessionItem.vue 星标按钮）

在 [`SessionItem.vue`](../../components/sidebar/SessionItem.vue) 的标题区域右侧增加星标按钮：

- **视觉**：使用 `lucide-vue-next` 的 `Star`（空心）和 `StarFilled`（实心）图标。
- **交互**：
  - 默认状态下，Hover 会话项时显示半透明空心星标，`opacity`：0→0.6 过渡 200ms。
  - 已收藏状态（`isFavorite = true`）时，星标常亮并呈现金色（`color: #f7ba2a`）。
  - 点击星标触发 `toggleFavorite`，并伴随 `scale` 0.9→1.0 的脉冲动画。

```vue
<!-- SessionItem.vue 示意 -->
<div class="favorite-star" @click.stop="handleToggleFavorite">
  <el-icon
    :class="['star-icon', { 'is-favorite': session.isFavorite }]"
  >
    <StarFilled v-if="session.isFavorite" />
    <Star v-else />
  </el-icon>
</div>
```

### 4.2. 移动到收藏夹（SessionItem.vue 下拉菜单）

在 [`SessionItem.vue`](../../components/sidebar/SessionItem.vue) 的“更多操作”下拉菜单中，增加“移动到收藏夹”入口：

```vue
<el-dropdown-item command="move-to-folder" :icon="FolderPlus">
  移动到收藏夹
</el-dropdown-item>
```

点击后弹出子菜单或 Popover，列出所有收藏夹（支持动态搜索），并提供“移出收藏夹”和“+ 新建收藏夹”选项。

### 4.3. 收藏夹整理弹窗（FavoriteManagerDialog.vue）

新建组件 [`FavoriteManagerDialog.vue`](../../components/sidebar/FavoriteManagerDialog.vue)，使用 [`BaseDialog`](../../../../../.kilocode/rules/components-guide.md) 作为容器。

#### 4.3.1. 布局

```
+------------------------------------------------------------------+
| 🌟 我的收藏夹                                                   |
+------------------------------------------------------------------+
| [ 🔍 搜索收藏的会话... ]                       [+ 新建收藏夹]    |
|                                                                   |
| +-----------------------------+----------------------------------+|
| | 📁 收藏分类                 | 💬 会话列表                     ||
| +-----------------------------+----------------------------------+|
| | ⭐ 全部收藏 (12)            | [xxx] 会话 A                    ||
| | 📂 未分类收藏 (3)           |    - 时间 | N条消息             ||
| |                              |                                 ||
| | 📁 常用 Prompt (5) [✏️][🗑️]   | [xxx] 会话 B                 ||
| | 📁 报错排查 (4)  [✏️][🗑️]     |    - 时间 | N条消息          ||
| |                              |    [移动到: 常用 Prompt ▾]      ||
| |                              |    [取消收藏]                   ||
| +-----------------------------+----------------------------------+|
+------------------------------------------------------------------+
```

#### 4.3.2. 功能点

| 区域 | 功能                                     | 实现方式                                                                      |
| ---- | ---------------------------------------- | ----------------------------------------------------------------------------- |
| 左栏 | 列出全部收藏 / 未分类收藏 / 自定义收藏夹 | `el-menu` 或自定义列表                                                        |
| 左栏 | 新建收藏夹                               | 底部按钮，弹出输入框（`ElMessageBox.prompt`）                                 |
| 左栏 | 重命名/删除收藏夹                        | Hover 时显示 `el-button` 图标                                                 |
| 右栏 | 展示收藏夹内的会话                       | 与侧边栏 `SessionItem` 类似                                                   |
| 右栏 | 搜索筛选                                 | 顶部 `el-input`，支持**本地标题模糊搜索**与**后端全文检索交集过滤**双引擎模式 |
| 右栏 | 移动会话                                 | `el-select` 下拉框，列出其他收藏夹及 "取消收藏"                               |
| 右栏 | 点击会话                                 | 关闭弹窗并调用 `llmChatStore.switchSession(id)` 跳转                          |

#### 4.3.3. 状态管理

弹窗内部使用 `llmChatStore` 的响应式数据，不创建独立 Store，确保一致性。

### 4.4. 侧边栏入口（SessionsSidebar.vue）

在 [`SessionsSidebar.vue`](../../components/sidebar/SessionsSidebar.vue) 的 `header-actions` 区域增加收藏夹按钮：

```vue
<el-tooltip content="我的收藏夹" placement="bottom" :show-after="500">
  <el-button :icon="Star" @click="favoriteManagerVisible = true" circle size="small" />
</el-tooltip>
```

---

## 5. 与现有功能的关系

### 5.1. 搜索功能与后端的配合机制

由于后端 `search_llm_data` 采用**无索引的并发全表扫描**，直接读取 `sessions/*.json` 详情文件，且不读取 `sessions-index.json`。因此，**后端完全不感知“收藏状态”或“收藏夹”**。

为了保持后端的纯粹性与高性能，我们采用**“后端全文检索 + 前端状态交集/差集过滤”**的轻量级配合方案：

#### 方案 A：在“我的收藏夹”弹窗中搜索已收藏的会话（交集过滤）

1. **本地标题搜索（默认/极速）**：当用户输入关键词时，直接在前端对已加载的 `favoriteSessions` 进行 `name.toLowerCase().includes(query)` 过滤。无需 IO，响应时间 0ms。
2. **全文内容检索（高级）**：若需搜索聊天记录正文，调用 `useLlmSearch({ scope: 'session' })` 发起后端全文检索。
3. **交集过滤**：前端收到后端返回的 `sessionResults`（包含命中的会话 ID 列表 `searchedIds`）后，与已收藏会话进行交集筛选：
   ```typescript
   const searchedFavoriteSessions = computed(() => {
     if (!searchQuery.value.trim()) return favoriteSessions.value;
     const searchedIds = new Set(sessionResults.value.map((r) => r.id));
     return favoriteSessions.value.filter((s) => searchedIds.has(s.id));
   });
   ```

#### 方案 B：在侧边栏搜索时，筛选“不在收藏的”或“仅显示收藏的”（差集/过滤）

1. **FilterPanel 增强**：在侧边栏的 `FilterPanel.vue` 中增加“收藏状态”筛选器：
   - `all`（显示全部）
   - `favorite`（仅显示已收藏）
   - `not_favorite`（仅显示未收藏 / 排除已收藏）
2. **差集/状态过滤**：在 `useSessionsSidebarLogic.ts` 中应用过滤：

   ```typescript
   const filterFavorite = ref<"all" | "favorite" | "not_favorite">("all");

   const filterByFavorite = (sessions: ChatSessionIndex[]) => {
     if (filterFavorite.value === "all") return sessions;
     if (filterFavorite.value === "favorite")
       return sessions.filter((s) => s.isFavorite);
     if (filterFavorite.value === "not_favorite")
       return sessions.filter((s) => !s.isFavorite);
     return sessions;
   };
   ```

3. **搜索联动**：无论是本地标题搜索还是后端全文检索，最终得到的 `displaySessions` 都会经过 `filterByFavorite` 的过滤。这完美解决了**“搜索会话，但排除已收藏的（以便快速整理未分类会话）”**的需求。

### 5.2. 现有功能关系矩阵

| 现有功能                   | 影响     | 说明                                                             |
| -------------------------- | -------- | ---------------------------------------------------------------- |
| 会话搜索 (`useLlmSearch`)  | 完美配合 | 采用“后端全文检索 + 前端状态交集/差集过滤”方案，无需修改后端命令 |
| 排序与筛选 (`FilterPanel`) | 可增强   | 在 FilterPanel 增加“收藏状态”筛选（全部/仅收藏/排除收藏）        |
| 清理空会话                 | 无影响   | 空会话被清理时，自动从收藏夹移除引用                             |
| 删除会话                   | 无影响   | 删除时自动从索引中移除，收藏状态同步消失                         |
| 导出会话                   | 无影响   | 导出不涉及收藏信息                                               |

---

## 6. 实施计划

### Phase 1: 数据层 (存储 + 状态)

| 步骤 | 文件                                             | 内容                                                                                                                                                                       |
| ---- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `types/session.ts`                               | 扩展 `ChatSessionIndex`，增加 `isFavorite` 和 `favoriteFolderId`                                                                                                           |
| 2    | `composables/storage/useChatStorageSeparated.ts` | 定义 `FavoriteFolder` 接口，扩展 `SessionsIndex`，增加 `favoriteFolders` 字段，确保 `loadSessionsIndex` 和 `persistSession` 能正确读写该字段                               |
| 3    | `stores/llmChatStore.ts`                         | 增加 `favoriteFolders` 状态的初始化和持久化同步；实现 `toggleFavorite`、`createFavoriteFolder`、`renameFavoriteFolder`、`deleteFavoriteFolder`、`moveSessionToFolder` 方法 |

### Phase 2: UI 层 (组件)

| 步骤 | 文件                                             | 内容                                                         |
| ---- | ------------------------------------------------ | ------------------------------------------------------------ |
| 4    | `components/sidebar/SessionItem.vue`             | 添加星标按钮和动画；在"更多操作"菜单中增加"移动到收藏夹"入口 |
| 5    | `components/sidebar/FavoriteManagerDialog.vue`   | 新建双栏收藏夹整理弹窗                                       |
| 6    | `components/sidebar/SessionsSidebar.vue`         | 在 header 中增加收藏夹按钮，引入 `FavoriteManagerDialog`     |
| 7    | `composables/sidebar/useSessionsSidebarLogic.ts` | 在侧边栏逻辑中增加收藏夹相关布线和状态同步                   |

### Phase 3: 集成与测试

| 步骤 | 内容                                                                                         |
| ---- | -------------------------------------------------------------------------------------------- |
| 8    | 本地运行 `check:frontend` 确保类型检查通过                                                   |
| 9    | 手动测试：快速收藏、取消收藏、创建/重命名/删除收藏夹、移动会话、弹窗整理、搜索等所有交互链路 |
| 10   | 验证旧版本索引向下兼容性                                                                     |

---

## 7. 未纳入范围的功能

以下功能属于高质量迭代，暂不纳入本轮实现：

- 拖拽排序收藏夹列表（后续可通过 `el-menu` 的 `allow-drag` 实现）
- 收藏夹内会话的手动排序（初始按 `updatedAt` 降序排列）
- 侧边栏左侧的收藏夹树形导航（后续可参考消息列表的分组模式）
- 快捷键支持（如 `Ctrl+D` 快速收藏/取消收藏）

---
