# VCP 内置文件请求（`internal_request_file`）

> 更新日期：2026-08-06

## 定位

`internal_request_file` 是 VCP 分布式节点的协议级能力，用于把本机文件的原始字节以 Base64 返回给已连接的 VCP 服务端。协议解析仍位于 `vcp-connector`，真实文件能力由 `aio-file-operator` 的内部服务和 Rust 安全命令提供；该能力不会注册为 Agent 可调用方法。

## 安全调用链

1. `VcpNodeProtocol` 仅接受合法的 `file://` URL，拒绝其他协议、远程主机、UNC、查询参数与宽松字符串 fallback。
2. 节点配置 `externalFileTransferEnabled` 默认开启，用户可在“分布式节点”页面显式关闭；关闭后不注册清单并拒绝遗留请求。
3. `inspectFileForExternalTransfer()` 调用 Rust 检查命令，解析真实路径并返回规范路径、大小、MIME 与 `allow` / `approve` 策略。
4. 白名单外路径和死区在 Rust 层直接拒绝；审批区通过本地工具审批条展示服务器地址、请求 ID、完整路径、大小和 MIME。
5. 批准后 `readFileForExternalTransfer()` 调用 Rust 原子安全读取命令，再次执行真实路径、沙箱、规则和大小检查后读取并编码 Base64。
6. 前端同时限制单连接最多 2 个并发请求、每分钟最多 20 个请求；单文件大小复用 `aio-file-operator.maxFileSize`。
7. 审计日志只记录来源、请求 ID、规范路径、大小、MIME 和结果，不保存文件内容。

## 相关实现

- `src/tools/vcp-connector/services/vcpNodeProtocol.ts`：协议解析、开关、限流、审批与 VCP 结果包装。
- `src/tools/aio-file-operator/actions.ts`：非 Agent 内部传输服务与审计。
- `src-tauri/src/commands/file_operations.rs`：`inspect_file_for_external_transfer` 与 `read_file_for_external_transfer`。
- `src/tools/vcp-connector/components/distributed/NodeStatusPanel.vue`：能力开关。

## 运行态验证

单元测试覆盖白名单边界碰撞、审批区/死区、大小上限和 Windows UNC。真实 VCP 服务端与 Tauri WebView 的允许、拒绝、超时和断线场景仍应按 `tests/tauri-e2e/README.md` 做运行态验收。
