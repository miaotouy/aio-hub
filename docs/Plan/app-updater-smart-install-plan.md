# AIO Hub 应用内更新与智能安装计划

> 状态：In Progress  
> 创建时间：2026-06-24  
> 适用范围：桌面端 AIO Hub（Tauri v2 / Vue 3 / Rust）  
> 关联入口：`src/views/Settings/about/AboutSettings.vue`、`src-tauri/tauri.conf.json`、发布流水线、用户文档

## 0. 当前进度

2026-06-24 已完成代码层接入：

- 已添加 `tauri-plugin-updater` / `@tauri-apps/plugin-updater`。
- 已添加 `tauri-plugin-process` / `@tauri-apps/plugin-process`，用于更新安装后重启。
- 已在 Rust builder 注册 updater / process 插件。
- 已在默认 capability 中放行 `updater:default` 和 `process:default`。
- 已新增 `src/services/app-updater.ts`，优先走 Tauri updater，失败时回退 GitHub Releases。
- 已新增 `src/composables/useAppUpdater.ts`，管理检查、下载、安装、重启状态。
- 已改造 `src/views/Settings/about/AboutSettings.vue`，支持应用内安装更新和手动下载兜底。
- 已新增 `scripts/generate-updater-manifest.ts`，用于从 GitHub Release assets 生成 Tauri updater `latest.json`。
- 已改造 `.github/workflows/build.yml`，预留 updater 签名环境变量，收集 updater artifact / `.sig`，并在发布前按需生成 `latest.json`。
- 已新增 `docs/guide/release-updater.md`，记录 GitHub Release asset 方案和需要人工准备的密钥 / Secret。
- 已通过 `bun run build:tsc` 和 `cargo check --manifest-path src-tauri/Cargo.toml`。

尚未完成发布层接入：

- `src-tauri/tauri.conf.json` 暂未配置 `plugins.updater.pubkey` 和 `plugins.updater.endpoints`，因为真实发布公钥和更新清单地址尚未确定。
- 暂未启用 `bundle.createUpdaterArtifacts`，避免没有 `TAURI_SIGNING_PRIVATE_KEY` 的本地构建失败。
- 在发布公钥、私钥 Secret 和测试 Release 准备好之前，应用会自动回退到 GitHub Releases 手动下载路径。

## 1. 背景

当前 AIO Hub 的“检查更新”能力主要位于 `src/views/Settings/about/AboutSettings.vue`：

- 前端请求 GitHub Releases latest API。
- 使用 `compare-versions` 判断远端版本是否高于当前版本。
- 发现新版本后展示 Release Notes。
- 用户点击后跳转 GitHub Releases 页面手动下载。

当前桌面端打包配置位于 `src-tauri/tauri.conf.json`：

- Windows 产物使用 NSIS。
- Linux 产物使用 AppImage / deb。
- 尚未接入 Tauri v2 updater 插件。
- 尚未生成 updater artifacts / signature。

用户反馈集中在 Windows NSIS 升级体验：下载安装包后再运行，实际表现更像“卸载旧版、安装新版”，会产生割裂感，也会让用户担心配置、数据、快捷方式和安装目录是否被保留。

## 2. 目标

### 2.1 用户体验目标

- 用户可在应用内完成“检查更新、查看更新内容、下载、安装、重启”闭环。
- 默认路径不再要求用户打开浏览器、手动下载安装包。
- Windows 更新尽量走无交互或少交互安装，降低“卸载重装”的感知。
- 保留手动下载作为兜底，避免 updater 异常时用户无法更新。
- 在安装前识别关键运行状态，避免打断正在进行的任务。

### 2.2 工程目标

- 使用 Tauri 官方 updater 作为主更新机制。
- 继续保留 NSIS 完整安装包作为首次安装和兜底渠道。
- 建立签名、清单、版本通道、发布产物的一致规则。
- 将更新能力从 About 页面内联逻辑抽离为可测试的服务 / composable。
- 保持文档与真实行为同步。

## 3. 非目标

- 第一期不自研二进制差分更新。
- 第一期不实现完全静默更新。
- 第一期不替换 NSIS 安装器。
- 第一期不处理移动端更新。
- 第一期不把普通浏览器验证当作 Tauri 更新验证。

## 4. 推荐技术路线

### 4.1 主方案：Tauri v2 updater 插件

接入：

- Rust：`tauri-plugin-updater`
- 前端：`@tauri-apps/plugin-updater`
- 配置：`plugins.updater`
- 发布：`createUpdaterArtifacts`

参考：

- Tauri updater 插件文档：https://v2.tauri.app/plugin/updater/
- Tauri updater 安全说明：https://v2.tauri.app/plugin/updater/#security
- Windows installMode：https://v2.tauri.app/plugin/updater/#installmode-on-windows

Tauri updater 的关键收益：

- 更新包强制签名校验。
- 自动比较当前版本与更新清单版本。
- 前端可获得下载进度。
- 支持下载后安装并重启。
- Windows 可通过 NSIS updater artifact 继续复用现有安装体系。

### 4.2 Windows 安装模式

Windows 使用：

```json
{
  "installMode": "passive"
}
```

原因：

- `passive` 是推荐模式，安装过程有进度窗口但不需要用户逐步点击。
- `quiet` 虽然更静默，但无法自行请求管理员权限，不适合作为默认更新路径。
- `basicUi` 交互感更重，不符合“智能安装”的目标。

### 4.3 更新通道

建议至少拆分两个通道：

- `stable`：只推正式版。
- `preview`：推 alpha / beta / rc / stable。

当前版本形态为 `0.6.3-alpha.9`，属于 preview 通道。不要只依赖 GitHub `releases/latest`，因为它通常不适合精细控制预发布通道。

推荐清单：

```text
https://update.aiohub-app.com/stable/latest.json
https://update.aiohub-app.com/preview/latest.json
```

如果暂时没有独立更新域名，可以先使用 GitHub Release asset 托管 `latest.json`，但后续建议迁移到可控静态域名或轻量更新接口。

## 5. 版本命名规则

Tauri updater 清单中的 `version` 必须是有效 SemVer。建议统一：

```text
稳定版：v0.6.3
预览版：v0.6.4-alpha.1
测试版：v0.6.4-beta.1
候选版：v0.6.4-rc.1
```

允许：

```text
0.6.3
v0.6.3
0.6.3-alpha.10
0.6.3-beta.1
0.6.3-rc.1
```

避免：

```text
0.6
0.6.3_alpha_10
0.6.3 alpha 10
release-0.6.3
```

注意：

- `0.6.3-alpha.10` 大于 `0.6.3-alpha.9`。
- `0.6.3-alpha.10` 小于 `0.6.3`。
- 正式版会高于同版本号的任意预发布版。
- `package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml` 的桌面端版本必须同步。

## 6. 更新清单设计

### 6.1 静态清单示例

```json
{
  "version": "v0.6.4-alpha.1",
  "notes": "Release notes in Markdown",
  "pub_date": "2026-06-24T00:00:00Z",
  "platforms": {
    "windows-x86_64": {
      "signature": "UPDATER_ARTIFACT_SIGNATURE",
      "url": "https://github.com/miaotouy/aio-hub/releases/download/v0.6.4-alpha.1/AIO.Hub_0.6.4-alpha.1_x64-setup.nsis.zip"
    },
    "linux-x86_64": {
      "signature": "UPDATER_ARTIFACT_SIGNATURE",
      "url": "https://github.com/miaotouy/aio-hub/releases/download/v0.6.4-alpha.1/AIO.Hub_0.6.4-alpha.1_amd64.AppImage.tar.gz"
    }
  }
}
```

实际文件名以 Tauri build 生成产物为准，不要在代码中硬编码猜测。

### 6.2 动态清单备选

如果后续需要更细粒度控制，可以将 endpoint 改为动态接口：

```text
GET /api/updates/:channel/:target/:arch/:currentVersion
```

接口可根据以下信息决定是否推送：

- 当前版本。
- 系统平台。
- CPU 架构。
- stable / preview 通道。
- 是否灰度。
- 是否存在召回版本。

第一期不需要动态接口，静态清单足够。

## 7. 前端设计

### 7.1 模块拆分

新增建议：

```text
src/services/app-updater.ts
src/composables/useAppUpdater.ts
```

职责：

- `app-updater.ts`：封装 Tauri updater API、版本通道、错误归一化。
- `useAppUpdater.ts`：维护 UI 状态、下载进度、安装状态、用户操作。
- `AboutSettings.vue`：只负责展示和触发操作。

### 7.2 状态模型

```ts
type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "not-available"
  | "downloading"
  | "downloaded"
  | "installing"
  | "failed";
```

建议保存：

- 当前版本。
- 目标版本。
- 更新通道。
- 下载进度。
- 下载速度。
- 错误信息。
- 上次检查时间。
- 是否为手动检查。

### 7.3 关于页交互

手动检查：

- “检查更新”按钮保持。
- 有更新时展示 BaseDialog。
- Release Notes 继续用 `RichTextRenderer`。
- 主按钮从“前往下载”改为“立即更新”。
- 次按钮提供“稍后提醒”。
- 额外链接保留“手动下载”。

下载中：

- 展示进度条、已下载大小、总大小。
- 允许取消仅在插件能力支持且不会留下坏状态时提供；第一期可不做取消。

下载完成：

- 若应用处于空闲状态，提示“安装并重启”。
- 若存在运行中任务，提示“下载完成，可稍后安装”。

安装中：

- Windows 安装开始后应用可能退出，这是预期行为。
- UI 文案需要说明“应用将关闭并完成安装”。

### 7.4 启动自动检查

第二期再做自动检查。建议策略：

- 启动后延迟 15-30 秒。
- 每 12-24 小时最多自动检查一次。
- 自动检查失败只写日志，不打扰用户。
- 自动发现更新时显示轻量通知，不强制弹窗。
- 用户可在设置中关闭自动检查。

## 8. 后端 / Tauri 配置

### 8.1 Cargo 依赖

新增：

```toml
tauri-plugin-updater = "2"
```

### 8.2 Rust 插件注册

在 Tauri builder 中注册 updater 插件。具体位置以 `src-tauri/src/lib.rs` 当前 builder 初始化代码为准。

### 8.3 前端依赖

新增：

```json
"@tauri-apps/plugin-updater": "^2"
```

使用 Bun 安装，不使用 npm / yarn / pnpm。

### 8.4 tauri.conf.json

新增 updater 配置和 updater artifacts 配置。示例：

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "windows": {
        "installMode": "passive"
      },
      "pubkey": "PUBLIC_KEY",
      "endpoints": [
        "https://github.com/miaotouy/aio-hub/releases/latest/download/latest.json"
      ]
    }
  }
}
```

实际配置需按 Tauri v2 schema 校验，避免把 NSIS installer 配置和 updater installer 配置混淆。

## 9. 发布流水线

### 9.1 签名密钥

需要生成 updater signing key：

- 私钥：仅存 CI Secret。
- 公钥：写入 `src-tauri/tauri.conf.json`。
- 私钥密码：如使用，单独存 CI Secret。

不得将私钥提交到仓库。

### 9.2 CI 环境变量

建议：

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

名称以 Tauri CLI 当前要求为准。

### 9.3 Release assets

每次发布至少上传：

- 完整安装包。
- updater artifact。
- `.sig` 签名文件。
- `latest.json` 或用于生成清单的元数据。
- SHA-256 校验信息。

当前 GitHub Release asset 方案已准备：

- `scripts/generate-updater-manifest.ts` 从 Release 文件目录扫描同名 `.sig` 和 artifact。
- 能识别 `windows-x86_64-nsis`、`linux-x86_64-appimage`、`linux-x86_64-deb`、`darwin-x86_64-app`、`darwin-aarch64-app` 等 Tauri updater 平台键。
- 没有签名产物时跳过生成 `latest.json`，避免发布不可用清单。
- 详细操作见 `docs/guide/release-updater.md`。

### 9.4 清单发布

发布成功后更新：

- stable 通道：仅正式版触发。
- preview 通道：alpha / beta / rc / stable 触发。

建议清单更新作为发布流程最后一步，确保用户不会拿到指向缺失 artifact 的清单。

## 10. 智能安装策略

### 10.1 任务保护

安装前检查：

- 是否有下载任务进行中。
- 是否有媒体生成 / 转写 / OCR / 知识库索引等长任务进行中。
- 是否有未保存配置或正在写入的数据。

第一期可以只提供轻量保护：

- 手动点击“立即更新”时提示应用将关闭。
- 后续再接入全局任务状态。

第二期增强：

- 下载可后台进行。
- 安装前若有任务，默认进入“稍后安装”。
- 标题栏或设置页展示“更新已下载”状态。

### 10.2 失败兜底

失败场景：

- 无网络。
- GitHub / 更新域名访问失败。
- 清单格式错误。
- 签名校验失败。
- artifact 下载失败。
- 安装权限不足。

兜底：

- 展示可读错误。
- 写入模块日志。
- 保留“手动下载”链接。
- 不要吞掉签名校验失败；这是安全事件，应明确提示。

### 10.3 日志

使用模块级 logger：

```ts
createModuleLogger("AppUpdater");
createModuleErrorHandler("AppUpdater");
```

记录：

- 当前版本。
- 目标版本。
- 通道。
- endpoint。
- 平台。
- 下载开始 / 完成 / 失败。
- 安装开始。

避免在同一个 catch 中同时调用 `logger.error()` 和 `errorHandler.error()` 造成重复记录。

## 11. 文档同步

需要更新：

- `docs/architecture/settings-architecture-overview.md`
  - About 模块从“GitHub API 检查更新”改为“Tauri updater + 手动下载兜底”。
- `docs/user-guide/troubleshooting.md`
  - 更新 Q2：说明应用内可下载并安装更新。
  - 增加 updater 失败时的手动下载路径。
- 发布说明或维护文档
  - 记录版本命名、通道、签名密钥、清单更新规则。

## 12. 分阶段计划

### Phase 0：发布与版本规则确认

- [ ] 确认 stable / preview 通道命名。
- [ ] 确认更新清单托管位置。
- [ ] 确认版本 tag 规则统一使用 `vX.Y.Z` / `vX.Y.Z-alpha.N`。
- [ ] 确认 CI Secret 命名。

### Phase 1：最小可用闭环

- [x] 添加 Rust updater 插件依赖。
- [x] 添加前端 updater 插件依赖。
- [x] 添加 process 插件依赖，用于安装后重启。
- [x] 注册 Tauri updater 插件。
- [x] 注册 Tauri process 插件。
- [x] 放行 updater / process capability。
- [ ] 配置 updater pubkey / endpoints。
- [ ] 启用 updater artifacts 生成。
- [x] 抽离 `app-updater` 服务。
- [x] 改造 About 页手动检查更新。
- [x] 保留手动下载链接。
- [x] 本地类型与 Rust 编译验证通过。
- [ ] 使用测试 release 验证检查、下载、安装。

### Phase 2：智能安装体验

- [ ] 增加下载进度 UI。
- [ ] 增加“下载完成，稍后安装”状态。
- [ ] 增加启动自动检查。
- [ ] 增加检查频率控制。
- [ ] 增加用户设置：自动检查更新 / 更新通道。
- [ ] 接入基础任务保护。
- [ ] 增加失败兜底文案。

### Phase 3：发布治理

- [x] CI 自动上传 updater artifacts 和签名。
- [x] CI 自动生成 GitHub Release asset `latest.json`。
- [ ] CI 自动更新 stable / preview 通道清单。
- [ ] 清单更新放到发布流程最后一步。
- [ ] 增加 release checklist。
- [ ] 增加 SHA-256 校验发布说明。

### Phase 4：增强与观测

- [ ] 记录更新失败类型和可诊断日志。
- [ ] 增加更新回滚 / 召回策略文档。
- [ ] 评估动态更新接口。
- [ ] 评估灰度发布。
- [ ] 评估 CEF / WebView2 双轨产物对 updater 通道的影响。

## 13. 验证计划

### 13.1 静态检查

- [ ] `bun run build:tsc`
- [ ] `bun run check:backend`
- [ ] `bun run lint`

### 13.2 构建检查

- [ ] `bun run tauri:build`
- [ ] 检查 NSIS 完整安装包生成。
- [ ] 检查 updater artifact 生成。
- [ ] 检查 `.sig` 文件生成。

### 13.3 手动升级矩阵

Windows：

- [ ] 从 `0.6.3-alpha.9` 升级到 `0.6.3-alpha.10`。
- [ ] 从 alpha 升级到同版本正式版，如 `0.6.3-alpha.10` -> `0.6.3`。
- [ ] 普通用户权限安装。
- [ ] 管理员权限安装。
- [ ] 安装目录保留。
- [ ] 配置和聊天数据保留。
- [ ] 桌面快捷方式 / 开始菜单快捷方式行为符合预期。

Linux：

- [ ] AppImage 更新链路可用。
- [ ] deb 用户手动下载兜底可用。

### 13.4 失败注入

- [ ] 清单不可访问。
- [ ] artifact 不可访问。
- [ ] 签名错误。
- [ ] 版本低于当前版本。
- [ ] 网络中断。
- [ ] 磁盘空间不足。

## 14. 风险与对策

| 风险                       | 影响 | 对策                                                           |
| -------------------------- | ---- | -------------------------------------------------------------- |
| 签名私钥泄露               | 高   | 私钥只放 CI Secret，定期轮换，泄露后更换 pubkey 并发布安全公告 |
| 清单先于 artifact 发布     | 中   | 清单更新作为发布最后一步                                       |
| 预发布通道误推 stable 用户 | 中   | stable / preview endpoint 分离                                 |
| Windows 权限不足           | 中   | 默认使用 passive，保留手动安装兜底                             |
| 更新时打断任务             | 中   | 第二期接入任务保护，第一期安装前明确提示                       |
| GitHub 访问不稳定          | 中   | 后续迁移到可控静态域名或 CDN                                   |
| 文档与行为不一致           | 低   | 每期改动同步更新用户文档和架构文档                             |

## 15. 决策记录

- 采用 Tauri 官方 updater 作为主路线。
- 不自研下载 exe 后运行的更新器作为主路线。
- NSIS 继续保留，用于首次安装和 updater artifact。
- Windows 默认采用 passive 安装模式。
- 版本命名统一 SemVer，并推荐 tag 使用 `v` 前缀。
- 预发布和稳定版使用独立通道。
- 第一期先使用 GitHub Release asset 托管 `latest.json`；stable 可使用 `releases/latest/download/latest.json`，preview 后续需要独立清单地址。
