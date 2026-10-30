# 本地音视频播放

## 平台与入口

Windows、macOS 沿用调用方传入的媒体 URL。Linux 的 WebKitGTK 媒体管线通过 HTTP 读取本地文件，图片和其他资源继续使用原有 asset protocol。

- `src/utils/mediaSource.ts`：把 Linux 的 `asset://localhost/...` / `file://...` URL 解析为原始路径，通过 IPC 申请播放地址，返回带释放函数的租约。
- `src/composables/useMediaSource.ts`：管理组件源切换、异步结果竞争、读取错误和卸载释放。
- `src-tauri/src/commands/media_stream.rs`：Linux 专用的文件授权、HTTP 范围读取与租约状态。
- 通用 `VideoPlayer` / `AudioPlayer`、媒体生成视频卡片、预设音频试听、视频缩略图及本地视频 OCR 监视器使用上述入口。
- 网络、Blob、相对资源 URL 保持原地址。播放器标题和业务数据继续持有原始 URL，播放地址只供底层媒体元素读取。

## 授权与服务生命周期

首次申请媒体时，原生端在 `127.0.0.1` 的动态端口启动服务。服务随应用进程结束，空闲时保留监听。

`acquire_media_stream({ path })` 执行以下步骤：

1. 记录调用窗口及文档代次，规范化文件路径并检查 Tauri asset scope。
2. 打开普通音视频文件，从已打开句柄读取文件头判断 MIME，并再次核对句柄实际指向路径的授权范围。
3. 为固定文件句柄分配随机 UUID，将 URL 返回为 `http://127.0.0.1:<port>/media/<token>`。
4. 页面在申请过程中已刷新或销毁时，终止本次申请。

每个租约绑定调用窗口、来源 origin、文件句柄、文件长度和修改时间。服务核对 Host 与请求 Origin；媒体元素省略 Origin 时，仍需要持有正确的随机 token。URL 中只传资源标识。

`release_media_stream({ token })` 仅接受租约所属窗口释放。源切换、组件卸载、缩略图完成或失败均释放各自租约；迟到的异步申请结果也会释放。窗口销毁、文档刷新清理该窗口全部租约，并推进代次。已开始的流在撤销后结束。

KeepAlive 缓存的已打开工作区继续持有媒体元素和租约，可在切回时恢复。主布局通过 `WorkspaceRouteCache` 将路由路径映射为独立缓存边界，工具关闭、清空标签或从注册表移除后回收对应实例，触发组件卸载并释放租约；设置页随离开卸载。组件名与路由名无需一致，共用组件的工具仍可分别回收。实机前后对照见[工作区生命周期补查](../Plan/ubuntu-workspace-lifecycle-20261030.md)。

资源数量上限为 512；达到上限时返回可操作错误。文件原地变化后，新读取返回 410，重新选择文件取得新租约。路径被另一文件替换时，已有租约继续绑定原先授权的句柄。

## HTTP 读取契约

- `GET`：完整读取返回 200；支持闭区间、开放尾部和后缀字节范围，返回 206 和 `Content-Range`。
- 合法但越界的范围返回 416；多区间及畸形 Range 按完整 200 响应处理。
- `HEAD`：返回完整长度、类型及范围能力，响应体为空。
- `OPTIONS`：为所属来源提供 GET / HEAD / Range 跨域读取能力。
- 按 64 KiB 块读取固定文件句柄，使用带位置的读取方式，多个跳转请求各自维护偏移。
- 响应使用 `Cache-Control: no-store`、明确的音视频 MIME 和 `X-Content-Type-Options: nosniff`。

页面 CSP 的 `media-src` 允许 Blob 和显式 `http://127.0.0.1:*`，供录制预览与流式入口使用。HTTP 通配来源在 WebKitGTK 下仍受端口匹配约束。

音频组件既有元数据/波形提取仍独立读取原始资源；该流程的内存策略与媒体元素的流式播放分开维护。

## Linux 系统媒体依赖

WebKitGTK 播放依赖系统 GStreamer。项目 Debian 配置声明 base、good、bad、libav 包依赖；AppImage 配置开启 `bundleMediaFramework`。源代码启动环境需准备同类运行库。

Ubuntu 常见依赖：

```bash
sudo apt install gstreamer1.0-plugins-base gstreamer1.0-plugins-good \
  gstreamer1.0-plugins-bad gstreamer1.0-libav
```

本机首轮从官方 Ubuntu 包提取 `libgstvideoparsersbad.so` 到用户缓存，对独立实例设置 `GST_PLUGIN_PATH_1_0` 验证 H.264 解析。后续撤销该变量，当前样例依靠已有解码组合仍可播放；h264parse 的编码器注册警告继续存在。系统安装和打包安装后的验证继续按各自环境进行。

## 验证范围

Rust 测试保护真实响应字节、并发范围读取、HEAD、授权边界、撤销、文件替换与变化。前端测试保护平台选择、路径解码与异步源切换/卸载释放。真实 Tauri 窗口覆盖播放、跳转进度、Canvas 截帧、缩略图和音频换曲。
