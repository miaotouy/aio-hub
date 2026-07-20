# 移动端开发验证台设计与实施计划

> 状态：Android 虚拟机验收通过，Android 真机已完成一轮部分覆盖验证，待补齐 Android 场景并完成 iOS 验收
> 日期：2026-07-18
> 所属工具：`mobile/src/tools/ui-tester/`
> 目标：为移动端组件、Tauri 平台能力、资产 Phase 0 和 SQLite Phase 0 提供可重复操作、可记录、可导出的真机验证入口。

## 1. 结论

现有 `ui-tester` 已包含安全区、键盘、主题、Logger/Error、Tauri FS 和 Store 的手动测试，但所有内容堆在单个长页面中，结果只是临时字符串，无法承担后续平台能力验收。

下一步将其升级为“组件与平台测试”开发验证台，继续复用 `ui-tester` registry，不新增业务工具。首批新增两个验证板块：

1. **平台文件**：承接资产管理 Phase 0 的文件/照片入口、URI、权限、后台、系统终止和空间不足验证。
2. **SQLite**：承接聊天 SQLite Phase 0 的连接、migration、事务恢复、FTS5 和基准验证。

每个 Phase 0 spike 必须在同一施工批次交付对应 UI 面板。没有面板、没有 Android/iOS 运行记录的后端实验，不视为 Phase 0 完成。

## 2. 产品与安全边界

### 2.1. 定位

- 这是开发/验收工具，不是面向普通用户的资产页或数据库管理器。
- 页面只组织验证场景、输入、执行进度、结果和人工观察，不复制业务实现。
- registry id 和路由保持 `ui-tester` / `/tools/ui-tester`；施工时将显示名称调整为“组件与平台测试”。
- 是否在发布包中隐藏由后续工具可见性机制统一决定，不在本批次硬编码环境判断。

### 2.2. 禁止能力

- 不提供任意 SQL 输入框、数据库浏览器或生产数据库路径选择。
- 不提供任意文件路径读写；文件入口必须来自系统选择器或验证沙箱。
- 不读取、修改或清空真实 `llm_chat.db`、`asset_manager.db` 和用户资产目录。
- 不在报告中保存消息正文、完整文件路径、文件内容、API Key 或其他敏感数据。
- 不用普通浏览器 fallback 伪造 Tauri 平台验证通过。

### 2.3. 隔离策略

- SQLite 固定使用 `ui_tester_validation.db`，所有 destructive action 只作用于该测试库。
- 文件测试固定写入应用 cache/config 下的 `ui-tester-validation/` 沙箱；清理动作不得接受前端传入的绝对目录。
- Rust command 接收结构化场景参数和上限，不接收原始 SQL。
- 大数据集由 Rust 生成，不通过 IPC 传输 10 万条正文。

## 3. 信息架构

`UiTesterView.vue` 只承担顶栏、一级导航、环境状态和子视图容器。一级导航使用项目自研的横向标签/分段导航骨架，不继续用 `var-card` 堆成单页，也不使用 Varlet 容器承担页面结构。

```text
组件与平台测试
├── 总览
│   ├── 当前平台与运行环境
│   ├── 最近验证结果
│   ├── 未完成的跨重启验证
│   └── 导出报告 / 清理测试数据
├── 组件与布局
│   ├── 安全区与键盘
│   ├── 主题与基础组件
│   ├── Settings / Store
│   └── Logger / Message / Dialog
├── 平台文件
│   ├── 文件与照片选择
│   ├── URI 与读取能力
│   ├── 后台 / 系统终止恢复
│   └── 空间不足与临时文件清理
└── SQLite
    ├── 环境与连接配置
    ├── migration / codec
    ├── transaction / crash recovery
    ├── FTS5 / 查询语义
    └── 数据规模基准
```

页面在 360 px 宽度下保持单列。场景列表使用不嵌套的全宽行；点击后进入独立详情区或底部操作面板。运行按钮使用明确命令文字，状态使用图标、颜色和文本共同表达。

## 4. 统一验证运行模型

所有自动与人工场景统一生成 `ValidationRun`：

```ts
type ValidationRunStatus =
  | "idle"
  | "running"
  | "passed"
  | "failed"
  | "cancelled"
  | "manualPending";

interface ValidationRun {
  id: string;
  suiteId: "components" | "platform-files" | "sqlite";
  caseId: string;
  status: ValidationRunStatus;
  startedAt: string;
  finishedAt?: string;
  environment: {
    platform: string;
    osVersion?: string;
    appVersion: string;
    tauriVersion?: string;
  };
  inputSummary: Record<string, string | number | boolean>;
  steps: ValidationStepResult[];
  metrics: Record<string, number | string>;
  error?: { code: string; phase: string; message: string };
  manualObservation?: { verdict: "passed" | "failed"; note?: string };
}
```

规则：

- 自动场景由命令返回结构化 step 和 metrics，前端不解析日志字符串判断成功。
- 文件选择取消、切后台、系统终止、云端下载等无法全自动判定的场景进入 `manualPending`，由用户填写通过/失败和可选备注。
- 需要杀进程的场景在执行前保存最小 resume token；应用重启后总览页恢复该运行并执行检查阶段。
- 默认只保留最近 20 次脱敏运行记录；是否持久化通过 ConfigManager 管理，不另建验证数据库保存报告。
- 支持导出单次或整套 JSON 报告；报告 schema 带版本号，便于比较 Android/iOS 结果。

## 5. 平台文件板块

### 5.1. 操作入口

- 来源模式：文件、照片、多选、云端文件；仅显示当前平台已经实现的入口。
- 场景动作：选择、读取探测、复制到沙箱、生成预览、模拟中断、清理沙箱。
- 结果摘要：选择器返回类型、URI scheme、持久权限状态、MIME、大小、首字节耗时、总读取耗时、是否可重开。
- 原始路径默认掩码，只显示 scheme、文件名和路径 hash；报告不得导出完整路径。

### 5.2. 必备场景

1. 用户取消选择，不产生错误和临时文件。
2. 单文件、多文件、照片和大文件选择。
3. Android `content://`、可用时的 `file://`，以及 iOS picker/security-scoped URL 行为。
4. 云端占位文件下载成功、离线和用户取消。
5. 复制过程中切后台、恢复、系统终止后重启检查。
6. 空间不足或写入失败后没有可见半成品，沙箱可清理。
7. 预览来源在 WebView 可加载，令牌过期或原件缺失时有明确失败状态。

### 5.3. 面板状态

- 未运行、等待系统选择器、读取中、等待人工操作、通过、失败、取消。
- 运行中显示当前阶段和取消按钮，固定格式区域避免进度文本导致布局跳动。
- 系统终止测试必须先显示风险确认，并明确该操作会关闭当前应用进程。

## 6. SQLite 板块

### 6.1. 固定场景

1. **环境检查**：SQLite 版本、compile options、FTS5/trigram、数据库路径类型和连接 options。
2. **连接烟测**：创建、关闭、重开、并发读取和写锁等待。
3. **Migration**：空库到 v1、历史 fixture 升级、失败回滚和高版本拒写。
4. **Codec**：当前完整 `ChatMessageNode`、未知 metadata 字段、可选 timestamp 和附件快照 round-trip。
5. **事务恢复**：在固定注入点中断 transaction，重启后检查半提交、foreign key 和 integrity。
6. **FTS 查询**：简繁中文、日文、英文、emoji、引号、连字符及 1/2/3 字查询。
7. **规模基准**：1 千、1 万、10 万消息预设，记录建库、索引、冷/热查询、会话加载、删除、重建、数据库体积和峰值内存。

### 6.2. 操作约束

- 数据规模使用菜单预设，不允许输入无上限数值；10 万条场景显示耗时与空间确认。
- “重建测试库”和“删除测试库”是 destructive action，二次确认且只能作用于固定测试库。
- benchmark 支持停止；停止后保留已完成指标，并将运行标记为 `cancelled`。
- transaction 强杀场景采用固定 fault point 枚举，不接受用户注入脚本。

### 6.3. 结果呈现

- 顶部显示总状态与已通过/失败/待人工数量。
- 每个步骤显示耗时、结构化摘要和错误阶段；详细日志按需展开。
- 基准结果用紧凑表格比较数据规模与冷/热指标，不用装饰性统计卡片。
- 提供“复制摘要”和“导出报告”，不提供复制数据库内容。

## 7. 代码组织

按页面职责拆分，避免继续扩大单个 `UiTesterView.vue`：

```text
mobile/src/tools/ui-tester/
├── views/
│   ├── UiTesterView.vue
│   ├── ComponentValidationView.vue
│   ├── PlatformFileValidationView.vue
│   └── SqliteValidationView.vue
├── components/
│   ├── ValidationRunHeader.vue
│   ├── ValidationCaseRow.vue
│   ├── ValidationStepList.vue
│   └── ValidationReportActions.vue
├── composables/
│   └── useValidationRuns.ts
├── services/
│   ├── platformFileValidation.ts
│   └── sqliteValidation.ts
└── types/
    └── validation.ts
```

- 视图骨架使用原生 Vue + 项目 token；Varlet 只用于按钮、输入、选择、进度和确认等叶子控件。
- service 只调用固定 Tauri commands，并用模块级 logger/error handler。
- 组件测试页可直接使用底层 Snackbar/Dialog 验证入口；其他业务型验证反馈统一走 `customMessage/customDialog`。

## 8. 实施批次

### 批次 1：验证台骨架

- 将现有长页拆为总览和“组件与布局”子视图，保持现有测试能力不回退。
- 建立统一运行模型、最近记录、跨重启 resume token 和脱敏报告导出。
- registry 显示名称改为“组件与平台测试”。

### 批次 2：平台文件 Phase 0 面板

- 与资产 Phase 0 的 Rust/插件 spike 同批实现固定命令与 UI。
- 完成 Android/iOS 场景运行、人工判定、跨重启恢复和报告导出。
- 将最终文件入口与预览决策回写资产设计文档。

### 批次 3：SQLite Phase 0 面板

- 与 SQLx spike 同批实现测试库、固定 fault point、fixture、FTS 与 benchmark commands。
- 完成 Android/iOS 构建及真机报告；冻结连接配置、migration 和搜索降级策略。
- 删除只为 spike 临时存在且无法从 UI 重复执行的脚本入口。

## 9. 验收标准

- Android/iOS 可从 `ui-tester` 独立完成 Phase 0 所有固定场景，不依赖连接开发机执行临时命令。
- 360 px 宽度下导航、场景行、进度、底部操作区和长错误文本不重叠。
- 运行中、取消、失败、人工待确认和跨重启恢复状态完整。
- 所有 destructive action 只影响测试库/沙箱，并有 Rust 侧路径与数据库名校验。
- 导出报告可复现平台、版本、输入规模、步骤、指标和结论，同时不泄露敏感内容。
- `bun run test:run`、`bun run check:frontend`、`bun run check:backend` 和 `bun run build` 通过。
- Phase 0 结论必须附至少一份 Android 和一份 iOS 的真实 Tauri 运行报告；普通浏览器结果不计入验收。

## 10. 施工记录（2026-07-18）

### 10.1. 已完成

- `ui-tester` 已更名为“组件与平台测试”，原单页拆为总览、组件与布局、平台文件和 SQLite 四个一级板块。
- 已建立统一 `ValidationRun` 模型、最近 20 次 ConfigManager 持久化、人工判定、跨重启恢复标记、JSON 导出和递归脱敏。
- 验证环境已接入官方 `plugin-os`，新运行记录包含平台、系统版本、架构、视口尺寸和像素比；旧 schema `1.0` 报告缺少这些可选字段时仍可读取。
- 组件页保留原安全区、键盘、主题、Settings / Store、Logger / Message / Dialog、FS 和 UUID 测试能力，并增加整体验收记录入口；页面主结构已移除 `var-app-bar` / `var-card`。
- 平台文件接入 Tauri dialog + fs：支持单选、多选、图片过滤入口、用户取消、首字节读取探测、大小/MIME/URI scheme/引用 hash 记录、固定 cache 沙箱 round-trip、失败清理、人工后台/云端/预览观察和强杀恢复检查。多选现在要求至少返回 2 项并在折叠前标题显示数量。
- 平台文件新增固定 64 KiB 缓冲区的大文件完整顺序读取，记录实时进度、停止、首字节、总耗时、MiB/s 和失败阶段；无法取得 provider 文件大小时以 EOF 作为完成条件。该场景验证 `plugin-fs` 读取链，不代表正式资产导入管线。
- 平台文件新增固定 ENOSPC 故障注入，在写入 64 KiB 后验证 `.part` 清理；该场景不占满设备磁盘，也不能替代至少一次真实低存储运行态观察。
- SQLite 后端只构造 `ui-tester-validation/ui_tester_validation.db`，前端不传数据库路径或 SQL；删除、重建和沙箱清理均有 Rust 侧固定名称校验。
- SQLx 负责实际 pool、WAL、`synchronous=NORMAL`、foreign key、busy timeout、并发读取和写锁等待验证；`rusqlite` 负责确定性的 migration fixture、codec、fault injection、FTS5 与大数据基准。两者共用同一 bundled SQLite，避免设备系统 SQLite 编译选项漂移。
- SQLite 已覆盖历史 v0 到 v1、失败回滚、高版本拒写、完整 `ChatMessageNode` 结构 round-trip、trigram FTS + 1/2 字 LIKE 降级、1k/10k/100k Rust 侧生成、冷/热查询、会话加载、删除、索引重建、数据库体积和 SQLite memory 指标。内存指标已由设备上可能返回空值的 `PRAGMA memory_used` 改为 `sqlite3_status64(SQLITE_STATUS_MEMORY_USED)` current/high-water。
- 事务恢复和平台系统终止场景会在风险确认后直接终止进程；恢复标记先同步持久化，应用重启后自动检查半提交、foreign key、integrity 和沙箱半成品，并回填原运行结论。
- 已通过 `bun run test:run`、`bun run check:frontend`、`bun run check:backend`、`bun run build`、Rust 单元测试和 `bun run mtab -- --debug` Android universal APK / AAB 构建。

### 10.2. 实施说明与偏差

- 原计划批次 3 只写了“SQLx spike”。实际采用 SQLx + `rusqlite` 双层验证：SQLx 验证未来业务连接契约，`rusqlite` 提供更适合固定故障注入和同步 fixture 的底层测试控制；业务数据库仍未接入任一验证 command。
- “照片”入口当前由 Tauri 系统文件选择器加图片扩展名过滤实现，不引入 Varlet 页面骨架或浏览器 fallback。Android Photo Picker / iOS Photos 的专用入口如后续资产 Phase 0 选型不同，应替换 service 入口并保留现有运行模型。
- 云端占位下载、离线、系统权限持久化、切后台和 WebView 预览属于平台不可稳定自动判定项，已按计划实现为 `manualPending`，必须在真机报告中填写结论。
- 大文件完整读取仍通过 WebView 到 `plugin-fs` 的分块 IPC 执行，只用于验证选择结果的读取权限、生命周期和方向性吞吐；正式资产导入必须继续由 Rust 资产服务流式处理。

### 10.3. 平台验收状态（更新于 2026-07-20）

- Android 虚拟机已完成人工测试，项目内主要组件、平台文件与 SQLite 验证场景基本通过。
- 已取得新的 Android 真机 schema `1.0` 脱敏报告 `aio-validation-2026-07-20.json`（`exportedAt = 2026-07-20T01:27:44.309Z`；默认文件名现包含完整时间戳）：环境为 Android 11.0.0、aarch64、应用 `0.1.1-m-beta.2`、Tauri `2.11.5`；报告共 20 条 run，全部通过，视口 393 x 851、像素比 2.75。
- Android 真机 SQLite 已通过 migration/失败回滚/高版本拒绝、消息 codec、FTS5 trigram + 短词 `LIKE`、事务强杀恢复和 1k/10k/100k 基准。1k/10k/100k 整步耗时 21/94/697 ms，插入耗时 5/40/434 ms；100k 数据库 6,594,560 bytes，SQLite high-water 5,343,704 bytes。
- Android 真机平台文件已验证 `content://` 多文件（`selectionCount = 2`）与照片读取、沙箱原子完成、失败清理、固定 ENOSPC 注入、后台返回和系统终止后无半成品恢复。大文件样本 66,603,617 bytes（63.52 MiB），64 KiB 分块完整读取，首字节 102 ms、总耗时 25,936 ms、平均 2.45 MiB/s。
- 新报告仍未覆盖真实低存储设备、云端离线/取消、预览失效、专用 Photo Picker/分享入口、具体设备型号以及 iOS security-scoped URL；旧报告保留了选择器取消和云端预览人工通过记录，Android 真机通过仍不等同于双平台 Phase 0 最终验收。
- 2026-07-20 Android 16 x86_64 虚拟机补充报告已验证环境字段、ENOSPC 注入以及 SQLite 1k/10k/100k。100k 总步骤 665 ms、插入 396 ms、数据库 6,594,560 bytes、SQLite memory high-water 5,343,704 bytes；10k high-water 1,043,080 bytes，1k high-water 181,944 bytes。
- 虚拟机复测确认语言设置可以即时应用到 i18n locale。验证页自身仍有大量硬编码中文，无法在该页通过整页翻译变化观察结果；验证台 i18n 覆盖留作后续 UI 收尾，不影响语言设置能力本身的通过结论。
- 大文件完整读取复测通过：Android `content://` 样本 14,714,525 bytes（14.03 MiB），65,536-byte 块完整读取，首字节 231 ms、总耗时 4,360 ms、平均 3.22 MiB/s，`failurePhase = none`。该数据只代表 Android 16 x86_64 虚拟机的 `plugin-fs` 读取链，真机和 iOS 仍需分别运行。
- iOS 尚未验收，仍需从应用内依次运行平台文件和 SQLite 固定场景并导出一份 schema `1.0` JSON 报告。
- 第 9 节要求的 Android 与 iOS 真实设备报告尚未全部完成，因此当前结论代表 Android 11 真机验证台通过，不等同于 Phase 0 双平台最终验收。
