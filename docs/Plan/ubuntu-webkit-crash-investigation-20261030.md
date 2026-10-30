# Ubuntu WebKit 主进程崩溃调查（2026-10-30）

## 结论与处理

已定位并修复应用自动渲染配置导致的崩溃。虚拟机使用 WebKitGTK `2.52.6-0ubuntu0.24.04.1`；应用把该环境识别为 `Wayland | Unknown`，随后自动写入 `WEBKIT_DISABLE_DMABUF_RENDERER=1`。含视频的右键菜单与页面切换会触发 WebKit 加速合成路径中的空指针，整个应用退出。

修复后，WebKitGTK 2.52 及以上使用库自身的渲染选择；更早版本保留既有默认值。所有兼容默认值仅在对应环境变量缺失时补充，保留用户显式传入的 `0`、`1` 和空值。版本查询失败时也交给 WebKit 自行探测。2.52 阈值按本轮确认受影响的版本线收敛，更早版本与其他 GPU 的实机验证继续独立跟踪。

诊断输出同步调整：现代版本建议先清除附加渲染参数作对照；加载超时提示引导运行 `--diagnose`。显式禁用 DMA-BUF 的启动脚本仍会保留该设置，遇到相同症状时应先清除旧参数。

相关实现：

- `src-tauri/src/webkit_check.rs`
- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`

## 堆栈与触发条件

- 普通用户 UID 1000，Ubuntu 24.04，VMware SVGA II Adapter，GNOME/Wayland。
- WebKit build ID：`6d0db877d1bda65539bf0c84fd6f72773b56ed4b`。
- 原始内核记录：09:25:05、09:26:42。
- 本轮以 GDB 作为应用父进程启动，捕获同一指令偏移 `0xfe36a2`；`rdi = 0`，访问地址为 `0x48`。
- 原 core 大小限制为 0，`/var/crash` 中无原始转储。符号从 Ubuntu debuginfod 对应 build ID 的 `.symtab` 和 `.strtab` 获取，主进程堆栈与寄存器实时留存。

```text
WebKit::AcceleratedBackingStore::update(LayerTreeContext const&) + 0x22
WebKit::WebPageProxy::enterAcceleratedCompositingMode(LayerTreeContext const&) + 0x3b
WebKit::DrawingAreaProxyCoordinatedGraphics::enterAcceleratedCompositingMode(...) + 0x5f
WebKit::DrawingAreaProxy::didReceiveMessage(...) + 0x10f
IPC::MessageReceiverMap::dispatchMessage(...)
WebKit::WebProcessProxy::dispatchMessage(...)
WebKit::WebProcessProxy::didReceiveMessage(...)
```

上游对应版本源码中，设置 DMA-BUF 禁用变量会影响可用传输方式；`AcceleratedBackingStore::create` 在要求不满足时返回空指针。进入加速合成的消息随后直接调用 backing store 的 `update`。GDB 堆栈、寄存器与源码路径一致。

参考：

- https://raw.githubusercontent.com/WebKit/WebKit/webkitgtk-2.52.6/Source/WebKit/UIProcess/gtk/AcceleratedBackingStore.cpp
- https://raw.githubusercontent.com/WebKit/WebKit/webkitgtk-2.52.6/Source/WebKit/UIProcess/API/gtk/WebKitWebViewBase.cpp

## 调查中的对照

| 配置 / 场景 | 结果 |
| --- | --- |
| 原自动配置，空媒体工作区，合成右键后通过 DOM 点击关闭菜单项 | 完成 |
| 原自动配置，加载本地 MP4，合成右键，切换设置再返回 | 同一 WebKit 地址 SIGSEGV |
| 右键事件设置 `cancelable: true` | 仍在同一地址崩溃 |
| 原自动配置，额外设置 `WEBKIT_DISABLE_COMPOSITING_MODE=1` | 仍在同一地址崩溃 |
| 原自动配置，加载视频并切换页面，未展开菜单 | 这一轮完成；用于缩小场景 |
| 同一二进制，经 GDB 在进入 Tauri 前把 DMA-BUF 禁用变量改为 `0` | 相同媒体菜单切换完成 |
| 原二进制，经客体 Mutter 发送真实右键 | 加载视频后直接右键即触发同一地址崩溃，尚未执行后续页面切换 |
| 修复后二进制，正常启动，使用客体 Mutter 真实右键 | 菜单与彩色视频预览正常，后续原生交互通过 |

一次旧探针在前一菜单仍展开时重复右键，菜单被收起后定位失败。该记录保留为探针状态错误，未计入应用失败或通过结果。

## 客体原生输入脚手架

此前桌面输入依赖宿主机鼠标，曾被用户 Esc 中止。本轮改为通过 SSH 连接当前用户的 Mutter RemoteDesktop/ScreenCast，直接注入客体输入。已验证 WebView 的右键、指针与键盘事件为 `isTrusted: true`；桌面截图通过客体 PipeWire/GStreamer 获取。

正式入口为 `bun run dev:vm -- input --stdin`，辅助器 `scripts/dev-control/mutter-input.py` 支持移动、左/右/中键、左键拖动、滚轮、常用按键及可选显示器截图。输入预检覆盖整批参数和显示器边界；批次串行，结束或异常时释放按键并关闭会话。支持当前 GNOME 桌面，相关能力由运行时检查。

本机的窗口位置 API 返回 `(0,0)`，实际窗口位于客体屏幕 `(66,32)`。原生探针按客体截图确认原点，再结合 DOM 控件矩形换算坐标；真实事件回传的 client 坐标也验证了该偏移。后续窗口移动后需重新观察。

Mutter 接口与用法参考：

- https://raw.githubusercontent.com/GNOME/mutter/gnome-46/data/dbus-interfaces/org.gnome.Mutter.RemoteDesktop.xml
- https://raw.githubusercontent.com/GNOME/mutter/gnome-46/data/dbus-interfaces/org.gnome.Mutter.ScreenCast.xml
- [仓库客体输入指南](../guide/ubuntu-vm-compatibility.md#客体鼠标与键盘)

## 验证

修复版本使用普通启动器运行，保留原有生产前端资源、复杂消息样本和用户缓存中的 GStreamer 解析插件；渲染策略由新二进制实际设置，运行时无需 GDB 改值。

原生探针完成 8 组检查：

1. 客体真实右键展开菜单，捕获可信 `contextmenu`。
2. 客体 Escape 关闭菜单。
3. 客体点击播放与暂停；播放时间前进、暂停状态正确，客体 framebuffer 显示彩色视频帧。
4. 右键菜单展开后切换设置、返回媒体页，连续两轮保持媒体地址、解码状态与播放位置。
5. 窗口调整为 1200×800，视口与视频状态正确。
6. 恢复 1440×900，视口与视频状态正确。
7. 真实点击菜单“关闭标签页”，路由返回主页，旧媒体租约 HTTP 404。
8. 重新打开工具得到新工作区，旧媒体预览已清理。

另外使用临时界面输入区域验证滚轮与连续拖动，捕获可信 wheel/pointer 事件及实际滚动变化，结束后移除该区域。该项验证客体输入接口，不计为业务拖拽排序验收。

自动检查：

- 3 条 Rust 启动配置行为测试：现代版本自动选择、旧版本策略范围、显式参数保留。断言观察公开启动函数对实际环境的影响，测试结束恢复原值。
- 3 条 Python 输入契约测试：合法坐标操作、整批非法动作预检、已有截图文件保留。
- Ubuntu 脚手架类型检查与最终 Debug Tauri 构建通过；最终实例的 Dev Control diagnostics 为空。
- 原生输入整批越界预检返回已完成动作数 0，随后新会话正常创建，确认错误路径可以释放批次锁。
- Windows 宿主脚手架类型检查受已有 `playwright-core` 缺失影响；相同源码在 Ubuntu 的检查通过。

## 留存与边界

忽略目录 `.tmp/ubuntu-crash/` 保存前后 GDB 日志、原生探针 JSON、客体截图与构建/测试日志。关键结果复制回宿主工作区，符号分段保留在虚拟机同名目录。首次构建因磁盘空间不足失败，清理了旧 `target/debug/libaio_hub_lib.a` 构建产物后重试成功；源文件与独立客体改动保留。原生输入指南与 Dev Control 架构入口同步维护。

系统级 WebKit 空指针行为仍需上游处理；本轮修正应用侧自动默认值。本轮未扩展到其他 Linux 合成器、安装包或 Release 构建验证。虚拟机最终保留正常启动的修复实例，便于继续走查。