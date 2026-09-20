# LLM Chat 会话持久化损坏调查与修复（已压缩）

> **状态**：Phase 0 至 Phase 2 已实施并发布；Phase 3（SQLite 演进）保持长期评估
>
> **调查日期**：2026-07-24 至 2026-07-25
>
> **影响范围**：桌面端 `llm-chat` 会话文件、会话索引、分离窗口加载、启动恢复与索引维护
>
> **不在本轮范围**：移动端 SQLite 会话存储、直接清理用户数据、立即迁移桌面端 SQLite
>
> **压缩说明**：已落地的调查过程与设计细节不再在本文件展开，以架构文档
> [`data-persistence.md`](../architecture/data-persistence.md) 和实际实现代码为准。本文件保留结论、边界、
> 未完成项与仍需真实环境执行的验证。

## 1. 故障结论

`llm-chat/sessions-index.json` 与会话文件都曾被 NUL（`\u0000`）字节污染。索引解析失败后，通用
`ConfigManager` 返回默认空索引，启动路径随即把目录中的 2061 个会话文件全部视为新增并逐个解析，
首屏骨架屏阻塞约 20 秒至 50 秒以上；索引重建还无法恢复收藏、收藏夹和当前会话等索引专属数据。

确认的直接原因组合：

1. **覆盖写被进程退出打断。** 最终损坏的会话在旧进程退出前连续启动了 4 次保存，均无完成记录。
2. **并发写已实际发生。** 流式增量保存默认每 2 秒触发，而单次持久化在故障前已增长到约 6 秒，
   时间节流失去背压能力，同一会话出现成对重叠保存。
3. **底层写入先截断正式文件。** `@tauri-apps/plugin-fs@2.5.1` 的 `writeTextFile()` 以
   `truncate: true` 打开目标后直接 `write_all()`，且无 `sync_all()`、无临时文件与替换步骤。
4. **存在隐藏的多 WebView 写者。** 分离窗口挂载时独立执行 `store.loadSessions()`，该路径会同步、
   保存索引并在 3 秒后运行 `repairIndex()`。
5. **保存语义混合职责。** 会话内容保存会顺带覆盖 `currentSessionId`；删除与待写队列无协调，
   迟到的保存可复活已删除文件。

测试用数据规模（调查时只读检查，仍作为性能基线）：2061 个会话文件、总量约 144.5 MiB（最大单文件约
4 MiB）、`sessions-index.json` 约 660 KiB。

完整修复需要同时具备主窗口唯一数据所有者、会话级合并队列与索引单写者、Rust 侧原子替换、
索引最后有效备份与明确加载结果、非阻塞恢复与增量维护，以及三类写入解耦。仅加 debounce 或
启动时多做一次修复不足以覆盖。

## 2. 已实施修复（Phase 0 至 Phase 2）

- **写入协调**：兼容 facade 已将会话内容、索引和当前会话选择的写入接入主窗口
  `SessionPersistenceCoordinator`；每个会话实行“运行一个、等待一个最新状态”，持续 I/O 失败使用
  有上限的退避重试。见
  [`sessionPersistenceCoordinator.ts`](../../services/sessionPersistenceCoordinator.ts) 与
  [`useChatStorageSeparated.ts`](../../composables/storage/useChatStorageSeparated.ts)。
- **原子提交**：Rust `llm_chat_persistence` 模块以领域标识（而非任意路径）进行原子写入，覆盖进程内
  路径锁、跨进程文件锁、临时文件刷盘、Windows `ReplaceFileW`、索引有效备份与修订号拒绝；删除先写
  墓碑再移入 trash。见
  [`llm_chat_persistence.rs`](../../../../../src-tauri/src/commands/llm_chat_persistence.rs)
  （`llm_chat_atomic_write` / `llm_chat_delete_session`）。
- **加载与恢复**：加载层严格验证主索引、备份、残留临时索引和会话 payload，索引不可用时不再伪造空
  索引；主索引损坏样本与会话坏文件被保留/隔离，恢复在首屏后后台执行，含进度、取消、失败数量、
  打开隔离目录、导出诊断与清理入口。见
  [`sessionPersistenceRepository.ts`](../../services/sessionPersistenceRepository.ts)。
- **启动路径**：正常启动只加载索引和当前会话，再对目录文件名做增量核对；手动“刷新会话列表索引”
  复用同一进度与结果报告路径，已移除启动后 3 秒的无条件全量 `repairIndex()`。
- **分离窗口**：不再调用 `store.loadSessions()`，状态由 WindowSyncBus 消费者提供，facade 拒绝分离
  组件窗口的原生写入命令。

数据文件格式、修订号语义、Rust 提交步骤、备份策略与恢复状态机均已在架构文档中固化。

## 3. 关键约束（已落地，改动时不得回退）

- 会话内容保存不得修改 `currentSessionId`；当前会话只能由显式索引操作更新。
- 会话文件与索引的所有写入必须经过 coordinator 与 Rust 原子命令，禁止绕过 `writeTextFile()`。
- 分离窗口不得直接写盘，只能通过 `executeOrProxy()` 请求主窗口。
- 删除必须先写墓碑并取消 pending，运行中的写完成回调在看到墓碑后丢弃索引更新。
- 跨文件顺序固定为“先原子提交会话文件，再更新内存 `contentRevision`，最后提交索引”，以便退出后
  通过 revision 后台修正，不让索引指向未提交内容。
- 索引保留一份永久有效备份；会话文件不保留完整 `.bak`（避免约 150 MiB 数据翻倍）。
- 主索引损坏但备份有效时保持收藏与当前会话；主索引和备份均损坏时进入可交互降级界面，重建在后台
  执行，验证通过前不得覆盖损坏主索引和备份。

## 4. 未完成与长期项

- **Phase 3（长期评估）**：现有文件格式未迁移到 SQLite。后续可先让会话元数据、收藏夹和当前会话
  进入 SQLite，大会话正文继续独立文件或按节点拆表；迁移必须支持回滚和旧文件只读保留。
- **Rust 批量文件指纹扫描**：用于高效发现“同名文件内容变化”，避免 2000 次独立 `stat` IPC。目前为
  评估项，未实施。
- 通用 `ConfigManager.load()` 的错误回退契约未改动；llm-chat 索引已独立，是否复用底层原子写原语
  另行评估。

## 5. 仍需真实环境执行的验证

真实进程中止、Windows 文件占用和多 WebView 竞争无法由普通浏览器或 Vitest 替代，须按
[工具测试指南](../../../../../docs/guide/tool-testing-guide.md)、
[Tauri E2E 说明](../../../../../tests/tauri-e2e/README.md) 与
[Windows UI Automation 说明](../../../../../tests/windows-ui-automation/README.md) 执行。

- **进程中止注入**：在临时文件写入中、刷盘后替换前、会话已替换而索引未替换、索引替换后响应未返回
  等时点结束进程；流式生成期间连续结束并重启 20 次；每次重启断言主文件或备份至少一份有效，且不进
  入阻塞式全量恢复。
- **Rust 原子命令故障注入**：临时文件创建/部分写入/`sync_all()`/备份轮换/正式替换各阶段注入失败；
  目标文件被占用；旧 revision 提交；非法 sessionId 与目录穿越；两个 WebView 同时提交同一路径。
- **跨进程**：两个独立应用进程同时提交同一路径，旧 revision 被拒绝，进程退出后锁自动释放。
- **分离窗口**：断言挂载期间没有任何 llm-chat 写命令。

已实施的前端与 Rust 单元测试见
[`sessionPersistenceCoordinator.test.ts`](../../services/sessionPersistenceCoordinator.test.ts)、
[`sessionPersistenceRepository.test.ts`](../../services/sessionPersistenceRepository.test.ts)
及 `src-tauri` 下对应 Rust 测试。

## 6. 性能基线

以第 1 节数据规模（约 2000 会话 / 150 MiB / 索引 650 KiB / 最大会话 4 MiB）为目标：

| 场景                 | 目标                                          |
| -------------------- | --------------------------------------------- |
| 正常索引首屏         | 不读取全部会话；耗时不随 150 MiB 内容线性增长 |
| 主索引损坏、备份有效 | 使用备份进入 UI，不做阻塞式全量重建           |
| 主索引和备份均损坏   | 500 ms 级进入可交互恢复界面                   |
| 流式生成             | 每会话最大 1 个运行写；pending 深度最大 1     |
| 流式索引写放大       | 不随 token/2 秒增量保存重写索引               |
| 分离窗口启动         | 不扫描全部会话，不调用 llm-chat 写命令        |
| 正常进入后           | 不自动读取 150 MiB 做全量 repair              |

建议验证命令（按实际测试文件调整）：

```powershell
bun run test:run -- <会话持久化相关测试文件>
bun run build:tsc
bun run build:vite
cargo test --manifest-path src-tauri/Cargo.toml llm_chat_persistence
```

## 7. 决策记录

| 决策                              | 理由                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| llm-chat 索引迁出 `ConfigManager` | 需要错误分类、备份、修订和恢复状态，已超出普通扁平配置边界 |
| 使用 Rust 原子写命令              | 前端插件组合无法完整提供刷盘、可靠替换和进程内/跨进程锁    |
| 主窗口唯一写者 + Rust 防御锁      | 同时解决逻辑丢失和结构损坏                                 |
| 会话先提交、索引后提交            | 中间状态可通过 revision 修复，不让索引指向未提交内容       |
| 只为索引保留永久备份              | 索引含不可重建数据；全部会话备份会显著增加空间             |
| 不在首屏自动全量修复              | 可用性优先，恢复应有进度并可取消                           |
| 不立即迁 SQLite                   | 原子写和恢复是独立 P0，长期迁移不能成为延期理由            |

在 Phase 0 与 Phase 1 都完成前不应判定问题彻底解决；两者已落地，剩余风险集中在第 4、5 节所
述的真实环境执行与长期迁移。

## 8. 外部原语参考

- [Tauri v2 File System 插件](https://v2.tauri.app/plugin/file-system/)
- [Rust `std::fs::rename`](https://doc.rust-lang.org/std/fs/fn.rename.html)
- [Windows `ReplaceFileW`](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-replacefilew)
- [Windows `FlushFileBuffers`](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-flushfilebuffers)

