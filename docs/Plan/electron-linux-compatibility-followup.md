# Electron Linux 兼容性跟进清单

> 状态：进行中
>
> 更新日期：2026-11-06

## 待办

- [ ] 保全并审阅 Ubuntu 原检出中的未提交工作；基于当前上游逐项合并，排除重复、过时改动和 Python `__pycache__` 产物。
- [ ] 修复 Electron 测试中误用 `bun:test` 的用例，使其遵循 Vitest 配置。
- [ ] 为依赖 `native/knowledge-addon` 的测试补齐可重复的原生扩展构建前置条件。
- [ ] 修正 Git 历史测试对合并提交遍历顺序的假设，并让 stash 失败夹具独立于当前 HEAD 与 Git 版本。
- [ ] 调整 sidecar Linux 进程树测试，区分退出进程与尚未回收的 zombie。
- [ ] 分别在 Windows 与 Ubuntu 原生检出运行 Electron 类型检查、测试、生产构建和桌面启动验证。
- [ ] 单独制定仓库文本文件行尾策略；当前 `.gitattributes` 仅为 `*.sh` 指定 LF，其他文件未声明 `text` / `eol`，Windows 工作区 CRLF 与 Ubuntu 检出 CRLF 已造成大面积行尾差异。

## 环境边界

- Windows 使用本机工作区构建。
- Ubuntu 使用 `/home/mty/aio-hub-electron-check` 等 Linux 原生文件系统检出；Bun 依赖安装不在 VMware 共享目录执行。
- 两端各自使用独立 `node_modules`、Cargo `target` 和 Electron 输出目录，可并行构建与运行。
- Ubuntu 原检出 `/home/mty/aio-hub-Ubuntu` 的既有改动需先保存并审阅，不在该目录执行清理、覆盖或切换操作。
