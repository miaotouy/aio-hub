# Ubuntu：Windows 开发内容兼容性专项（2026-10-29）

## 范围

沿用独立 `ubuntu-matrix` 原生 Tauri 实例，重点检查 Shell、文件路径、脚本运行时和按平台注册的原生 API。测试数据统一来自临时目录与本次隔离数据目录。

## 发现与处理

| 模块                       | Windows 假设与故障                                                        | 处理                                                                          |
| -------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| FFmpeg 工作台 / 序列帧     | Linux 仍提供 PowerShell 复制命令；普通展示字符串无法安全处理 Shell 元字符 | 根据平台共用 Shell formatter，预览与复制内容一致；POSIX 字面引用保留每个 argv |
| FFmpeg 路径预留 / 覆盖检查 | 所有路径转小写并替换反斜杠，误拒绝 POSIX 不同文件                         | Windows 绝对路径沿用旧规则；POSIX 保留大小写、反斜杠和尾空格                  |
| 符号链接搬家               | 所有路径都按反斜杠分隔，`parent` 和 `parent\child` 被实机误判为嵌套       | 使用原生 Path 组件比较；真实嵌套仍阻断                                        |
| 技能脚本                   | Ubuntu 只有 `python3`，自动运行调用 `python` 报文件不存在                 | 按平台和可用性选择 Python / Shell / PowerShell 候选，保留显式配置             |
| 技能宿主上下文             | 自动终端偏好仍报告 PowerShell 与反斜杠路径                                | 按平台解析默认终端，保留显式终端/命令串联偏好                                 |
| 弹幕外部播放器             | Linux 页面的扫描和状态轮询使用仅在 Windows 注册的 command                 | 工作区平台提示、禁用连接入口、跳过扫描及轮询；保留内置播放入口                |
| 文件拖放与聊天转附件       | 文件 URI 无条件转反斜杠；聊天未识别独立行首 POSIX 路径                    | 共用 URI 解析器，正确解码路径；补齐 POSIX 行首路径识别，复用相同附件导入链路  |

## 本地媒体预览：首轮调查

实机截图发现 FFmpeg 序列帧合成完成后，视频预览显示“无法播放视频”，进一步拆成两个故障：

1. **Unix 点目录资源授权**：合成文件位于 `.tmp/`。原始 `asset://` 范围请求返回 403；同一视频复制到普通 `/tmp/` 后返回 206。配置中保留既有 `allow` / `deny` 清单，显式设置 `assetProtocol.scope.requireLiteralLeadingDot: false`，统一两端的点目录匹配策略。修复后隐藏目录视频的范围请求返回 206、普通请求返回 200，MIME 为 `video/mp4`。
2. **WebKitGTK 媒体读取协议**：修复授权后，HTML video 仍出现 `MEDIA_ERR_SRC_NOT_SUPPORTED`。额外独立 `ubuntu-media` 实例中设置 `WEBKIT_GST_ALLOWED_URI_PROTOCOLS=asset,tauri`，日志进一步记录“asset 未实现 URI 处理器”。这是播放链路的未完成项，转码结果有效与 WebView 可播放需分别验收。

对照实验：

- 同一 H.264 文件在 GStreamer `filesrc ! qtdemux ! h264parse ! avdec_h264 ! fakesink` 中正常解码，进程退出码 0。
- 本机已有 `libav`、`good`、`ugly`，缺 `h264parse`。从 Ubuntu 官方包 `gstreamer1.0-plugins-bad` 提取 `libgstvideoparsersbad.so` 到用户缓存，测试实例通过 `GST_PLUGIN_PATH_1_0` 加载，CLI 解码通过；WebView 播放仍失败，说明补解析插件只覆盖依赖层。
- 首轮同一资源直接作为 video src、设置 crossorigin、转为内存 Blob 均得到 error 4；Blob fetch 返回 200。后续查明 Blob 还受到页面 CSP 拦截，修复结果见下节。
- 源码依据为 WebKit `webkitgtk-2.52.3` 的 `GStreamerCommon.cpp`（协议允许列表）、`WebKitWebSourceGStreamer.cpp`（http/https/blob handler）和 `MediaPlayerPrivateGStreamer.cpp`（load / GStreamer 错误处理），下载副本位于临时取证目录。

后续实现采用按文件授权的 HTTP 流式读取，覆盖 Range、拖动进度、文件切换与资源释放，详见下节。

## 回归覆盖理由

- 复制命令契约：把真实输出交给 `sh` 执行，核对空串、空格、中文、引号、变量/命令替换与换行均作为原始 argv，避免只断言格式字符串。
- 路径契约：不同 POSIX 路径可独立预留，同一路径继续排他；搬家预检接受反斜杠命名的同级目录，既有真实嵌套/目标冲突保护保留。
- 原生能力契约：Linux/macOS 外部播放器入口跳过 IPC 和状态轮询，Windows 继续发送窗口扫描 command。
- 附件导入契约：POSIX 路径和编码 URI 导入到期望路径并完成占位符替换；Windows 既有双路径转换用例保留。
- 运行时契约：显式配置优先，可用候选按平台顺序选择；原生实机执行 Python fixture。

## 验证记录

- Ubuntu：9 个相关测试文件、71 个测试通过；Rust 搬家 4 个、技能运行时 1 个测试通过。
- Ubuntu `bun run build:tsc`、`AIO_DEV_CONTROL=1 bun run build:vite` 和生产资源 Debug Tauri 构建通过。
- 实机 9 项记录中 8 项通过：Python 自动运行、两个临时目录搬家与符号链接内容回读、H5 URI 导入并转码、POSIX 大小写输出预留、3 帧图像序列合成、外部播放器能力提示，以及浅/深色走查。媒体播放用例保留失败记录，根因分层见上节。
- 转码样例文件名包含空格、单引号、`$`、`&` 和中文；输入/输出只改变首字母大小写，生成 H.264 96×64 / 5 帧视频，输入内容保持原样。真实复制按钮得到的剪贴板命令与预览相同，交给 `sh` 后成功执行。
- 序列帧通过真实 WebView 的 `text/uri-list` drop 导入，生成 H.264 96×64 / 3 帧视频，FFprobe 验证通过。
- 外部模式的连接按钮与下拉入口均禁用；浅/深色截图保留完整工作区，页面无横向溢出。
- 初次 Rust 构建遇到磁盘空间不足，清理本项目生成的 Rust 增量缓存后完成构建。运行中的实例和应用数据保留。
- Windows 宿主的聊天测试受旧 node_modules 缺少 workspace 链接影响；本轮完整类型检查与构建结论来自 Ubuntu 原生检出，Windows 原生执行继续单列复测。
- 日志、原生执行结果、视频层次诊断和截图统一位于 `.tmp/ubuntu-modules/win-*`。

## 继续跟踪

- Windows 原生窗口操作、屏幕 OCR 与外部弹幕覆盖的执行依赖对应平台能力；本轮在 Linux 验证能力反馈和调用边界，Windows 原生执行需要在 Windows 复测。
- 已接入流式入口的播放器通过本地媒体实机验证；系统解码组件和安装包部署需分别验证，详见补查记录。
- Wayland 下全局鼠标监听与跨窗拖出涉及系统输入能力；原有启动日志中的 `KeyboardError` 仍待专项物理交互验证。
- 原生文件选择器、外部模型服务、插件不同平台产物与系统文件管理器物理拖放另需各自样例。
- 颜色提取代表色质量与多图片长消息首次挂载耗时沿用前轮调查记录。

## 本地媒体补查与修复（2026-10-29）

### 新证据

页面 `index.html` 另有 CSP。原来的 `media-src` 缺少 `blob:` 和显式动态端口 `http://127.0.0.1:*`。首轮 Blob 失败受到这层策略影响。

独立 `ubuntu-media` 实例对照：

- 修复前，HTTP / Blob 立即 error 4，HTTP 测试服务没有收到请求；诊断记录出现 `media-src`。
- 修复 CSP 后，同一资源经 HTTP / Blob 均读到 4 秒视频及 160×90 画面。
- `asset://` 仍受 WebKit/GStreamer 的 URI handler 限制；默认本地媒体通过按文件授权的 HTTP 入口读取。

### 实现

原生服务仅绑定回环地址，IPC 注册文件后返回随机资源标识，检查 asset scope、Host 和 Origin，固定已授权文件句柄，提供 GET / HEAD / OPTIONS 与单字节范围读取。源切换、组件卸载、缩略图结束、窗口销毁和页面刷新分别释放对应授权。资源变化和异步申请期间的刷新均有处理。

接入通用音视频播放器、视频缩略图、媒体生成视频卡片、预设音频试听和本地视频 OCR 监视器。Windows/macOS 和网络/Blob 地址沿用原入口。接口、范围语义与依赖见[本地音视频播放架构](../architecture/local-media-playback.md)。

Debian 配置补齐 GStreamer base / good / bad / libav 依赖，AppImage 开启媒体框架打包。配置已进入原生构建；本轮采用 `--no-bundle`，安装包生成与安装验证仍单列。

### 验证与边界

- Ubuntu 与 Windows 宿主各 5 条相关前端测试通过；Ubuntu Rust 媒体读取 6 条通过。
- Ubuntu 类型检查、Vite 构建和生产资源 Debug Tauri 构建通过。
- 真实工作区验证 FFmpeg 视频/音频预览、内置弹幕播放、本地视频 OCR 监视器；H.264 / WAV 均能播放及跳转到 2.2 秒，视频可 Canvas 截帧。关闭 OCR 视频后旧地址返回 404。
- 音频组件按“下一曲”切换到新租约并自动续播，旧地址返回 404；卸载组件后新地址也返回 404。
- 样例路径含中文、空格、单引号、美元符号、百分号与 Unix 字面反斜杠；范围请求回读字节一致，切换文件后旧地址返回 404。
- 未授权标识返回 404，外部 Origin / 错误 Host 返回 403，越界 Range 返回 416，HEAD 返回 200 和空体。
- 页面刷新清理所属窗口租约；缩略图生成前后的已打开文件句柄数量相同。
- 首轮使用用户缓存解析插件；最终 `ubuntu-media` 实例清除该环境注入后，同一批视频与音频实机项目仍通过，说明本机已有解码组合足以处理这些 MP4 / WAV。GStreamer 仍记录缺少 h264parse 的编码器注册警告，新增系统依赖用于覆盖后续格式与部署环境；未执行 sudo 安装。
- VM 检查需把 `$HOME/.local/bin` 放入 PATH。本机 Node 位于该处；缺失 Node 时 Bun 回退执行 vue-tsc 曾出现多个 Vue 命名类型导出的误报，使用已配置的 Node 22 后类型检查通过。
- 关闭工具标签后，MainLayout 的 KeepAlive 仍保留工具组件及其媒体资源；该问题在原有缓存策略中存在。后续需统一处理关闭标签时的组件回收，当前源切换、真正卸载与文档刷新路径已覆盖。

本轮临时实验、截图和日志位于 `.tmp/ubuntu-modules/media-*`。

最终构建曾遇到磁盘不足；停止本轮实例后，仅清理已确认未运行的本项目旧 Rust 可执行文件、测试二进制和失败的归档产物，恢复约 7.7 GiB 可用空间后构建通过。源码与测试数据保留。

重启保留复杂样本的 `ubuntu-matrix` 后，上一轮 9 项原生兼容性脚本全部通过，原先失败的序列帧结果预览已返回 206、96×64 画面并完成播放；浅/深色平台提示检查继续通过。

## 权限专项后续

进一步确认并修复了应用数据隐藏后代 scope、外部文件元数据授权和插件 ZIP 的 Unix 执行位问题，同时收紧插件 ID 与归档提取路径。实机结果与仍需处理的插件信任、Wayland 边界见[权限专项调查](./ubuntu-permissions-investigation-20261029.md)。
