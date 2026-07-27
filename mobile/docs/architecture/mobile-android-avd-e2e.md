# 移动端 Android AVD E2E 架构与运行契约

> 文档状态：已实施的长期架构文档；2026-07-23 已完成 Android Studio AVD 核心、恢复和 Ollama lanes；Android 真机与 iOS 门禁仍独立保留。
> 日期：2026-07-21
> 范围：Android Studio AVD、移动端 Tauri WebView、Android 系统 UI、资产主流程与聊天附件发送
> 不包含：Android 真机发布门禁、iOS 自动化、相机硬件、真实低存储设备和第三方 Android 模拟器控制

## 1. 结论

移动端现有 Vitest、Rust 测试和 `ui-tester` 固定场景已经覆盖大量业务与平台逻辑，但 Android 运行态仍主要依赖人工点击和截图观察。下一步应建立仓库级 Android AVD E2E runner，用脚本驱动正式 debug APK、Tauri WebView 和系统选择器，并让截图退回到失败证据与视觉复核角色。

首选控制层为 Appium 2 + UiAutomator2：

- 原生上下文负责应用启动、系统 DocumentsUI、Photo Picker、权限弹窗和前后台切换。
- WebView 上下文负责通过稳定 `data-testid`、可访问名称和 DOM 状态操作 AIO Hub 页面。
- ADB 只负责设备生命周期、安装、端口映射、fixture 准备、进程控制和日志采集，不以坐标点击作为常规 selector。
- `ui-tester` 继续提供设备内固定场景和结构化报告，不承担外部 UI 驱动职责。
- runner 根据目标 AVD 的主 ABI 只构建和安装单 ABI APK；日常 E2E 不构建多 ABI universal APK、AAB 或无关 ABI，避免将多份 Rust native library 打入同一测试包。
- 命令进程退出后，runner 会有界收集 stdout/stderr；若 Windows 子进程继续持有继承管道，已确认的退出码与已捕获输出仍可继续用于 APK 检查，避免把成功构建误判为流关闭超时。

桌面端 [`tests/tauri-e2e/`](../../../tests/tauri-e2e/README.md) 已有确定性 OpenAI-compatible 服务、隔离 fixture 和脱敏产物模型。Android runner 应复用其中可移植的协议服务与结果模型，不复制第二套不同语义的 mock。

## 2. 目标与非目标

### 2.1 目标

1. 一条命令启动或复用明确指定的 Android Studio AVD，安装 APK，执行用例并生成机器可读结果。
2. 自动覆盖应用内页面、Tauri IPC、Rust 领域命令、系统文件选择器和 Android 生命周期操作。
3. 为资产导入、预览、导出、删除影响、重启恢复和聊天附件发送建立稳定回归。
4. 将附件发送拆成确定性协议验收和可选 Ollama 模型验收，两者分别记录结果。
5. 失败时自动保留截图、UI hierarchy、WebView DOM 摘要、logcat 和脱敏服务端请求摘要。
6. 明确 AVD 自动化与 Android 真机、iOS 发布门禁的边界，禁止用模拟器结果冒充真机结论。

### 2.2 非目标

- 不通过截图识别决定下一次点击。
- 不依赖固定屏幕坐标、当前中文文案或控件视觉位置。
- 不自动接管当前用户正在使用的第三方模拟器。
- 不为了测试把 Ollama 或协议服务暴露到局域网。
- 不在测试产物中记录 API Key、Authorization header、附件正文、完整本机路径或未脱敏数据库。
- 不用测试专用 IPC 直接完成被测业务动作；fixture seeding 可以走受限测试入口，导入、发送、删除和恢复必须由正式 UI/领域链路触发。

## 3. 设备所有权与安全边界

### 3.1 默认设备策略

- 默认只允许 Android Studio AVD。runner 通过 SDK `emulator -list-avds` 解析配置，并要求显式或默认的 AVD 名称。
- 当前默认候选为 `Medium_Phone_API_36`；具体名称通过 `AIO_MOBILE_E2E_AVD` 覆盖，不写死端口。
- runner 启动前记录已有 `adb devices -l`、AVD 名称、serial、model、SDK 和 `ro.boot.qemu`。
- 锁定 serial 后读取 `ro.product.cpu.abi` 作为构建依据，`ro.product.cpu.abilist` 只用于诊断。即使 x86_64 AVD 通过翻译层报告兼容 `arm64-v8a`，也不得因此额外构建 ARM 产物。
- runner 创建的所有 ADB、Appium 和文件操作都必须携带目标 serial；检测到多个设备时禁止使用隐式默认设备。
- 第三方模拟器默认排除。当前正在使用的 LDPlayer/雷电实例不得被安装应用、建立 `adb reverse`、清数据、重启或关闭。
- 只有 runner 在本次执行中启动的 AVD 才允许在结束时关闭。已在运行的 Android Studio AVD即使被显式选中，也默认保留运行。

### 3.2 应用与数据隔离

- 首期使用专用 AVD 快照和 debug APK，测试前可对目标 AVD 内的 `com.aiohub.mobile` 执行清数据；不得对非测试设备执行。
- fixture 文件写入目标 AVD 的测试目录，并通过系统媒体扫描或 DocumentsUI 可见目录暴露。
- 测试 Profile、会话和资产只能存在于该 AVD 的测试应用数据中。
- runner 必须在开始前输出设备身份摘要，在任何 destructive action 前再次核对 serial 与 AVD 名称。

### 3.3 ABI 与 E2E 构建产物

Android ABI 与 Tauri target 使用固定映射：

| Android 主 ABI | Tauri target |
| -------------- | ------------ |
| `x86_64`       | `x86_64`     |
| `x86`          | `i686`       |
| `arm64-v8a`    | `aarch64`    |
| `armeabi-v7a`  | `armv7`      |

- 当前默认 Android Studio AVD 是 x86_64，阶段零的可重现构建命令为 `bun scripts/build-android.ts --apk --debug --target x86_64 --ci`。runner 应调用同一构建入口并动态替换 target，不另外拼接 Gradle 任务。
- 单设备 E2E 禁止省略 `--target`，也不使用 `--split-per-abi`；后者用于一次产出多个分 ABI 包，仍会浪费构建时间和磁盘。E2E 只生成 APK，不生成不参与安装的 AAB。
- runner 支持复用预构建 APK，但安装前必须解析 APK 的 `lib/<abi>/` 目录。当包含多个 native ABI、缺少目标 ABI、或文件名声称的 ABI 与包内不一致时直接失败，不得继续安装。
- 构建缓存和产物目录必须包含 profile 与 Tauri target，禁止在 x86_64 与 ARM64 AVD 之间复用未标记 ABI 的“最新 debug.apk”。
- `e2e-run.json` 记录设备主 ABI、Tauri target、APK SHA-256、包内 ABI 列表和字节数。具名 preset 默认以 80 MiB 单 ABI E2E debug APK 为基线，超过基线在安装前失败；可通过显式门禁参数审查有意的基线变更，防止多 ABI universal debug 包悄然回归。Tauri 即使把单 target APK 放在 `universal/` flavor 目录，也以包内 native ABI 为判定依据，不能只检查路径或文件名。

ABI 拆分只解决重复 native library，不会自动消除 debug symbol。2026-07-22 本机现有 APK 样本中，x86_64-only debug 包仍为 235.4 MiB，而 ARM64 release 包为 29.2 MiB。因此实施分两步：

1. 阶段零先使用现有单 ABI debug 构建，保证 Appium 可枚举 WebView，立即避免四 ABI universal debug 包。
2. 阶段一增加专用 E2E 打包模式：保留 Android app debuggable 和 WebView debugging，但不把无需的 JNI debug symbol 装入 APK；需要的 native symbol 作为宿主机诊断产物单独保留。该模式必须先验证 WebView context、Rust panic/logcat 和失败取证，不能为了缩包破坏 E2E 可观测性。

## 4. 总体架构

```text
Bun runner
  |- AVD lifecycle / explicit adb serial
  |- Appium server + UiAutomator2 driver
  |- deterministic OpenAI-compatible server
  |- optional Ollama preflight
  |- fixture and artifact manager
  `- scenario result aggregator
       |
       v
Android Studio AVD
  |- AIO Hub debug APK / Tauri WebView
  |- DocumentsUI / Photo Picker / permission UI
  `- app private SQLite and managed assets
```

建议目录：

```text
tests/mobile-android-e2e/
|- README.md
|- run.ts
|- appium.config.ts
|- capabilities.ts
|- presets.ts
|- specs/
|  |- smoke.spec.ts
|  |- asset-workflow.spec.ts
|  |- chat-attachment.spec.ts
|  `- restart-recovery.spec.ts
|- support/
|  |- avd.ts
|  |- adb.ts
|  |- appium.ts
|  |- android-selectors.ts
|  |- fixtures.ts
|  |- openai-conformance.ts
|  |- ollama-preflight.ts
|  `- artifacts.ts
`- fixtures/
   |- image.png
   |- note.txt
   `- export-targets.json
```

公共 OpenAI-compatible 服务核心优先从 `tests/tauri-e2e/support/openai-mock-core.ts` 复用或抽取。Android 专属代码只负责 AVD 网络地址、场景断言和移动端附件请求摘要。

## 5. Selector 与运行时控制契约

### 5.1 应用 WebView

- debug APK 必须验证 Appium 能枚举并切换到 AIO Hub WebView context；若无法枚举，阶段零先修复 debug WebView 可调试性，不能回退到坐标点击。
- 业务关键入口增加稳定 `data-testid`，命名表达业务语义，不包含列表序号或翻译文本。
- 可交互图标必须有可访问名称；Appium 可以使用 accessibility selector 作为原生上下文降级路径。
- 等待以可观察状态为准，例如元素出现、按钮恢复、任务进入终态或消息状态完成，不使用固定长时间 sleep。

### 5.2 Android 系统 UI

- DocumentsUI、Photo Picker 和权限弹窗优先使用系统 resource-id、控件类型和 accessibility 属性。
- 本地化文本只能作为辅助条件，不能作为唯一 selector。
- 每次系统 UI 失败都保存当前 package/activity、UiAutomator hierarchy 和截图。
- 系统选择器行为按 Android API level 维护少量 selector adapter，不在单个用例里堆叠设备特判。

### 5.3 生命周期动作

- 前后台切换使用 Appium activate/background API 或显式 `adb shell am`，并在动作后核对目标 package 状态。
- 进程终止、冷启动和应用数据清理只通过带 serial 的 ADB helper 暴露，不允许用例拼接任意 shell。
- 重启恢复用例必须保留同一 AVD 与应用数据，只重启应用进程；清数据属于下一场景的隔离步骤。

## 6. 本机服务与附件验收

### 6.1 确定性 OpenAI-compatible 验收

默认门禁使用本机精简协议服务。AVD 通过 `10.0.2.2:<port>` 访问；如某环境必须使用反向映射，只能对当前目标 serial 建立并在结果中记录。

服务至少实现：

- `GET /v1/models`，返回固定模型 ID。
- `POST /v1/chat/completions`，支持当前移动端使用的流式 SSE 响应。
- 解析消息内容中的图片或文件载荷，记录 MIME、解码后字节数和 SHA-256。
- 根据收到的附件摘要生成固定响应，使测试能够证明服务端确实收到预期内容，而不只是收到一次 HTTP 请求。
- 记录脱敏请求摘要，不保存 Authorization、完整 base64 或用户正文。

该场景证明：资产选择、`ManagedAssetRef`、Rust 资产解析、Provider wire、原生 HTTP Transport、流式响应、消息持久化和最终 UI 状态形成闭环。它不证明真实模型理解附件语义。

### 6.2 Ollama 可选模型验收

Ollama lane 使用明确支持所测附件类型的模型，例如视觉模型处理固定图片。Android Studio AVD 优先访问 `http://10.0.2.2:11434/v1`，必要时使用仅绑定目标 serial 的 `adb reverse` 与 `http://127.0.0.1:11434/v1`。

规则：

- runner 先检查宿主机 `/api/tags`、目标模型存在性和 AVD 内 HTTP 响应。
- 不自动下载模型，不在缺失时静默回退到确定性协议 lane。
- 模型 lane 使用“收到非空有效回复 + 请求确实到达目标”的断言；内容语义只做稳定的宽松判断。
- Ollama 结果与确定性协议结果分开记录，任一结果都不能替代 Android 真机或 iOS 门禁。

## 7. 首批场景

### 7.1 Smoke

1. 冷启动进入首页并确认 7 个工具注册完成。
2. 进入设置页切换语言和主题，重启后确认持久化。
3. 进入组件与平台测试页，执行一个无破坏性的环境检查并读取结构化结果。

### 7.2 资产 Android MVP 主流程

1. 通过正式文件入口打开 DocumentsUI 并选择固定图片。
2. 等待 import job 完成，断言资产列表和详情的 MIME、大小、状态与来源。
3. 打开受控预览，断言媒体加载完成；关闭后由固定协议场景验证旧 token 不可用。
4. 通过 save picker 导出，核对目标文件大小与 SHA-256。
5. 检查删除影响，执行无引用删除或 advisory 回收，并断言列表/详情状态。
6. 在导入或任务状态存在时重启应用，断言恢复结果和临时文件清理。

### 7.3 聊天附件确定性闭环

1. 写入隔离的 OpenAI-compatible Profile，并确认模型可选。
2. 从聊天输入区打开资产选择器，选择 ready 图片并发送。
3. 协议服务断言 MIME、字节数和 SHA-256 与 fixture 一致，然后返回分段 SSE。
4. UI 断言用户消息附件、流式助手消息和完成状态。
5. 重启应用，断言会话、消息、附件快照和完成回复从 `llm_chat.db` 恢复。
6. 删除会话，等待 usage outbox 投递并通过正式 UI/固定验证入口确认 usage 释放。

### 7.4 失败与恢复

- 用户取消文件选择，不生成资产或错误任务。
- 协议服务返回 4xx、流中断和超时，消息进入明确错误状态且附件草稿/历史状态符合当前契约。
- 原件在发送前为 `reclaimed` 或 `missing` 时阻断发送并保留草稿。
- 应用在 import job 或流式响应中被终止，重启后不得显示伪完成状态。

## 8. 产物与隐私

每次运行始终保存：

- `e2e-run.json`：设备、APK、场景、耗时和通过状态。
- `request-summaries.jsonl`：端点、状态、附件 MIME/大小/hash 和流事件数量。
- runner/Appium 的结构化日志。

仅失败时额外保存：

- 当前应用和系统 UI 截图。
- UiAutomator hierarchy。
- WebView 当前 URL、context 和有限 DOM 摘要。
- 受时间与行数限制的 logcat。

产物目录不得包含 API Key、Authorization header、完整附件 base64、聊天正文、完整本机路径或原始数据库。所有日志使用已有脱敏规则，并为移动端请求摘要增加固定测试。

## 9. 已实施能力与记录

### 阶段零：驱动可行性

- [x] 固定 Appium 与 UiAutomator2 版本，建立最小 runner。
- [x] 读取目标 AVD 主 ABI，通过现有 Android 构建入口只生成对应 target 的 debug APK，校验包内 ABI 后安装并枚举原生/WebView context。
- [x] 用稳定 selector 完成首页到资产页往返，不使用坐标。
- [x] 验证 DocumentsUI 可跨 package 操作并选择固定 fixture。
- [x] 验证 runner 只关闭自己启动的 AVD，第三方模拟器全程不受影响。

### 阶段一：生命周期与产物

- [x] 实现显式 serial、AVD 启停、APK 安装、清数据和 fixture helper。
- [x] 增加专用单 ABI E2E 打包模式，在保留 WebView 调试与失败诊断能力的前提下剥离 APK 内无需的 JNI debug symbol。
- [x] 实现失败截图、hierarchy、DOM 摘要、logcat 和脱敏结果聚合。
- [x] 增加纯 Bun 单元测试，覆盖设备选择、ABI/target 映射、多 ABI APK 拒绝、第三方模拟器拒绝、命令参数和清理所有权。
- [x] 在根 `package.json` 增加 `test:mobile:e2e`、`test:mobile:e2e:unit` 与具名 preset 入口。

### 阶段二：Smoke 与资产主流程

- [x] 为关键 UI 增加稳定 `data-testid` 和可访问名称。
- [x] 完成 smoke、文件导入、预览、导出、删除影响和重启恢复场景。
- [x] 将当前依赖人工点击的 Android AVD smoke 替换为脚本结果。

### 阶段三：附件协议与 Ollama

- [x] 复用或抽取桌面 E2E 的 OpenAI-compatible mock core。
- [x] 实现附件 MIME、大小和 SHA-256 断言及流式响应。
- [x] 完成聊天附件确定性闭环并加入 Android MVP 自动化门禁。
- [x] 增加显式 opt-in Ollama lane；缺少模型时明确 skip 或按参数 fail。

### 阶段四：稳定性与扩展

- [x] 覆盖选择取消、HTTP 错误、流中断、原件缺失和进程终止恢复。
- [x] 连续运行至少 10 次核心 preset，消除 selector、启动和异步等待的偶发失败。
- [x] 评估是否在 CI 提供支持虚拟化的专用 Windows runner；本地入口完成不依赖 CI 决策。

> 2026-07-23 实施记录：`tests/mobile-android-e2e/` 已提供 Appium/UiAutomator2 runner、单 ABI APK 校验、失败取证、确定性附件服务、恢复 preset 和 opt-in Ollama preset。Ollama 使用已安装的 `qwen3.5:9b` 通过 Profile 自定义 `Origin` 头完成真实附件回复；`tauri-plugin-http` 以 `unsafe-headers` feature 允许该本地 CORS 兼容头。核心 preset 以 runner 每轮独占冷启动并自动关闭 `Medium_Phone_API_36` 的方式，从 `2026-07-22T21-04-43-198Z` 到 `2026-07-22T21-26-39-778Z` 连续 10 次通过；fixture 与导出文件按 run id 隔离，避免 DocumentsUI/MediaStore 索引跨轮污染。Android Studio AVD 结果不改变 Android 真机和 iOS 发布门禁。

> 2026-07-23 验收整改：具名 preset 增加 80 MiB APK 基线，`e2e-run.json` 不再记录绝对路径，Appium/emulator/DOM/hierarchy/logcat/activity 产物统一脱敏。Smoke 通过正式 UI tester 页面执行 sandbox round-trip；资产场景增加详情大小/来源、取消不创建 import job 和预览 token 撤销断言；恢复场景增加延迟首响应 timeout lane，并修复聊天请求未应用 `requestSettings.timeout` 的运行时缺口。当前 APK 的 `core` 与 `recovery` preset 均重新通过。

## 10. 持续回归标准

- 一条 Bun 命令可以从明确的 Android Studio AVD 开始并输出最终退出码与 JSON 结果。
- runner 只构建与目标 AVD 主 ABI 对应的 APK，安装前验证包内只有该 ABI；常规 E2E 不产生多 ABI universal APK、多份 split APK 或 AAB。
- `e2e-run.json` 包含设备主 ABI、构建 target、APK hash/大小/包内 ABI，且 APK 大小回归能被预设基线检出。
- 多设备连接时所有命令显式绑定 serial；未选择设备时拒绝执行 destructive action。
- 当前用户运行中的雷电/LDPlayer 或其他第三方模拟器不发生安装、端口映射、清数据、重启或关闭。
- 核心用例不使用坐标、截图识别或固定 sleep 控制流程。
- 资产主流程和聊天附件确定性闭环连续 10 次通过。
- 协议服务能证明收到与 fixture 一致的附件内容，并验证流式回复最终持久化。
- 普通成功运行不产生逐步截图；失败产物足以复盘 selector、系统 UI、WebView 和后端日志状态。
- Android AVD 结果只解除自动化回归门禁；Android 真机主流程和 iOS 仍分别保留发布门禁。E2E 运行日志、DOM、UI hierarchy、logcat 和 activity 产物统一脱敏，不记录输入正文、凭据或完整本机路径。

## 11. 关联文档

规则或运行边界变化时同步更新：

- [`platform-validation-workbench-plan.md`](../../src/tools/ui-tester/docs/Plan/platform-validation-workbench-plan.md)：设备内固定场景与外部 E2E runner 的职责边界。
- [`mobile-asset-manager-design.md`](../plan/mobile-asset-manager-design.md)：附件确定性闭环、可选模型 lane 与 Android 真机门禁。
- [`mobile-sqlite-migration-plan.md`](../plan/mobile-sqlite-migration-plan.md)：将“迁移”明确为发布前存储重构，并接入重启恢复 E2E。
- [`mobile-current-implementation-audit.md`](../archive/mobile-current-implementation-audit.md)：记录自动化补齐状态，不把旧人工 smoke 当作长期回归方案。
- [`docs/guide/tool-testing-guide.md`](../../../docs/guide/tool-testing-guide.md)：增加 Android AVD E2E 入口、selector 和设备所有权规范。
