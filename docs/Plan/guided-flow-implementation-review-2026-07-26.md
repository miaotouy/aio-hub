# Guided Flow 施工结果审查报告

> 审查日期：2026-07-26  
> 审查范围：`docs/Plan/guided-flow-plan.md` 对应的 Phase 1–3 实现、最近 Guided Flow/升级/知识库迁移提交及其自动化测试  
> 结论：主体架构和正常迁移链路已经落地，但仍有 3 个产品逻辑缺陷、4 个测试可信度问题、2 个 runner 安全/收尾缺口和 1 个格式门禁失败。当前结果不宜视为发布候选包验收完成。

## 1. 审查对象

重点核对以下实现与计划契约：

- `src/services/guided-flow/`
- `src/components/common/GuidedFlow/`
- `src/flows/upgrade/`
- `src/flows/knowledge-migration/`
- `tests/tauri-e2e/`
- 提交 `eed23cd8e`、`a9f02cd4f`、`018e1f1f4`、`beca925d7`、`4c5a250b7`

本次只进行调查和报告，不修改实现代码。

## 2. 总体判断

以下施工目标已有代码和测试支撑：

- Guided Flow 的注册、排队、持久化、恢复、回放和终态回调已落地；
- 升级说明与知识库迁移已组合到同一流程，正常路径最多 5 个可见步骤；
- 步骤条已改为点式导航，并保留隐藏的可访问性文本；
- 旧知识库启动检测、显式确认、真实 IPC 迁移、结构化报告、正常完成后的同根重启和独立清理场景已有自动化覆盖；
- 迁移步骤在 `onNext` 后变为不可见时，Manager 能按定义顺序进入下一个可见步骤；
- 相关单元测试、前端类型检查和 Tauri E2E 支持测试当前通过。

但正常路径通过不等于异常恢复和发布门禁完成。下面的问题会影响延后版本说明、部分迁移恢复、待办状态，以及测试对清理和幂等声明的证明力度。

## 3. 产品逻辑缺陷

### P0-1 跨版本升级会丢失此前延后的版本说明

**触发方式**

1. 在版本 A 打开升级流程并选择“稍后查看”；
2. `lastLaunchedVersion` 已更新为 A，但 A 的版本说明没有写入 `releaseNotes`；
3. 用户安装版本 B 并启动；
4. 旧状态因 `context.currentVersion !== B` 不再作为可恢复状态；版本说明选择逻辑又只选择大于 A 的 manifest。

**结果**

A 的未处理版本说明不会进入 B 的聚合升级流程，只能通过其他手动入口偶然看到。这违反计划中“延后版本说明在后续升级中仍应继续进入候选集合”的契约。

**证据**

- `src/flows/upgrade/releaseNotesRegistry.ts:87`
- `src/flows/upgrade/index.ts:56`
- `docs/Plan/guided-flow-plan.md:277`

**建议**

自动选择应以“本地存在且未确认”为事实基础，再结合当前版本上界和降级策略筛选；不能仅以 `lastLaunchedVersion` 作为下界。补充 A 延后后升级到 B 的回归测试。

### P0-2 主数据部分失败后，“重试”不会重新执行迁移

**触发方式**

迁移返回报告，但 `mainStatus !== "completed"`。Manager 展示错误并允许重试；重试重新调用当前步骤的 `onEnter`。

**结果**

`onEnter` 看到已有 `snapshot.report` 就直接返回，不再调用 `knowledgeMigrationService.run()`。步骤校验又要求主数据完成，因此用户被困在当前步骤，界面上的重试没有恢复能力。

**证据**

- `src/flows/knowledge-migration/knowledgeMigrationContribution.ts:78`
- `src/services/guided-flow/guidedFlowManager.ts:283`
- `src/flows/knowledge-migration/components/MigrationVerifyStep.vue:42`

**建议**

只对完整成功报告跳过执行；部分/失败报告应允许显式重试，并在重试前重新 preview 和核对 migration ID、source fingerprint。增加部分主数据失败后重试的单元测试和真实 Tauri 场景。

### P1-1 向量部分失败会被错误标记为 contribution completed

**触发方式**

主数据迁移完成，但 `vectorStatus !== "completed"`、`pendingVectors > 0` 或报告存在问题。

**结果**

检测和执行路径都只按 `mainStatus` 设置 contribution 状态。升级中心会认为该事项已完成，隐藏“继续升级事项”，而报告实际上是部分成功。

**证据**

- `src/flows/knowledge-migration/knowledgeMigrationContribution.ts:27`
- `src/flows/knowledge-migration/knowledgeMigrationContribution.ts:89`
- `src/flows/upgrade/index.ts:167`

**建议**

定义统一的“报告完全通过”判定：主数据完成、向量完成、`pendingVectors === 0` 且无 issues。它应同时驱动 contribution 状态、清理步骤可见性和完成摘要。为向量 partial、待重建和 issues 三种情况增加测试。

## 4. 测试与 runner 问题

### P1-2 runner 的中断和异常路径没有执行计划中的清理策略

`stop()` 只停止进程；staged app-data 只在 `exitCode === 0` 时删除。Ctrl+C、WDIO 超时或 runner 抛错均不会走统一 `finally` 收尾，与计划声明不符。

- `tests/tauri-e2e/run.ts:291`
- `tests/tauri-e2e/run.ts:942`
- `docs/Plan/guided-flow-plan.md:554`

建议实现明确的 `on-success`、`always-keep`、`always-delete` 策略，并让 signal、异常和普通退出共享一次幂等收尾。

### P1-3 staging 与清理没有防御目标路径中的 symlink/junction

来源 fixture 会拒绝符号链接，但 staged 目标及其父目录只做词法路径和目录内容检查。若受控路径中的目录被替换为 symlink/junction，写入或递归删除的真实对象可能越界。

- `tests/tauri-e2e/support/migration-fixture.ts:216`
- `tests/tauri-e2e/support/migration-fixture.ts:264`

建议对受控根、run root、data dir 的每一层做 `lstat`/realpath 校验；Windows 下明确拒绝 reparse point，并补充 symlink/junction 测试。

### P1-4 cleanup E2E 可能在清理动作无效时仍通过

测试没有在点击“确认清理”前证明 legacy 目录和预期文件存在，只在之后断言目录不存在。如果迁移步骤提前删除目录，或夹具阶段未正确保留目录，测试仍可能通过。

- `tests/tauri-e2e/specs/guided-knowledge-migration-cleanup.spec.ts:69`
- `tests/tauri-e2e/specs/guided-knowledge-migration-cleanup.spec.ts:94`

建议在清理前记录并断言 manifest 文件存在；清理后核对精确删除集合。持久化状态应解析 JSON，并比较 migration ID、source fingerprint 和 removed paths，而不是使用字符串包含判断。

### P2-1 manifest 的 pendingVectors/issues 没有参与 E2E 验收

manifest 声明并校验了这两个预期值，但 runner 没有注入环境，spec 硬编码期望为 0。fixture 契约和实际断言未闭环。

- `tests/tauri-e2e/support/migration-fixture.ts:99`
- `tests/tauri-e2e/run.ts:627`
- `tests/tauri-e2e/specs/guided-knowledge-migration.spec.ts:157`

### P2-2 正常重启测试不能完整证明“没有重复写入”

recovery spec 验证最终计数、报告、向量覆盖率和流程未再次显示，但没有比较迁移记录代际、更新时间或写入次数。幂等 upsert 即使再次执行，也可能得到相同最终状态。

- `tests/tauri-e2e/specs/guided-knowledge-migration-recovery.spec.ts:42`
- `tests/tauri-e2e/specs/guided-knowledge-migration-recovery.spec.ts:67`

文档将其描述为“正常完成后的同根重启最终状态幂等”更准确；进程中断恢复仍未实现，现有文档第 11.4.6 和 11.4.7 已承认这一缺口。

### P2-3 UI 数量断言使用子串匹配

集合数期望为 `1` 时，UI 显示 `10` 也能满足 `includes("1")`。后续 IPC 严格相等会保护业务结果，但 UI 展示契约仍可能假阳性。

- `tests/tauri-e2e/specs/guided-knowledge-migration.spec.ts:84`

建议直接读取已有 metric testid 下的 `<strong>` 文本并严格比较。

## 5. 计划状态与声明修正

计划顶部和 Phase 3 将主体实现标为完成是合理的，但发布状态仍应明确区分：

- 已完成：正常迁移、正常完成后的同根重启最终状态验证、独立清理 happy path；
- 未完成：迁移中终止整个 Tauri 进程后的恢复/重试；
- 未完成：有可追溯旧正式发布版本的 release fixture；
- 未完成：发布候选安装包 smoke test；
- 待修复：本报告 P0/P1 问题及测试证明缺口。

因此，`migration-minimal` 当前不能替代 `migration-interruption`，正常二次启动也不能表述为完整的“进程中断恢复”。

## 6. 原始审查验证结果（修改前）

执行结果如下：

- `bun run test:run -- src/flows src/services/guided-flow src/components/common/GuidedFlow`：通过，6 个文件、21 个测试；
- `bun run check:frontend`：通过；
- `bun run test:tauri:e2e:unit`：通过，10 个文件、55 个测试；
- `bun run format:check`：失败，以下 3 个文件不符合 Prettier：
  - `src/flows/knowledge-migration/components/MigrationBackupStep.vue`
  - `src/flows/knowledge-migration/components/MigrationCleanupStep.vue`
  - `src/services/guided-flow/__tests__/guidedFlowManager.test.ts`

以上是修改前审查时的验证记录；本次处理后的新增门禁与真实 Tauri 结果见第 8 节。

## 7. 建议处理顺序

1. 修复跨版本延后说明丢失和主数据部分失败无法重试两个 P0 问题；
2. 统一迁移“完全成功/部分成功”判定，修复 contribution 状态；
3. 加固 fixture 目标路径和统一 runner 收尾策略；
4. 收紧 cleanup、manifest 预期和正常重启断言；
5. 修复格式门禁后，重跑单元测试、类型检查、E2E 支持测试以及两个真实 Tauri 迁移 preset；
6. 最后实现 `migration-interruption`，再进行可溯源旧正式版本和发布候选安装包验收。

## 8. 处理结果（2026-07-26）

本次按本报告建议顺序完成以下修复：

- **P0-1 已修复**：版本说明自动选择不再把 `lastLaunchedVersion` 当作下界；升级时会聚合当前版本上界以内、本地存在且尚未确认的版本说明，并新增跨版本延后回归测试。
- **P0-2 已修复**：迁移步骤仅对“主数据、向量、待重建数量和问题明细均通过”的报告跳过执行；部分/失败报告重试时会重新 preview，并校验 migration ID 与 source fingerprint 后再次执行。
- **P1-1 已修复**：新增统一的完整报告判定，检测、执行状态、阻塞范围、清理步骤和校验页共用同一判定；向量 partial、待重建和 issues 不会再被标记为 contribution completed。
- **P1-2 已修复**：staged runner 使用受控的 disposable/always-delete 收尾策略；正常退出、WDIO 异常、信号和 runner 异常共用幂等清理，显式 `AIO_E2E_DATA_DIR` 仍始终保留。
- **P1-3 已修复**：fixture staging、marker 和 cleanup 对受控路径逐层执行 `lstat`/`realpath` 检查，拒绝 symlink、junction 和 reparse point，并增加单元测试。
- **P1-4 已修复**：cleanup E2E 在确认前验证 manifest 声明的源文件存在，清理后严格比较删除集合，并解析持久化 JSON 核对迁移身份、指纹和删除路径。
- **P2-1 已修复**：runner 注入 manifest 的 `pendingVectors`、`issues` 和 allowed paths，迁移 E2E 使用 manifest 期望值而非硬编码 `0`。
- **P2-3 已修复**：迁移 UI 数量断言改为读取 metric 下的 `strong` 文本并严格相等比较。
- **P2-2 已澄清**：正常同根重启 E2E 的表述收紧为“最终状态一致且流程不再入队”的幂等验证，不再宣称证明没有重复写入；进程中断恢复仍未实现。

已通过的本地门禁：

- `bun run test:run -- src/flows src/services/guided-flow src/components/common/GuidedFlow`
- `bun run check:frontend`
- `bun run test:tauri:e2e:unit`
- `bun run format:check`
- `bun run build:vite`
- `bun run test:tauri:e2e -- --preset migration-minimal`
- `bun run test:tauri:e2e -- --preset migration-cleanup`

尚未在本次修改中完成、仍需单独排期的发布验收项：`migration-interruption`、部分主数据失败的真实 Tauri 重试故障注入场景、可溯源旧正式发布版本 fixture，以及发布候选安装包 smoke test。
