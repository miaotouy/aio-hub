# 用户档案系统设计文档

本文档详细阐述了“用户档案”系统的设计与实现方案，旨在为开发提供清晰的指引。该系统允许用户定义自己的“角色”，并在对话中灵活应用。

## 1. 核心概念

- **用户档案 (User Profile)**: 定义了用户在对话中扮演的角色，包含一段描述性文本（如“我是一个资深魔法少年，来自xxxx家族……”）。
- **智能体 (Agent)**: 定义了对话另一方的角色（如“你是江户川柯南……”）。
- **全局默认档案**: 用户可以在应用级别设置一个全局生效的用户档案。
- **智能体绑定**: 每个智能体可以任选一个用户档案进行绑定。此绑定将覆盖全局默认设置。
- **消息快照**: 用户发出的每条消息，都会记录下当时生效的用户档案信息，确保历史记录的上下文一致性。
- **分支重试**: 当从某个**用户消息**节点创建新**分支**时，系统会采用**当前最新**的用户档案配置，而非该消息快照中的旧配置。这使得用户可以“切换身份再说一遍”，开启一个全新的对话分支。
- **优先级**: Agent 绑定 > 全局配置 > 无

## 2. 数据结构与状态管理 (`/src/tools/llm-chat/`)

### 2.1. `types.ts` - 类型定义

**新增 `UserProfile` 接口:**
```typescript
export interface UserProfile {
  id: string;
  name: string;
  icon?: string;
  content: string;
  createdAt: string;
  lastUsedAt?: string;
}
```

**扩展 `ChatAgent` 接口:**
```typescript
export interface ChatAgent {
  // ... existing fields
  userProfileId?: string | null; // 绑定的用户档案ID
}
```

**扩展 `ChatMessageNode.metadata`:**
```typescript
export interface ChatMessageNode {
  // ...
  metadata?: {
    // ... existing fields
    userProfileId?: string;
    userProfileName?: string;
    userProfileIcon?: string;
  };
}
```

### 2.2. `userProfileStore.ts` - 新增状态管理

创建一个新的 Pinia store 用于管理用户档案。

- **State**:
  - `profiles: UserProfile[]`: 存储所有用户档案。
  - `globalProfileId: string | null`: 当前全局选中的用户档案ID。
- **Actions**:
  - `loadProfiles()`: 从本地存储加载。
  - `createProfile()`, `updateProfile()`, `deleteProfile()`: 增删改。
  - `selectGlobalProfile(id: string | null)`: 设置全局默认档案。
- **Getters**:
  - `getProfileById(id: string)`: 根据ID获取档案。
  - `sortedProfiles`: 按使用频率或名称排序的列表。

### 2.3. `useUserProfileStorage.ts` - 新增持久化逻辑（分离式存储）

**参考智能体的存储方案，采用分离式文件存储：**

- **索引文件** (`user-profiles-index.json`): 存储档案元数据和全局设置
- **档案文件夹** (`user-profiles/`): 每个档案存储为独立的 JSON 文件 (`{profileId}.json`)

**核心功能：**
- `loadProfiles()`: 加载所有档案（自动同步索引）
- `persistProfile(profile)`: 保存单个档案并更新索引（推荐使用）
- `saveProfiles(profiles)`: 批量保存所有档案
- `deleteProfile(profileId)`: 删除档案文件和索引项
- `loadSettings()` / `saveSettings()`: 加载/保存全局设置（已整合到索引文件）

**优势：**
- 单文件保存更高效
- 智能防重复写入（内容未变化时跳过）
- 自动发现和同步新文件
- 删除时移入回收站（可恢复）

## 3. UI/UX 实现

### 3.1. 全局配置入口 (`/src/components/TitleBar.vue`)

- 在标题栏右侧（靠近设置按钮）增加一个图标按钮（如 "人像"图标）。
- 点击按钮弹出一个 `ElDropdown` 菜单，内容包括：
  - 一个可搜索的下拉列表，列出所有可用的用户档案。
  - 当前选中的全局档案会高亮显示。
  - 列表顶部可以有一个“无”选项，用于取消全局设置。
  - 列表底部有一个“管理用户档案...”的入口，点击后会导航到设置界面的档案管理页。

### 3.2. 档案管理界面 (`/src/views/components/UserProfileSettings.vue`)

- 创建一个新的 Vue 组件，作为设置中的一个页面。
- 该界面将提供一个完整的 CRUD (创建、读取、更新、删除) 功能，用于管理所有用户档案。
- 列表形式展示所有档案，每行包含名称、图标、部分内容预览和操作按钮（编辑、删除）。

### 3.3. 智能体绑定 (`/src/tools/llm-chat/components/agent/EditAgentDialog.vue`)

- 在智能体编辑对话框中，增加一个新的表单项：“绑定用户档案”。
- 使用一个下拉选择器，数据源为 `userProfileStore.profiles`。
- 允许用户为当前智能体选择一个用户档案进行绑定，或者选择“无”来解绑。
- 该设置保存在 `ChatAgent` 的 `userProfileId` 字段中。

### 3.4. 当前状态显示 (`/src/tools/llm-chat/components/ChatArea.vue`)

- 在消息输入框的上方或旁边，增加一个小的 UI 元素。
- 该元素用于显示当前**将要被使用**的用户档案的图标和名称。
- 其逻辑为：`agent.userProfileId` 对应的档案 > `globalProfileId` 对应的档案 > 无。

## 4. 核心逻辑修改

### 4.1. 上下文构建 (`/src/tools/llm-chat/composables/useChatHandler.ts`)

- **修改 `sendMessage` 和 `regenerateFromNode` 的初始部分**:
  1. **确定生效的 `userProfile`**:
     - 获取当前 `agentStore.currentAgent`。
     - 如果 `agent.userProfileId` 存在，则以此ID从 `userProfileStore` 获取档案。
     - 否则，使用 `userProfileStore.globalProfileId` 从 `userProfileStore` 获取档案。
  2. **注入用户档案**:
     - 在构建上下文时，如果预设消息中存在“用户档案占位符”，则会获取当前生效的用户档案。
     - 然后将该档案的 `content` 替换占位符，构造成一个 `{ role: 'user', content: '...' }` 消息，插入到最终发送给模型的 `messages` 数组的相应位置。
  3. **保存快照**:
     - 在 `sendMessage` 中创建新的 `user` 消息节点时，将生效的 `userProfile` 的 `id`, `name`, `icon` 保存到该用户消息节点的 `metadata` 中。

### 4.2. 从用户消息创建分支的逻辑 (`/src/tools/llm-chat/composables/useChatHandler.ts`)

- **当用户从一个消息节点创建新分支时 (通过点击消息菜单中的“创建分支”按钮)**:
  1. **识别分支操作**: 该操作会以一个 `user` 角色的消息节点 (`targetNode`)作为起点来重新生成对话。
  2. **忽略历史快照**: 在构建新分支的上下文时，**明确忽略** `targetNode.metadata` 中记录的旧 `userProfile` 信息。
  3. **应用当前档案**: 重新执行**步骤 4.1.1**，获取**当前最新**的全局或智能体绑定的用户档案。
  4. **构建新上下文**: 使用这个最新的用户档案来构建上下文并发起请求。
  5. **效果**: 这样，新生成的对话分支将基于用户当前选择的身份，而旧分支的上下文保持不变，从而避免了混淆。普通的重试（通常针对AI消息）则不触发此逻辑。