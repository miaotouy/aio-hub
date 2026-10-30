# 桌面资源编译入口

桌面应用的配置、权限和 Tauri 上下文初始化由 `aio_hub_lib::run_with_assets` 生成并随后端库缓存；EXE 中的 `run!` 只生成前端资源表达式，再把 `EmbeddedAssets` 传给后端。

资源继续使用 `tauri-codegen` 的扫描、压缩缓存和 `include_bytes!` 依赖追踪，以及 Tauri 原有的运行期读取实现。前端产物更新时，Cargo 可以只编译并链接 EXE。Rust 源码、版本、特性和共享 build script 输入仍按正常规则触发编译。

## 配置兼容

- `run!(true)` 对应 Tauri 的 `cfg(dev)`：有 `devUrl` 时使用开发服务，资源为空；静态开发仍嵌入 `frontendDist`。
- `run!(false)` 对应生产资源构建，支持目录、文件清单和远程 URL 配置。
- 有效 CSP 或 isolation 配置会自动委托 EXE 中的官方 `generate_context!()`，保留其 HTML nonce、哈希和安全处理。该路径的上下文会随 EXE 重新编译。
- `mobile/src-tauri` 使用独立入口；本 crate 供桌面包使用。

`tauri-codegen` 的 HTML CSP 转换函数为私有实现，因此这里只对当前无 CSP 的 brownfield 配置拆分资源生成。升级 Tauri 时，应一并核对 `AssetOptions`、`EmbeddedAssets` 与上下文生成接口。

实现与计时记录见仓库的 `docs/Plan/desktop-build-speed-investigation-20261030.md`。
