# 前端 Chunk 体积与装载边界收口计划

> 状态：Monaco ESM-only 与 Tokenizer 资产化已完成；自动分包基线、运行态观测和少量构建边界待按数据推进
>
> 最后更新：2026-07-28
>
> 关联配置：[`vite.config.ts`](../../vite.config.ts)

## 1. 当前结论

构建警告不能通过继续提高 `chunkSizeWarningLimit` 解决，但大 chunk 也不等于首屏瓶颈。当前应分别看安装体积、首页静态闭包、按需工具成本和真实 Tauri 的读取/解析/执行时间。

已完成的两项高收益治理：

1. 移除 AMD Monaco，只保留统一 ESM 入口和 Worker 工厂。
2. 将七个内置 Tokenizer 从 JavaScript 模块拆为构建期 gzip 资产，首次使用时按需解压。

当前 registry 与插件初始化的实测中位数约 294 ms，没有证据支持全仓改造成异步 catalog。后续只做可回滚的自动分包实验、精确观测和低风险懒加载。

## 2. 已完成结果

### 2.1 Monaco ESM-only

- `src/utils/monaco.ts` 统一注册 Editor、JSON、CSS、HTML 和 TypeScript Worker。
- `@guolao/vue-monaco-editor` 显式使用本地 ESM Monaco，阻断 CDN fallback。
- 移除 `@tomjs/vite-plugin-monaco-editor`、AMD HTML 注入和完整 `min/vs` 复制目录。
- Text Diff、Web Canvas、Agent Manager、Quick Action 等运行时入口统一使用同一模块。
- 真实 Tauri 窄 E2E 覆盖 Diff Editor、Worker factory 和 AMD/CDN 请求边界。

2026-07-26 构建记录：

| 指标                   |     实施前 |     实施后 |
| ---------------------- | ---------: | ---------: |
| `dist` 原始体积        | 约 134 MiB | 119.35 MiB |
| JavaScript 原始体积    |  91.68 MiB |  77.32 MiB |
| JavaScript gzip        |  30.42 MiB |  26.86 MiB |
| AMD Monaco 复制目录    |  14.97 MiB |   不再生成 |
| 首页额外 AMD Monaco JS |   3.64 MiB |          0 |

Monaco ESM 核心和 Worker 仍是编辑器路由的按需成本，不进入首页 preload，不应为消除单 chunk 警告再次复制或拆出 AMD 运行时。

### 2.2 Tokenizer 资产化

- `builtin-tokenizer-assets-manifest.ts` 维护七个内置包与 profile 的资产来源。
- Vite 插件在构建期输出 `dist/tokenizers/<profile>/*.json.gz`，开发模式使用同一路径中间件。
- `tokenizerAssetService` 通过 `fflate` 解压，并复用现有 Worker 的 `needProfileData` / `profileData` 协议。
- Worker 与主线程不再动态导入七个 `@lenml/tokenizer-*` 大型 JavaScript 入口。
- 用户导入和远端缓存 profile 的注册表协议保持不变。

2026-07-26 构建记录：七个 gzip 资产约 15.54 MiB；JavaScript 降至约 40.87 MiB（gzip 12.05 MiB），相对 Monaco 阶段后的基线减少约 36.45 MiB 原始 JS。14 个资产解压后均与来源字节一致。

## 3. 仍需实施

### P1：验证自动分包

先移除粗粒度 `manualChunks` 做可回滚对照，不以“chunk 数更少”作为目标。

验收必须同时记录：

- `index.html` 静态 preload 数量和原始/gzip 体积；
- Home、普通工具、编辑器、PDF Viewer 和插件路由的按需请求；
- `dist` 总体积与重复依赖；
- 真实 Tauri 冷/暖启动各至少 10 次的中位数和 P95；
- `bun run build:tsc` 与 `bun run build:vite`。

只有自动分包造成稳定回归时，才增加窄而可解释的分组；禁止为消警告继续提高阈值。

### P3：观测与低风险入口清理

2026-07-27 的三次启动中，44 个 registry、38 个工具和 2 个插件的 `registry + plugins` 为 200–343 ms，中位数 294 ms；`WebView Started -> MainLayout ready` 中位数 789 ms。现有证据不支持大规模 `ToolDescriptor`、异步 discovery 或首次调用实例化。

先增加统一 performance marks：

- `bootstrap-start`、`vue-mounted`、`window-shown`；
- `app-init-start`、`registry-imports-done`、`plugins-loaded`；
- `main-layout-ready`、`first-route-rendered`。

低风险候选仅限公开方法本来就是异步、且没有启动恢复职责的 registry 壳层，例如 `git-committer`、`window-automator`、`recall`、`ffmpeg-tools`、`git-analyzer`、`aio-file-operator` 和 `dir-search`。每项必须单独核对直接调用、factory、dispose、插件和类型契约。

重新评估全局 registry 拆分的触发条件：

- `registry + plugins` 中位数稳定超过 500 ms 或 P95 超过 1 s；
- `window-shown -> first-route-rendered` P95 超过 1 s，且主要成本确认在 registry；
- 插件数量增长导致启动耗时近似线性恶化；
- 未使用工具产生可观常驻内存、监听器或后台任务；
- Detached / Canvas 因无关主应用依赖出现明确卡顿。

### P4：剩余构建边界

按影响处理，不将所有 warning 都升级为阻塞项：

- ineffective dynamic import；
- 插件 Node 脚本 glob；
- PDF Viewer 独立预算；
- `file-type` 等第三方警告；
- 首屏 gzip、单 chunk 和总 JavaScript 体积预算检查。

## 4. 停止条件

- 若自动分包和首批低风险懒加载没有稳定可测收益，保持当前 registry 模型并结束性能重构。
- 任一入口改造若改变同步公开契约、启动恢复或插件 discovery，应回退并另立架构计划。
- 完成 P1 和必要的 P4 预算后，将长期构建规则写入构建指南，删除本文。

## 5. 参考

- [Vite Build Options](https://vite.dev/config/build-options.html)
- [Vite 8 发布说明](https://vite.dev/blog/announcing-vite8)
- [Rolldown Code Splitting](https://rolldown.rs/in-depth/code-splitting)
