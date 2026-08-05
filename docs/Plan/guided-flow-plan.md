# Guided Flow 引导模块收口计划

> 状态：运行时、领域迁移、长交互容器和版本说明分层已实现；完成真实 Tauri 验证前不得视为 UI 收口
>
> 最近更新：2026-08-03
>
> 关联方案：
>
> - [Guided Flow 长交互容器与升级信息分层方案](./guided-flow-long-interaction-redesign.md)
> - [知识库迁移方式重构方案](../../src/tools/knowledge-base/docs/Plan/knowledge-base-guided-migration-refactor-plan.md)

## 1. 文档定位

本文已合并原施工审查和 UI 改进记录，只保留当前稳定契约、已落地结果和剩余验收。实现细节以以下源码为准：

- `src/services/guided-flow/`：定义、注册、排队、持久化与运行时；
- `src/stores/guidedFlowStore.ts`：UI 状态桥接；
- `src/components/common/GuidedFlow/`：宿主、壳层、导航与页脚；
- `src/flows/upgrade/`：生命周期、版本说明 registry 和升级事项组合；
- `src/components/notification/`：版本说明通知入口与通知动作分发；
- `src/flows/knowledge-migration/`：旧 Knowledge/Recall 数据迁移 contribution。

首次设置和模块教程属于后续独立需求，不是本轮发布门禁。

## 2. 已落地范围

### 2.1 通用运行时

- 流程定义与业务执行分离，业务步骤通过 registry 注册。
- 支持优先级排队、条件步骤重算、恢复、延后、显式跳过、关闭请求和终态回调。
- 流程实例按版本持久化；定义版本不匹配时重新初始化，避免用旧快照解释新步骤。
- `replay` 为只读回放，不修改已完成或已跳过终态。
- 迁移动作必须先检测、预览和确认；不可逆操作不得由 UI 展示自动触发。

### 2.2 版本升级流程

- 根 `package.json` 是应用版本唯一来源；release manifest 必须与精确 SemVer 和 stable/prerelease channel 一致。
- `app-lifecycle.json` 有独立 schema 和有序迁移，不把 `createConfigManager` 的版本字段当作应用或领域数据版本。
- 自动选择版本说明时会聚合当前版本上界以内、本地存在且尚未确认的说明，不因跨版本延后而丢失。
- 目标信息架构中，版本说明进入通知中心并由独立阅读面板展示；迁移事项单独进入 Guided Flow。
- 关于页分别提供版本说明、继续升级事项和检查更新入口。
- 首次无生命周期记录时使用 `unknown-baseline`；可以按 manifest 策略展示当前说明一次，但不得伪造来源版本。

### 2.3 知识库迁移流程

- Recall 启动不再静默导入旧数据，只初始化 schema、恢复新存储并记录候选来源。
- 预览与执行通过 migration ID、source fingerprint、用户确认和并发占用共同约束。
- 来源检测、备份确认、执行进度、校验报告与可选清理收敛为一个可见迁移步骤。
- 执行过程报告阶段、集合、条目、待重建向量与问题数量；完成后重新 warmup 内存读模型。
- 只有主数据、向量、待重建数量和问题明细全部通过，才允许标记 contribution 完成。
- 部分成功或失败后重试会重新预览并再次核对 migration ID 与 source fingerprint。

## 3. 生命周期与数据基线

应用版本、生命周期 schema 与领域数据 schema 分层持久化：

| 场景                                     | 生命周期判断       | 版本说明               | 数据迁移                     |
| ---------------------------------------- | ------------------ | ---------------------- | ---------------------------- |
| 有旧配置或旧 Recall 数据，首次启动当前版 | `unknown-baseline` | 展示当前说明一次       | 仅由旧数据事实触发           |
| 有旧配置但无可迁移数据                   | `unknown-baseline` | 展示当前说明一次       | 不创建迁移事项               |
| 全新安装                                 | `unknown-baseline` | 展示当前说明一次       | 不创建迁移事项               |
| 已记录当前版，随后启动更高版本           | `upgrade`          | 收集新版本及未确认说明 | 只检测适用且未完成的领域迁移 |

旧用户与全新安装可能共享 `unknown-baseline`，这是有意行为。缺少历史记录时不能推断旧版本；领域迁移必须由实际数据检测决定。

## 4. UI 与交互契约

当前 UI 实现已经具备流程壳层和迁移步骤，但手测暴露出通用弹窗承载长交互时的尺寸抖动、滚动责任不清和版本说明/迁移信息混杂问题。新的目标契约以[长交互容器与升级信息分层方案](./guided-flow-long-interaction-redesign.md)为准：

- Guided Flow 运行时仍保持通用，但长交互展示层不再复用 `BaseDialog`；专用容器自行负责固定几何、遮罩、步骤导航、内容滚动和 footer 边界。
- 版本说明属于阅读信息，进入通知中心并从通知或关于页打开独立阅读面板；版本说明已读不得等同于迁移完成。
- 数据迁移只有在真实检测到待处理 contribution 时才打开 Guided Flow，不因只有版本说明而弹出多步流程。
- 外层 panel 在流程存活期间保持固定宽高；步骤切换、错误提示、执行态和清理展开只能改变内部内容区。
- 外层进入/退出动画只允许 `opacity` 和 `transform`，禁止使用会覆盖几何属性的 `transition: all`。
- 默认 footer 与 step-owned footer 必须显式互斥；迁移步骤内部子阶段不得造成双 footer、空占位或外层重新测量。
- 流程步骤进度与步骤内任务进度分开表达，避免把长任务百分比误认为流程页数。
- 视觉值使用主题变量，错误、部分成功、等待重建与完成不得只靠颜色区分。
- Knowledge 工具、关于页和通知中心都只提供入口，不复制领域迁移执行逻辑。
- 普通浏览器构建或组件测试不能证明窗口稳定；必须以真实 Tauri WebView 的尺寸采样和截图/录屏作为“抖动已修复”的证据。

## 5. 已合并的施工审查结论

2026-07-26 的 review 问题均已进入主实现并关闭：

- 修复跨版本升级丢失延后版本说明的问题。
- 修复主数据或向量部分失败后错误跳过重试、错误标记完成的问题。
- runner 的正常退出、异常和信号路径使用同一幂等收尾；显式 `AIO_E2E_DATA_DIR` 始终保留。
- fixture staging、marker 与 cleanup 拒绝 symlink、junction 和 reparse point，并核对解析后的受控路径。
- cleanup E2E 严格校验删除集合、迁移身份、指纹和持久化结果。
- E2E 使用 manifest 的 `pendingVectors`、`issues` 和 allowed paths，UI 数量断言改为精确匹配。
- 正常同根重启只证明最终状态一致且流程不再入队，不再被表述为“证明无重复写入”。
- 生命周期 schema、未知基线策略、release note 精确版本检查和无旧数据检测已有自动化覆盖。

## 6. 当前剩余门禁

只有以下项目仍阻塞“发布候选迁移验收完成”的结论：

- [ ] `migration-interruption`：真实进程中断后的恢复、重试和最终状态一致性。
- [ ] 部分主数据失败的真实 Tauri 故障注入与再次执行。
- [ ] 从可溯源旧正式发布版本制作只读 fixture，并记录来源、校验值和预期迁移结果。
- [ ] 使用发布候选安装包完成首次启动、同根重启、迁移恢复与卸载/残留 smoke test。
- [ ] 发布版本切换时提供与根 `package.json` 精确匹配的 release manifest 与正文资源；alpha 资源不能替代 stable 资源。
- [ ] 在真实 Tauri WebView 中证明已实现的长交互 Surface 在步骤切换、执行、失败、重试和清理展开时不会改变外层 panel 几何，并验证版本说明通知/阅读面板不污染迁移状态。

## 7. 已通过的门禁记录

以下命令曾在对应施工批次通过；后续改动仍应按影响范围重新执行，而不是引用历史结果代替验证：

```text
bun run test:run -- src/flows src/services/guided-flow src/components/common/GuidedFlow scripts/__tests__/check-release-notes.test.ts
bun run test:tauri:e2e:unit
bun run check:release-notes
bun run check:frontend
bun run format:check
bun run build:vite
bun run test:tauri:e2e -- --preset guided-flow-baseline
bun run test:tauri:e2e -- --preset migration-minimal
bun run test:tauri:e2e -- --preset migration-cleanup
```

## 8. 完成口径

满足以下条件后删除本文，并将长期契约并入 Guided Flow/升级流程架构文档：

- 第 6 节全部关闭并记录环境、fixture 和结果；
- 同一版本只生成一次稳定键通知，关于页和通知均可打开独立阅读面板且不污染迁移终态；
- 未经确认不执行不可逆迁移；失败或部分成功有明确恢复入口；
- 主应用发布候选包通过精确版本、真实旧数据和重启场景验收。

## 11.4 旧数据迁移自动化验收

此标题保留原有外部链接锚点。当前执行约束如下：

1. 使用真实 Tauri E2E 的隔离 `AIO_DATA_DIR`，不得在开发者真实 AppData 上运行。
2. fixture 必须只读、来源可追溯，并在 staging 前后校验路径、marker 和内容摘要。
3. 自动化至少覆盖检测、确认、迁移、最终状态一致性重启和独立清理；中断恢复与部分失败重试是当前缺口。
4. runner 只能自动删除自己创建且通过 `lstat`/`realpath` 安全检查的 disposable 目录；显式传入的数据目录始终保留。
5. 发布候选包必须再用经审核的旧正式版本快照执行 smoke test，自动化合成 fixture 不能替代该证据。
