# Ubuntu 虚拟机兼容性验证

本文记录 Windows 宿主机上的 Ubuntu 测试环境、启动方式及 2026-10-29 的主界面与设置页走查结果。

## 环境与工作目录

| 项目               | 本次环境                           |
| ------------------ | ---------------------------------- |
| VMware Workstation | 26.0.0，build 25388281             |
| 宿主 CPU           | AMD Ryzen 9 5900X，24 个逻辑处理器 |
| 虚拟机             | 4 vCPU、16 GB RAM，NAT             |
| 系统               | Ubuntu 24.04.4 LTS，Wayland        |
| 内核               | 6.17.0-35-generic                  |
| WebKitGTK          | 2.52.3                             |
| Bun                | 1.3.14                             |
| Node.js            | 22.22.0，安装在用户目录            |
| Rust / Cargo       | 1.95.0                             |

- Windows 工作区：`D:/CodexShared/aio-hub-Ubuntu`。
- Ubuntu 原生检出：`/home/mty/aio-hub-Ubuntu`。
- Windows 共享目录在 Ubuntu 中映射到 `/mnt/hgfs/CodexShared/aio-hub-Ubuntu`。
- SSH 入口：`ssh ubuntu-vm`。

在原生检出中安装依赖、编译和运行应用。VMware 共享目录用于代码传递；依赖目录需要 Linux 原生文件系统的符号链接支持。

非交互 SSH 会话运行项目命令前设置：

```bash
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
cd /home/mty/aio-hub-Ubuntu
```

仓库脚本统一通过 Bun 执行。`vue-tsc` 的 Node 解释器也需在 PATH 中；本轮缺少 Node 时类型检查失败，补齐 Node 后同一源码通过检查。

## VMware 启动与 CPU 亲和性

本机出现过 `Module 'CPUID' initialization failed`：VMware 从父进程继承 `0x3FFFFF` 的 CPU 亲和性，只能使用前 22 个逻辑处理器。临时无磁盘虚拟机同样失败；将启动进程亲和性改为全部 24 个处理器后，临时虚拟机与原 Ubuntu 均启动成功。Hyper-V 和系统安全设置保持原状。

用独立子进程启动，并在启动后恢复当前 PowerShell 的亲和性：

```powershell
$vmrun = 'D:\Program Files\VMware\VMware Workstation\vmrun.exe'
$vmx = 'D:\Virtual Machines\Ubuntu 64-bit\Ubuntu 64-bit.vmx'
$count = [int](Get-CimInstance Win32_Processor |
  Measure-Object NumberOfLogicalProcessors -Sum).Sum
$self = Get-Process -Id $PID
$saved = $self.ProcessorAffinity
try {
  $self.ProcessorAffinity = [IntPtr]((1L -shl $count) - 1)
  $child = Start-Process -FilePath $vmrun -ArgumentList @(
    '-T', 'ws', 'start', ('"' + $vmx + '"'), 'nogui'
  ) -WindowStyle Hidden -PassThru
  $child.WaitForExit()
} finally {
  $self.ProcessorAffinity = $saved
}
```

该掩码计算适用于这台单处理器组、24 逻辑处理器的宿主机。通过 VMware 界面启动时，也要确认界面进程的亲和性包含全部处理器。

## 依赖与旧修改处理

本轮先备份虚拟机的旧侧栏修改并存入 stash，随后从共享工作区快进到当前分支。旧补丁已无法直接应用到当前侧栏结构；当前 `SidebarMenu.vue` 已包含其中的图标尺寸约束，滚动渐隐也已重写。

经主人确认，已清理标记为 `compat-2026-10-29-preserve-old-sidebar` 的 stash 及对应的 `2026-10-29-old-sidebar` 备份目录，后续以当前实现为基础继续排查。

依赖采用当前项目版本约束。旧 `node_modules` 增量安装后出现 CodeMirror 多版本类型冲突，重建依赖目录后消失。干净安装因本地缺少被忽略的插件工作区，需要重新解析 Bun 锁文件；本轮保存了安装产生的锁文件，再恢复版本库中的 `bun.lock`，业务依赖声明保持原样。

系统开发库已满足本次构建。系统包升级需要 sudo 密码，留待单独维护。

## 2026-10-29 验证结果

基于 `a74aa3ae1`，另含本轮 `index.html` 的 CSP 修复：

| 验证项                                            | 结果                                                                                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run build:tsc`                               | 通过                                                                                                                                  |
| `bun run build:vite`                              | 通过，含打包体积和混合导入警告                                                                                                        |
| Tauri Debug 原生构建，生产前端资源，`--no-bundle` | 通过                                                                                                                                  |
| 主题颜色、渠道连接状态相关测试                    | 2 个文件、11 条通过                                                                                                                   |
| 主页                                              | 46 个工具展示、搜索、分类筛选、侧栏展开/折叠通过                                                                                      |
| 设置页                                            | 常用设置、数据与存储、主题与界面、样式覆盖、AI 渠道、模型元数据、OCR 服务、工具模块、运行环境、日志、关于与更新均已打开并采集真实截图 |
| 主题与持久化                                      | 浅色/深色切换通过；重启后主题及侧栏折叠状态保留                                                                                       |
| 运行环境检测                                      | FFmpeg 6.1.1、FFprobe 6.1.1、Git 2.43.0 均显示就绪                                                                                    |

### 已修复：Linux 打包应用的本地资源读取

`index.html` 的 CSP `connect-src` 原先遗漏 `'self'`。在 Linux 的 `tauri://localhost` 来源下，模型图标的 `fetch()` 被拦截，导致元数据页出现 `ThemeAwareIcon` 加载失败。

在真实窗口捕获到 `connect-src` 违规，目标为应用自身的 `/assets/hunyuan-color-*.svg`。补充 `'self'` 并重新构建后，该资源返回 HTTP 200，图标正常显示，重新进入元数据页后未增加图标加载错误。`data:` 连接限制保持原样。

### 后续观察

- Wayland 下窗口调整请求被接受，但本轮 WebView 视口仍为 1280 × 768；较小视口的布局需继续验证。
- 仍有隐藏 `background-js` 窗口尺寸告警、剪贴板回退 X11 和启动时 GTK 告警。主窗口已就绪，常用界面交互可用；后续按具体功能回归处理。
- 本轮产物为 Debug 可执行程序，安装包与 Release 优化构建另行验证。

## 本轮运行与取证

应用使用独立数据目录 `/home/mty/.cache/aio-compat/2026-10-29/app-data`。构建、启动和测试日志在同级目录。

通过 Debug 构建已有的嵌入式 WebDriver 连接真实 WebKitGTK 窗口，端口为虚拟机回环地址 `127.0.0.1:4457`。截图采用 WebKitGTK 原生 snapshot。本轮控制脚本、截图和结构摘要保存在 Windows 工作区的 `.tmp/ubuntu-compat/`，供开发复查。

## 后续脚手架与性能验证

本轮已将临时探查能力接入正式 Dev Control：Linux 独立实例、嵌入式连接、身份核验、受检查的 DOM 输入、脱敏截图、诊断游标和宿主机 SSH 包装。使用方式见[开发界面控制指南](./dev-control.md)。

真实 Renderer 首测与最近一次 VCP 预检优化的同 WebKit 对照见 [Ubuntu 性能初测](../Plan/ubuntu-compatibility-performance-20261029.md)。尺寸调整仍保留明确的未确认状态，后续小视口测试继续等待该问题定位。

复杂会话、完整主题矩阵和 HTML 预览交互的后续走查见 [Ubuntu 复杂样本与主题矩阵走查](../Plan/ubuntu-ui-matrix-20261029.md)。本轮同时补充了独立数据目录的 asset protocol 授权。

上游业务变更同步后的预览交互、附件路径修复与滚动诊断见 [Ubuntu 上游同步与回归复测](../Plan/ubuntu-upstream-retest-20261029.md)。

## 本地媒体专项补查

2026-10-29 的 Windows 内容兼容性专项发现，Linux 的点目录资源授权和 WebKitGTK 媒体装载需分开验证。点目录 `asset://` 的 403 已通过显式点目录匹配策略修复；FFmpeg 转码与序列帧合成通过，后续已补齐页面媒体 CSP，并接入按文件授权的 HTTP 流式读取。通用视频/音频播放、跳转与截图的实机结果见专项补查记录。详见 [专项记录](../Plan/ubuntu-windows-compatibility-20261029.md)。

本机缺少 `h264parse` 所在的 `gstreamer1.0-plugins-bad`。本轮从 Ubuntu 官方包提取解析插件到用户缓存，通过测试实例的 `GST_PLUGIN_PATH_1_0` 完成 CLI 解码对照。后续部署可通过系统包管理器安装该组件；WebView 的播放验收还需覆盖实际资源协议和读取行为。


本地播放的入口、授权生命周期、范围读取及 Linux 打包依赖见[本地音视频播放架构](../architecture/local-media-playback.md)。首轮使用用户缓存内的解析插件，最终样例在撤销该环境注入后仍可播放；Debian 系统依赖与 AppImage 媒体框架配置已补齐，安装包部署验证另行进行。

本机 Node 22 安装于 `$HOME/.local/bin`，运行检查和构建时统一使用：

```bash
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
```

## 客体鼠标与键盘

GNOME/Wayland 下，通过 SSH 调用当前用户的 Mutter RemoteDesktop 与 ScreenCast 接口，可向虚拟机桌面发送真实鼠标、键盘事件。输入位于客体合成器，宿主机鼠标保持自由。实现为 `scripts/dev-control/mutter-input.py`，正式入口：

```powershell
# 查询当前客体显示器及坐标范围
'{"actions":[]}' | bun run dev:vm -- input --stdin

# 在客体显示器坐标 (176, 228) 右键，随后按 Escape
'{"actions":[{"op":"click","x":176,"y":228,"button":"right"},{"op":"key","key":"Escape"}]}' |
  bun run dev:vm -- input --stdin
```

默认选择主显示器；多显示器可传 `"monitor":"Virtual-1"`，名称与尺寸以返回信息为准。坐标相对所选显示器，先观察客体截图再操作。窗口缩放、移动后重新观察；Wayland 的窗口位置 API 可能返回 `(0,0)`，本机已遇到该情况。Dev Control 返回的 DOM 坐标需结合实际窗口在客体屏幕中的位置换算。

支持的操作：

| 操作 | JSON 字段 |
| --- | --- |
| 移动 | `{"op":"move","x":100,"y":200}` |
| 单击/右键/中键 | `{"op":"click","x":100,"y":200,"button":"left"}`，button 可用 `left/right/middle` |
| 左键拖动 | `{"op":"drag","x":100,"y":200,"toX":300,"toY":250}` |
| 滚轮 | `{"op":"scroll","dx":0,"dy":200}`，在当前客体指针位置滚动 |
| 按键 | `{"op":"key","key":"Escape"}`，可用 Escape、Return、Tab、space、四方向键 |

批次最多 64 步，输入 JSON 上限 64 KiB。所有动作先完成参数与显示器边界检查，之后才发送输入；同一桌面上的批次串行执行。异常时释放已按下的按钮/按键并停止临时会话。失败输出的 `error.details.completed` 记录已经完成的动作数，重试前核对客体状态。

### 客体桌面截图

向批次添加 `screenshot`，会在操作后通过 PipeWire/GStreamer 保存整个所选显示器的 PNG：

```powershell
'{"actions":[],"screenshot":"/home/mty/aio-hub-Ubuntu/.tmp/ubuntu-crash/guest-desktop.png"}' |
  bun run dev:vm -- input --stdin
scp ubuntu-vm:/home/mty/aio-hub-Ubuntu/.tmp/ubuntu-crash/guest-desktop.png .tmp/ubuntu-crash/guest-desktop.png
```

目标为客体绝对路径，父目录需存在，每次使用新文件名。桌面截图包含所选显示器的其他窗口，保存在本机，使用测试桌面并检查内容后再对外分享。需要应用局部截图或脱敏时，沿用 Dev Control `observe/screenshot`。

### 环境边界

- SSH 用户需已登录 GNOME 桌面。本机 Ubuntu 24.04 的 Mutter 46 已通过实际输入验证；其他合成器和版本以运行结果为准。
- Python 使用客体已有的 PyGObject/Gio；桌面截图另外使用 Gst、PipeWire source 和 PNG encoder。本轮验证使用已安装组件。
- 接口连接当前用户的会话 D-Bus，批次结束即释放远程桌面/录屏会话。权限或能力失败时检查错误，保留现有系统权限与会话策略。
- `xdotool` 面向 X11；本机测试包含原生 Wayland WebView，因此选用 Mutter 的客体输入。VMware VNC/RDP、`/dev/uinput` 和宿主机鼠标注入留作其他环境的独立方案。
- 该命令控制整个客体桌面；与 Dev Control 的窗口定位分层使用。选择目标、聚焦目标窗口和观察结果由调用方负责。批次锁覆盖同一辅助器进程间的冲突，客体上的人工操作仍可能改变焦点。

辅助器的参数契约测试在客体执行：

```bash
python3 scripts/dev-control/mutter-input.test.py
```

## WebKitGTK 2.52 渲染策略修复

2026-10-30 在 WebKitGTK 2.52.6 上确认：应用先前自动设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1`，会在含视频的右键菜单与页面切换场景触发加速合成空指针，主进程段错误。修复后，2.52 及以上使用 WebKit 自动渲染策略，较老版本保留原有兼容默认值；显式传入的渲染环境变量保持原值。

如果启动脚本还传入旧渲染参数，先清除后作对照：

```bash
env -u WEBKIT_DISABLE_DMABUF_RENDERER -u WEBKIT_DISABLE_COMPOSITING_MODE ./aiohub
```

崩溃堆栈、客体原生输入前后对照、实际播放画面与验证范围见[崩溃专项](../Plan/ubuntu-webkit-crash-investigation-20261030.md)。