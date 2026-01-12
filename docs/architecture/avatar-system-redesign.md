# 头像系统重构技术文档 (Avatar System Redesign)

## 1. 背景与目标

当前头像系统存在路径解析逻辑分散、通用组件与业务逻辑耦合、以及对本地绝对路径的不安全引用等问题。为了提升系统的健壮性、安全性和可维护性，现决定对头像系统进行全面重构。

### 核心目标

- **统一引用协议**：确立 `appdata://` 作为本地持久化资源的唯一引用协议。
- **禁用绝对路径**：彻底移除对本地磁盘绝对路径（如 `C:\Users\...` 或 `file://`）的直接支持。
- **解耦业务逻辑**：通用组件（如 `AvatarSelector`）不再依赖特定业务模块的 Composable。
- **中心化解析**：所有头像路径的识别与转换由统一的工具类处理。

---

## 2. 架构设计

### 2.1. 历史头像管理 (Avatar History Management)

为了提升性能并减少磁盘扫描，历史头像将从“实时扫描目录”改为“档案内自主维护”：

- **数据结构**：在 `ChatAgent` 和 `UserProfile` 接口中增加 `avatarHistory: string[]` 字段，存储已上传的文件名列表。
- **维护机制**：
  - **上传时**：成功存入 AppData 后，将文件名追加到 `avatarHistory` 数组顶部。
  - **选择历史时**：直接从数组中读取。
  - **清理时**：支持从数组中移除特定文件名（可选，并决定是否同步删除磁盘文件）。
- **向下兼容**：若档案中不存在 `avatarHistory`，组件在首次加载时会自动扫描目录进行初始化填充。

### 2.2. 存储规范 (Storage Specification)

所有通过应用上传或持久化的头像资源应存储在对应的 AppData 目录下：

| 实体类型            | 存储目录 (AppData 相对路径)           | 引用协议格式                                              |
| :------------------ | :------------------------------------ | :-------------------------------------------------------- |
| **智能体 (Agent)**  | `llm-chat/agents/{agentId}/`          | `appdata://llm-chat/agents/{agentId}/{filename}`          |
| **用户档案 (User)** | `llm-chat/user-profiles/{profileId}/` | `appdata://llm-chat/user-profiles/{profileId}/{filename}` |

> **注意**：在 `agent.json` 或 `profile.json` 中，为了保证数据可迁移性，`icon` 字段仅存储**文件名**（如 `avatar-1716.png`），解析时再根据上下文拼接完整协议路径。

### 2.2. 协议优先级 (Protocol Priority)

头像系统按以下顺序解析 `src` 字符串：

1.  **内置/预设图标**：以 `/model-icons/` 开头或匹配 `LOBE_ICONS_MAP` / `LOCAL_ICONS_MAP` 的 Key。
2.  **网络资源**：以 `http://` 或 `https://` 开头的 URL。
3.  **内联资源**：以 `data:image/` 开头的 Base64 编码。
4.  **本地持久化资源**：以 `appdata://` 开头的路径。
5.  **文本/Emoji**：不符合上述条件的短字符串。

---

## 3. 核心组件职责

### 3.1. `Avatar.vue` (基础渲染层)

- **输入**：接收一个经过解析的完整路径或协议字符串。
- **逻辑**：
  - 识别 `appdata://` 并调用 `avatarImageCache` 进行 Blob 转换与缓存。
  - 处理图片加载失败的回退逻辑（显示首字母）。
  - **不再**处理 `file://` 或任何绝对路径转换。

### 3.2. `AvatarSelector.vue` (交互选择层)

- **职责**：提供 Emoji 选择、预设库选择、图片上传。
- **变更**：
  - **移除**“引用本地路径”功能。
  - 所有本地图片必须经过“上传”流程存入 AppData。
  - 内部使用 `avatarUtils` 拼接待显示的预览路径。
  - `v-model` 仅输出文件名或 Emoji/URL。

### 3.3. `avatarUtils.ts` (逻辑控制层)

- **职责**：
  - 提供 `isLikelyFilename(src)` 判断。
  - 提供 `resolveAvatarUrl(src, context)` 将文件名转化为 `appdata://` 协议。
  - 统一规范化内置图标路径。

---

## 4. 数据迁移与兼容性 (Migration & Compatibility)

### 4.1. 版本更新

- `agents-index.json` 和 `user-profiles-index.json` 的版本号将从 `1.0.0` 提升至 `1.1.0`。

### 4.2. 绝对路径的自动迁移 (Silent Migration)

为了兼容旧版本中直接引用本地绝对路径的情况，加载逻辑中将增加以下迁移步骤：

1.  **检测**：识别 `icon` 字段是否为本地绝对路径（Windows 路径或 `file://`）。
2.  **转换**：
    - 尝试读取该路径下的文件。
    - 若读取成功，将其**复制**到该实体的 AppData 专属目录下。
    - 将 `icon` 字段更新为新生成的文件名。
    - 将该文件名存入 `avatarHistory`。
3.  **清理**：迁移完成后，内存中的配置将被标记为 `dirty` 并触发自动保存。

### 4.3. 历史记录初始化

对于旧版档案（无 `avatarHistory` 字段）：

- 系统将在首次加载时扫描其 AppData 目录。
- 根据文件修改时间或文件名中的时间戳，自动重建 `avatarHistory` 列表。

## 5. 开发者调用建议

**旧代码 (不推荐)**：

```typescript
// 依赖业务 Composable
const src = resolveAvatarPath(agent, "agent");
```

**新代码 (推荐)**：

```typescript
import { avatarUtils } from "@/utils/avatarUtils";

const src = avatarUtils.resolveAvatarUrl(agent.icon, {
  type: "agent",
  id: agent.id,
});
```

### 4.2. 禁用绝对路径的影响

如果用户配置中存有旧的绝对路径，`Avatar` 组件将无法直接加载。系统应在加载配置时（如在 `useLlmProfiles` 的 `migrate` 逻辑中）尝试将其引导至上传流程或标记为失效。

---

## 5. 待办事项 (Roadmap)

1. [ ] 实现 `src/utils/avatarUtils.ts`。
2. [ ] 重构 `Avatar.vue` 移除旧路径逻辑。
3. [ ] 重构 `AvatarSelector.vue` 移除本地路径引用。
4. [ ] 同步更新 `llm-chat` 相关的 Composable。
