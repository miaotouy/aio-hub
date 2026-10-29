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

## 本地媒体预览：已修复授权，播放链路待处理

实机截图发现 FFmpeg 序列帧合成完成后，视频预览显示“无法播放视频”，进一步拆成两个故障：

1. **Unix 点目录资源授权**：合成文件位于 `.tmp/`。原始 `asset://` 范围请求返回 403；同一视频复制到普通 `/tmp/` 后返回 206。配置中保留既有 `allow` / `deny` 清单，显式设置 `assetProtocol.scope.requireLiteralLeadingDot: false`，统一两端的点目录匹配策略。修复后隐藏目录视频的范围请求返回 206、普通请求返回 200，MIME 为 `video/mp4`。
2. **WebKitGTK 媒体读取协议**：修复授权后，HTML video 仍出现 `MEDIA_ERR_SRC_NOT_SUPPORTED`。额外独立 `ubuntu-media` 实例中设置 `WEBKIT_GST_ALLOWED_URI_PROTOCOLS=asset,tauri`，日志进一步记录“asset 未实现 URI 处理器”。这是播放链路的未完成项，转码结果有效与 WebView 可播放需分别验收。

对照实验：

- 同一 H.264 文件在 GStreamer `filesrc ! qtdemux ! h264parse ! avdec_h264 ! fakesink` 中正常解码，进程退出码 0。
- 本机已有 `libav`、`good`、`ugly`，缺 `h264parse`。从 Ubuntu 官方包 `gstreamer1.0-plugins-bad` 提取 `libgstvideoparsersbad.so` 到用户缓存，测试实例通过 `GST_PLUGIN_PATH_1_0` 加载，CLI 解码通过；WebView 播放仍失败，说明补解析插件只覆盖依赖层。
- 同一资源直接作为 video src、设置 crossorigin、转为内存 Blob 均得到 error 4；Blob fetch 返回 200，仍需继续定位 WebKit 自定义来源下的媒体装载。
- 源码依据为 WebKit `webkitgtk-2.52.3` 的 `GStreamerCommon.cpp`（协议允许列表）、`WebKitWebSourceGStreamer.cpp`（http/https/blob handler）和 `MediaPlayerPrivateGStreamer.cpp`（load / GStreamer 错误处理），下载副本位于临时取证目录。

下一步应评估可流式读取且受文件授权约束的媒体地址；需覆盖 Range、拖动进度、文件切换与资源释放。避免直接在页面中全量读取大视频作为默认处理方式。

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
- 本地媒体预览当前仍受 WebKitGTK 媒体读取协议影响，详见上节。
- Wayland 下全局鼠标监听与跨窗拖出涉及系统输入能力；原有启动日志中的 `KeyboardError` 仍待专项物理交互验证。
- 原生文件选择器、外部模型服务、插件不同平台产物与系统文件管理器物理拖放另需各自样例。
- 颜色提取代表色质量与多图片长消息首次挂载耗时沿用前轮调查记录。
