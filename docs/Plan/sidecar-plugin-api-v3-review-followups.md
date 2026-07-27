# Sidecar Plugin API v3 审查问题跟进

> - 状态：代码处理完成；开发模式主链路与分批优化已验证，待发布候选主应用与插件联合验收
> - 创建日期：2026-07-24
> - 最近更新：2026-07-27
> - 来源：API v3 工作区与相关插件联动审查

## 1. 目标

在 API v3 合并前完成作业生命周期、进程代际、旧配置迁移和相关插件适配，确保长任务、取消、超时恢复与既有用户数据不会产生跨作业副作用或静默失效。

## 2. 阻塞问题

- [x] Paddle OCR 排队作业取消必须立即产生唯一终态，不能等待前序作业完成。
- [x] 单个作业取消超时不能直接重启共享 Sidecar 并误伤其他作业。
- [x] 宿主必须消除 `submitOcrJob` 发出前的 AbortSignal 竞态，并在所有退出路径清理计时器。
- [x] Paddle OCR 插件 UI 必须按合法进度刷新无进度超时，不能继续使用任务总时长超时。
- [x] `hard-subtitle-extractor` 必须改用稳定 `contributionId`。
- [x] `aiohub-ahk-automator` 必须停止调用已删除的 `recognizeBatch`，并正确处理 `execute()` 的 `ServiceResult`。

## 3. 数据与进程安全

- [x] Smart OCR、实时字幕和窗口自动化的旧 `{ pluginId, method }` 配置需要在加载边界迁移；无法唯一映射时显式标记为待重新选择。
- [x] Smart OCR 历史记录中的旧插件配置需要兼容展示。
- [x] Broker 转发必须同时绑定源、目标进程 generation，任一旧代际都不得参与转发或回写。
- [x] API v3 manifest 作业能力需要运行时校验，job 模式必须声明流式结果且使用常驻 Sidecar 事件通道。
- [x] API v3 常驻和一次性 Sidecar 都必须校验宿主运行时注入的 `hostContext`。

## 4. 设计收敛

- [ ] 抽取通用 Sidecar 作业客户端。本轮先在 OCR 平台内收敛状态机；跨业务抽取留待出现第二个 job contribution 后处理。
- [x] 插件通过宿主 OCR facade 调用 OCR contribution，避免依赖 Paddle OCR 私有方法。
- [x] 标准 OCR 结果保留可选行框数据，满足自动化点击定位等结构化结果消费场景。

## 5. 验证

- [x] 覆盖提交前取消、排队取消、重复终态、取消宽限期超时和多作业互不干扰测试。
- [x] 覆盖旧配置迁移和无法唯一映射的降级行为。
- [x] 覆盖 Broker 旧 generation 转发拒绝测试。
- [x] 运行主仓库 Vitest、类型检查、Vite 构建和 Tauri Rust 测试。
- [x] 运行 Paddle OCR Rust/UI 构建，以及 AHK/硬字幕插件 UI 构建。
- [x] Paddle OCR 的 Rust 构建与开发 manifest 使用同一稳定产物路径，并由构建脚本校验二者一致。
- [x] 清理其他 Native / Sidecar 插件对 Cargo `target/` 缓存路径的直接依赖；构建脚本统一部署并验证 `dev-bin/<platform>/` 下的 manifest 产物。
- [x] 插件不可用状态保留结构化诊断；协议方法不匹配、握手失败、产物缺失、平台/API 不兼容分别展示错误代码、上下文和处理建议，OCR 调用侧不再覆盖原始原因。
- [ ] 保留真实 Tauri WebView 联调项，验证多窗口事件与进程重启。

## 6. 当前结论

API v3 的稳定贡献点、确认与终态分离、宿主握手和普通请求代际隔离方向保留。本轮不通过恢复 `recognizeBatch` 回退来兼容调用方，而是迁移调用方到宿主统一 OCR 契约。
