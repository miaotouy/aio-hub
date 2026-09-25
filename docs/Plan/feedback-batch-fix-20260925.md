# 用户反馈修复批次（2026-09-25 整理）

来源：kfc50（09-21 ~ 09-24）、莓完莓鸟（09-25）两条反馈流。逐项修复并单独提交。

## 状态总览

| # | 问题 | 模块 | 状态 |
|---|------|------|------|
| 1 | 安装器简陋、无图标 | src-tauri / NSIS | ⬜ 待处理 |
| 2 | 新会话仍是新建持久空会话 | llm-chat | ⬜ 待处理 |
| 3 | 气泡操作栏布局锁死，需重做 | llm-chat | ⬜ 待处理 |
| 4 | 气泡下方常驻空位置 | llm-chat | ⬜ 待处理（与 3 一并） |
| 5 | 复读检查误判、阈值需加大 | transcription | ⬜ 待处理 |
| 6 | 消息 tokens 缺缓存量展示 | llm-chat | ⬜ 待处理 |
| 7 | 媒体任务取消按钮用了删除图标 | media-generator | ⬜ 待处理 |
| 8 | 重新生成按钮应常驻 | llm-chat | ⬜ 待处理 |
| 9 | 模型列表分组删除按钮失效 | Settings/llm-service | ⬜ 待处理 |
| 10 | 「立刻发送」清空输入框且不带原内容 | rich-text-renderer / llm-chat | ⬜ 待处理 |
| 11 | 上下文分析器附件无法查看 | llm-chat/context-analyzer | ⬜ 待处理 |
| 12 | 媒体生成报错信息截断、无法查看完整 | media-generator | ⬜ 待处理 |

## 问题详情与定位

### 1. 安装器升级
- 反馈：安装器很简陋，连图标都没做。
- 现状：`src-tauri/tauri.conf.json` 的 `bundle.windows.nsis` 只配了 `languages`、`installerHooks`、`template`；自定义模板 `src-tauri/nsis/installer.nsi` 已支持 `INSTALLERICON`/`SIDEBARIMAGE`/`HEADERIMAGE`/`LICENSE` 等变量但未提供资源；`src-tauri/icons/` 无安装器专用资源（无 installer-icon.ico、sidebar.bmp、header.bmp、许可文件）。
- 方向：复用 `icon.ico` 配置安装/卸载器图标；生成欢迎页侧图（164×314）与头图（150×57）BMP；补充 Apache-2.0 许可页；视情况调整 installMode。

### 2. 新会话不应持久化空会话
- 反馈：点击「新会话」依旧新建一个持久的空会话，之前的重构本打算拿掉这个。
- 定位：侧栏入口 `handleQuickNewSession`（useSessionsSidebarLogic.ts:106）→ `store.beginNewSession`（sessionLifecycleManager.ts:346，草稿不落盘）；存在 `materializeNewSession`（落盘）与发送消息时物化机制。需排查是否仍有入口直接 `createSession` 持久化（如迷你会话列表 MiniSessionList.vue:358），统一为草稿会话。

### 3. 气泡操作栏重做
- 反馈：气泡的操作栏看起来在消息容器外面，布局锁死在里面，雕不出来，重做一个专门给气泡用。
- 定位：`.menubar-wrapper` 是 `.chat-message` 内部流内元素；气泡模式在 MessageList.vue:1380 被覆写为 `position: static; margin-top: 8px`，固定占位于气泡底部。ToolCallMessage 已有 `.is-collapsed`（absolute top/right 0）变体机制但 ChatMessage 未接入。
- 方向：气泡模式操作栏改为悬浮于气泡边缘（absolute、hover 显现），不占流内空间；与问题 4 一并处理。

### 4. 气泡下方常驻空位置
- 反馈：下面一坨常驻空位置。
- 定位：与问题 3 同源，static 操作栏 + margin 造成的占位。重做后消除。

### 5. 复读检查优化
- 反馈：群聊截图里真在复读、或转发消息「昵称：[图片]」被误判复读；需要更大次数阈值。
- 定位：`src/tools/transcription/utils/text.ts:53` detectRepetition；默认阈值 `config.ts:78` consecutiveThreshold: 3 / globalThreshold: 5；设置 UI settingsConfig.ts:1164。
- 方向：提高默认阈值；对固定「昵称：」前缀 + 「[图片]」类占位符的行做归一化（不按整行逐字对比），避免占位符刷屏误判。

### 6. 消息 tokens 缓存量展示
- 反馈：消息的 tokens 还没做缓存量展示。
- 定位：展示组件 MessageContent.vue usage-info（只显示输入/输出/总数）；数据链路已通：llm-core `parseOpenAiUsage` 已解析 `prompt_tokens_details.cached_tokens` → `usage.promptTokensDetails.cachedTokens`，前端类型 common.ts:496 已声明。
- 方向：usage-info 中追加「缓存: N」（有值时显示）。

### 7. 媒体任务取消图标
- 反馈：取消用的图标不对，居然是删除图标。
- 定位：`src/tools/media-generator/components/MediaTaskCard.vue` 取消按钮 `:icon="Trash2"`（warning），与删除按钮 `TrashIcon`（danger）撞图标。
- 方向：取消按钮换为取消语义图标（CircleX / XCircle），与全项目其它取消场景一致。

### 8. 重新生成按钮常驻
- 反馈：重新生成按钮可以常驻，不用等完成才出现，原理实际是填充到输入框。
- 定位：MessageMenubar.vue:807 `v-if="!isGenerating && buttonVisibility.regenerate"`。
- 方向：去掉 `!isGenerating` 条件，生成中亦可见。

### 9. 模型列表分组删除按钮失效
- 反馈：分组上的删除按钮失效。
- 定位：`src/views/Settings/llm-service/components/ModelList.vue:390` `@confirm.stop="deleteGroup(group)"` —— `el-popconfirm` 的 `confirm` 是组件自定义事件，`.stop` 修饰符生成的守卫会对非 Event 的 `$event` 调 `stopPropagation` 抛错，导致 handler 永不执行。行 400 的 `@click.stop` 与兄弟节点无关，无必要。
- 方向：去掉 `@confirm.stop` 的 `.stop`（及多余的 `@click.stop`）。

### 10. 「立刻发送」按钮丢失输入框内容
- 反馈：点击 agent 消息富文本里的「立刻发送」按钮，会同时清空输入框原有内容，且没带着一起发。
- 定位：ActionButtonNode.vue:101 `case "send"` 仅发送按钮自身 value；清空真凶是 sessionGenerationManager.ts:317 发送流程内 `inputManager.clear(sessionId)`。
- 方向：send 分支先读取输入框现有内容，与按钮内容拼接后一并发送（原有内容在前）。

### 11. 上下文分析器附件无法查看
- 反馈：上下文分析器的附件无法查看。
- 定位：StructuredView.vue:709 用 `castToAsset(att)` 强转管道副本传入 AttachmentCard；副本可能缺 `path`/`originalPath`/`importStatus`，预览 URL 构造失败；另有 ImageViewer z-index 被 Dialog 压过的可能。
- 方向：传卡前按 `assetManagerEngine.getAssetById` 补全完整资产对象；必要时处理查看器层级。

### 12. 媒体生成报错信息截断
- 反馈：报错展示被截断，没有点击或悬停查看完整的能力。
- 定位：MediaTaskCard.vue error-msg 为 `-webkit-line-clamp: 3` 硬截断，无 title、无点击事件。
- 方向：加悬停 tooltip + 点击弹窗查看完整错误。

## 提交计划

每个问题独立提交，修复一批后更新本表状态。
