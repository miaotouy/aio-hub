# 用户档案中心（user-profile-manager）：架构与设计规范

> 状态：Active | 最后更新：2026-10-18
> 关联模块：`src/tools/user-profile-manager`、`src/tools/llm-chat`、`src/tools/agent-manager`、`src/components/TitleBar.vue`
> 相关文档：[配置管理指南](../../../docs/guide/config-management.md)、[日志与错误处理指南](../../../docs/guide/logging-error-handling.md)

---

## 1. 模块定位

`user-profile-manager` 管理用户在对话中扮演的角色与身份档案（User Profile），是 Chat 体系与智能体体系的公共基础数据模块。

- **注册入口**：[`user-profile-manager.registry.ts`](./user-profile-manager.registry.ts)，工具 ID `user-profile-manager`，UI 路由 `/user-profile-manager`，`runMode: "any"`，分类「效率工具」。注册器本身不含服务方法（`getMetadata()` 返回空 `methods`），纯 UI 工具。
- **核心能力**：档案的增删改查、全局默认档案选择、头像资产管理、消息样式与正则管道配置、世界书与快捷操作组关联。
- **跨模块共享**：档案数据由本模块持有并持久化；`llm-chat`、`agent-manager`、`sub-agent`、标题栏等消费方通过统一 Store 接口读取（见第 6 节），不直接接触文件存储。

## 2. 核心架构图

```
┌────────────────────────────────────────────────────────────────┐
│ 消费方                                                          │
│ llm-chat（宏/正则/世界书/快捷操作/样式） · agent-manager（绑定） │
│ sub-agent（子智能体上下文） · TitleBar（全局档案切换）           │
└───────────────▲────────────────────────────────────────────────┘
                │ useUserProfileStore()（Pinia id: llmChatUserProfile）
                │ 经 src/tools/llm-chat/stores/userProfileStore.ts re-export
┌───────────────┴────────────────────────────────────────────────┐
│ user-profile-manager                                           │
│  stores/userProfileStore.ts      内存状态 + 写操作编排          │
│  composables/storage/            分离式文件存储 + 迁移          │
│  utils/profileAssetUtils.ts      头像路径解析                   │
│  UserProfileManager.vue 等组件   管理界面                       │
└───────────────┬────────────────────────────────────────────────┘
                │ @tauri-apps/plugin-fs / Tauri commands
                ▼
{getAppConfigDir()}/user-profile-manager/
  ├─ user-profiles-index.json        索引（ConfigManager）
  └─ user-profiles/{profileId}/      档案目录
      ├─ profile.json                档案详情
      └─ avatar-*.png 等             头像资产
```

## 3. 档案数据模型与类型

类型定义于 [`types/profile.ts`](./types/profile.ts)。

### 3.1 `UserProfile`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | `string` | 唯一标识，创建时由 Store 生成 `user-profile-{timestamp}-{random}` |
| `name` | `string` | 档案名称；既是存储标识的一部分，也是宏替换 ID（`{{user}}` 宏取该值，见 6.3） |
| `displayName` | `string?` | UI 显示名，不影响宏替换 |
| `icon` | `string?` | 头像：相对文件名、`appdata://` 路径、URL 或 emoji（见第 5 节） |
| `avatarHistory` | `string[]?` | 历史头像文件名列表，系统自动维护，供头像选择器快速展示 |
| `content` | `string` | 档案描述文本，进入宏上下文供提示词消费 |
| `enabled` | `boolean?` | 默认 `true`；禁用档案不出现在选择列表 |
| `createdAt` / `lastUsedAt` | `string` | ISO 时间戳 |
| `richTextStyleOptions` | `RichTextRendererStyleOptions?` | 用户消息 Markdown 样式（复用 `rich-text-renderer` 类型） |
| `richTextStyleBehavior` | `"follow_agent" \| "custom"` | 默认 `follow_agent`；`custom` 时启用档案独立样式（见 6.6） |
| `regexConfig` | `ChatRegexConfig?` | 正则管道配置（复用 `llm-chat` 的 `chatRegex` 类型） |
| `worldbookIds` | `string[]?` | 关联世界书 |
| `quickActionSetIds` | `string[]?` | 关联快捷操作组 |

派生类型：`UserProfileEditData`（Omit `id`/`createdAt`/`lastUsedAt`）、`UserProfileUpdateData`（附带 `id`）；`createDefaultUserProfileConfig()` 提供表单与归一化的默认值。

### 3.2 内存状态（Store）

[`stores/userProfileStore.ts`](./stores/userProfileStore.ts) 定义 Pinia store，**id 为 `llmChatUserProfile`**：

- **state**：`profiles: UserProfile[]`（启动时全量加载）、`globalProfileId: string | null`。
- **getters**：`getProfileById`、`sortedProfiles`（按 `lastUsedAt` 降序）、`globalProfile`、`enabledProfiles`、`getEffectiveProfile(agentUserProfileId)`（生效优先级：智能体绑定 ID > 全局默认，封装统一回退逻辑）。
- **actions**：`createProfile` / `updateProfile` / `deleteProfile` / `selectGlobalProfile` / `toggleProfileEnabled` / `updateLastUsed`，以及持久化动作 `persistProfile`（单档案，推荐）、`persistProfiles`（批量）、`persistSettings`（全局选择）。
- **加载契约**：`loadProfiles()` 通过模块级 `loadProfilesPromise` 并发去重；读取失败时保留当前内存状态，避免暂时 IO 故障被固化为空档案；`ensureProfileLoaded()` 是兼容旧调用的同步内存查找，不再触发磁盘读取。

## 4. 索引/详情分离式存储契约

存储实现位于 [`composables/storage/useUserProfileStorage.ts`](./composables/storage/useUserProfileStorage.ts)，参照智能体的分离式方案。

### 4.1 目录与文件布局

所有路径基于 [`src/utils/appPath.ts`](../../../utils/appPath.ts) 的 `getAppConfigDir()`（应用持久化根目录，支持自定义数据位置），模块根为 `{appConfigDir}/user-profile-manager/`：

| 路径 | 内容 |
| --- | --- |
| `user-profiles-index.json` | 索引文件，由 `createConfigManager` 管理（`version: "1.1.0"`） |
| `user-profiles/{profileId}/profile.json` | 单个档案详情（完整 `UserProfile`，缩进 2 的 JSON） |
| `user-profiles/{profileId}/avatar-*.{ext}` | 头像资产文件 |

### 4.2 索引结构

```ts
interface ProfilesIndex {
  version: string;                  // 当前 "1.1.0"
  globalProfileId: string | null;   // 全局默认档案（设置项整合进索引）
  profiles: ProfileIndexItem[];     // 轻量元数据，不含 content
}
interface ProfileIndexItem {
  id; name; displayName?; icon?; createdAt; lastUsedAt?; enabled?;
}
```

- 索引负责列表展示与全局设置；`content`、样式、正则等重数据只在详情文件中。
- 所有索引写入经 `updateIndex()` 串行队列（`indexMutationQueue`）执行，且每次变更前先运行跨模块迁移检查（见 6.1 的幂等性），避免并发写交错。

### 4.3 读写契约

- **读**：`loadProfilesIndex()` 依次执行跨模块迁移检查 → v1→v2 格式迁移（`runMigration`）→ 加载索引 → `syncIndex()` 同步；`loadProfilesState()` 在其上并行加载全部详情，并用加载结果刷新索引元数据。`loadProfiles` / `loadProfilesAll` 为兼容别名，均指向全量加载。
- **`syncIndex()`**：扫描 `user-profiles/` 目录，目录名即 `profileId`；索引中出现但目录缺失的项被剔除，目录中新增的档案自动读取元数据追加到索引尾部，保持既有顺序。
- **写**：`persistProfile()` 强制写详情文件并更新索引项；`saveProfile()` 写入前执行 `validateProfile()` 严格校验（必须具备 `id`、`name`、`createdAt`、字符串 `content`、`regexConfig` 结构），不完整档案拒绝落盘，防止损坏数据覆盖磁盘；非强制写入时内容未变化则跳过。序列化前会把指向自身目录的 `appdata://user-profile-manager/user-profiles/{id}/` 前缀归一化回相对文件名。
- **删**：`deleteProfile()` 先通过 Rust 命令 `delete_directory_in_app_data` 将 `user-profile-manager/user-profiles/{id}` 整目录移入系统回收站，再从索引移除；若删除的是全局档案则同步清空 `globalProfileId`。
- **详情侧自愈**：`loadProfile()` 读取时处理被引号包裹的 icon 值；识别 Windows 盘符 / `file://` 绝对路径头像并通过 `copy_file_to_app_data` 复制进档案目录（失败仅告警，不阻断加载）；`avatarHistory` 缺失时扫描档案目录内图片文件（`.png/.jpg/.jpeg/.gif/.webp/.svg`，排除 `profile.json`）重建。

## 5. 头像资产管理

头像解析的纯函数位于 [`utils/profileAssetUtils.ts`](./utils/profileAssetUtils.ts)：

- **`resolveProfileAvatarPath(profile)`**：
  1. 历史兼容：`appdata://llm-chat/user-profiles/...` 重定向为 `appdata://user-profile-manager/user-profiles/...`（配合跨模块迁移的运行时兜底）；
  2. 裸文件名（含扩展名、无路径分隔符、非 DataURL/协议）自动拼接为 `appdata://user-profile-manager/user-profiles/{profileId}/{filename}`；
  3. 其余值（完整 `appdata://` 路径、HTTP URL、DataURL 等）原样返回。
- **`useResolvedProfileAvatar(profileRef)`**：上述逻辑的 computed 封装；`getProfileStorageSubdirectory(profileId)` 返回相对子目录，供 `AvatarSelector` 等共享组件拼接。
- **运行时读取**：`appdata://` 路径由 [`src/utils/avatarImageCache.ts`](../../../utils/avatarImageCache.ts) 统一消费——通过 Rust 命令 `read_app_data_file_binary` 以相对路径读取二进制并转为 Blob URL，带引用计数缓存；`Avatar.vue`、`AvatarSelector.vue`、会话树图（`llm-chat` 的 `graphContentUtils.ts`）均走该通道。
- **写入与删除**：头像复制使用 Rust `copy_file_to_app_data`（复制到应用数据内相对子目录并重命名）；档案目录删除使用 `delete_directory_in_app_data`，旧格式文件清理使用 `delete_file_to_trash`。`icon` 字段持久化时统一存相对文件名（见 4.3）。

## 6. 迁移与 Chat 消费边界

### 6.1 跨模块迁移（llm-chat → user-profile-manager）

档案数据历史上存放在 `llm-chat` 模块目录下，现已迁移到本模块。迁移基于 [`src/utils/dataMigration.ts`](../../../utils/dataMigration.ts) 的 `runVersionedDataMigration`（迁移 ID `user-profile-manager`，版本标记 `cross-module-v2`，幂等），入口 `ensureUserProfileDataMigrated()` 在每次索引/档案读取前调用：

1. 读取旧 `llm-chat/user-profiles-index.json` 与旧 `llm-chat/user-profiles/`；
2. 目标索引写入前先 `restoreAtomicWriteBackup()` 恢复原子写备份；目标索引解析失败时备份为 `*.migration-invalid.bak` 并以旧索引为基准重建；
3. `repairInvalidEntityConfigs()` 修复损坏的 `profile.json`，`mergeMissingDirectoryTree()` 补齐缺失文件，`verifyDirectorySubset()` 校验目标目录完整覆盖源目录；
4. `mergeProfilesIndexes()` 按 `id` 去重合并新旧索引（目标优先、保持目标顺序），`globalProfileId` 仅在其指向的档案存在时保留；
5. 迁移有实际变更时发系统通知，原数据始终保留不删除；失败时经 `customMessage.error` 去重提示且抛出错误，旧数据不受影响。

`mergeProfilesIndexes` 的合并契约由 [`profileIndexMigration.test.ts`](./composables/storage/__tests__/profileIndexMigration.test.ts) 覆盖（含空目标索引从旧索引恢复等场景）。

### 6.2 v1 单文件 → v2 目录格式迁移

`runMigration()` 处理更早的「一档案一 JSON 文件」格式：`user-profiles/{id}.json` → `user-profiles/{id}/profile.json`；`icon` 为 `appdata://` 路径时把资产复制进新档案目录并改写为相对文件名；旧文件经 `delete_file_to_trash` 移入回收站。单个档案迁移失败仅告警，不阻断其余档案。

### 6.3 Chat 消费边界

消费方**只通过 Store 接口读取**，不直接访问文件存储。为兼容既有引用，[`src/tools/llm-chat/stores/userProfileStore.ts`](../../llm-chat/stores/userProfileStore.ts) 对本模块 Store 做纯 re-export，`llm-chat`、`agent-manager`、`sub-agent` 等 import 均指向该路径。

**生效档案解析**：统一使用 `getEffectiveProfile(agent.userProfileId)`——智能体绑定档案优先，否则回退全局档案；`llmChatService.getEffectiveUserProfile()` 是同一逻辑的服务层封装。应用启动时由 [`src/stores/appInitStore.ts`](../../../stores/appInitStore.ts) 的 post-ready 任务调用 `loadProfiles()` 全量加载。

具体消费点（均在 `llm-chat` 内）：

| 消费点 | 使用的档案字段 | 位置 |
| --- | --- | --- |
| `{{user}}` 宏 | `name`（displayName 不参与宏替换） | `messageInputStore.ts` 以 `userProfile?.name` 填充宏上下文 `userName`；`macro-engine/macros/core.ts` 定义宏 |
| 提示词上下文 | `content` | `MacroContext` 的 `userProfile` 字段 |
| 正则管道 | `regexConfig` | `core/context-processors/regex-processor.ts`：request 阶段与全局、智能体规则合并 |
| 世界书 | `worldbookIds` | `useChatExecutor.ts` / `useSingleNodeExecutor.ts`：按 全局设置 → 用户档案 → 智能体 顺序合并去重 |
| 快捷操作组 | `quickActionSetIds` | `useActiveQuickActionSets.ts`：全局设置 → 智能体 → 档案 合并 |
| 用户消息样式 | `richTextStyleBehavior` / `richTextStyleOptions` | `ChatArea.vue`：仅 `custom` 时以档案样式覆盖（合并全局样式），否则回退智能体样式 |

模块外的消费方：

- **`agent-manager`**：智能体编辑器（`AgentEditor.vue`、`PersonalitySection.vue` 等）读取档案列表并配置智能体的 `userProfileId` 绑定。
- **`sub-agent`**：`sub-agent.registry.ts` 调用 `getEffectiveProfile()` 获取当前生效档案用于子智能体上下文。
- **`TitleBar.vue`**：展示全局档案指示、提供快速切换（`selectGlobalProfile` + `updateLastUsed`），并挂载 `UserProfileManagerDialog`。

**边界约束**：本模块不写 Chat 会话数据、不注入提示词；Chat 侧在发送时快照生效档案并写入消息 metadata（如 `userProfileName`），后续宏/正则/样式均基于该解析结果。档案的修改、删除不会自动重写历史消息。

## 7. 组件结构

```
user-profile-manager/
├─ user-profile-manager.registry.ts          工具注册入口
├─ UserProfileManager.vue                    主页面：ProfileSidebar 列表 + ProfileEditor 编辑区
├─ types/profile.ts                          数据模型与默认值
├─ stores/userProfileStore.ts                Pinia store（消费方唯一数据入口）
├─ composables/storage/useUserProfileStorage.ts  分离式存储与迁移
├─ utils/profileAssetUtils.ts                头像路径解析纯函数
└─ components/
   ├─ UserProfileManagerDialog.vue           标题栏挂载的全局档案管理对话框
   └─ user-profile/
      ├─ CreateUserProfileDialog.vue         创建档案对话框
      ├─ EditUserProfileDialog.vue           编辑档案对话框
      └─ UserProfileForm.vue                 档案表单（头像上传、样式、正则等）
```

主页面复用 `@/views/Settings/shared/` 下的 `ProfileSidebar` 与 `ProfileEditor` 框架组件，头像展示复用共享 `Avatar.vue`；「打开目录」按钮通过 Tauri 打开当前档案目录。

## 8. 测试与验证

| 测试文件 | 覆盖点 |
| --- | --- |
| `utils/__tests__/profileAvatarPath.test.ts` | 头像路径解析：裸文件名拼接、旧 `appdata://llm-chat/...` 协议重定向 |
| `composables/storage/__tests__/profileIndexMigration.test.ts` | `mergeProfilesIndexes` 合并契约：空目标索引恢复、ID 去重、全局档案保留 |
| `stores/__tests__/userProfileStore.test.ts` | Store 的增删改查与全局选择行为 |

迁移与存储属运行时 Tauri IPC 行为，完整验证需在真实环境中进行（参考[工具测试指南](../../../docs/guide/tool-testing-guide.md)）。
