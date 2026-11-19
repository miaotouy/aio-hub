# 正式版 CLI 接管与现场记录

正式桌面应用可以通过本机 CLI 查看和操作当前窗口。应用照常使用原有数据目录，开发实例继续独立运行。Tauri 与 Electron 使用同一组命令。

## 开启与连接

1. 安装包含本功能的桌面构建。
2. 打开 **设置 → 高级与维护 → 日志与诊断**，开启 **本机调试接管**。设置会在下次启动时沿用。
3. 在仓库终端调用：

```powershell
bun run control -- instances
bun run control -- state
bun run control -- observe
```

同时运行多个受控实例时，用 `--pid <进程号>` 选择目标。`windows` 列出该实例的窗口，`--window <标签>` 选择分离窗口，默认操作主窗口。

```powershell
bun run control -- windows --pid 12345
bun run control -- observe --pid 12345 --window main
```

需要从仓库外调用时，运行 `bun run control:build` 生成 `.tmp/agent-control/aiohubctl.mjs`。该单文件可复制到常用工具目录，由 Bun 或 Node.js 24+ 执行：

```powershell
bun C:\Tools\aiohubctl.mjs instances
node C:\Tools\aiohubctl.mjs observe --pid 12345
```

关闭设置中的开关会停止采样、清理当前窗口的临时记录，并断开 CLI。已经提交到业务工具的任务沿用各自的取消入口；执行超时时，应先观察当前状态，再决定是否重试。

## 发生跳动、滚动条异常时

保持异常页面打开，优先保存现场：

- **快捷键**：按 **Ctrl+Alt+Shift+D**。应用先截取内存中的布局记录，再将文件写入应用数据目录的 `diagnostics/`，并提示保存结果。
- **CLI**：`export` 同时保存布局记录和当前语义观察；输出路径应选择一个新文件。
- **设置页**：点击“保存现场记录”，选择保存位置。

```powershell
bun run control -- export --pid 12345 --out .tmp/chat-layout.json
```

录制从接管开启时开始，循环保留最近 600 条变化与输入事件。当前覆盖会话侧栏、虚拟会话行、消息滚动区和消息行：

- 滚动位置、内容高度、可视尺寸；
- 行位置、高度与临时元素身份；
- 虚拟会话行的索引；
- 输入事件类型、页面切换可见性、异常事件发生时间。

临时缓冲通过当前窗口的 sessionStorage 衔接页面刷新。磁盘导出的文件适合长期保留、对照录屏与分享调查。

`inspect` 直接读取指定元素的几何和滚动状态，保持当前滚动位置：

```powershell
bun run control -- inspect --css .sessions-list --pid 12345
bun run control -- inspect --css .message-list --pid 12345
bun run control -- diagnostics --pid 12345
```

`observe` 和 `export` 的界面部分可能包含会话标题、按钮名称等可见信息；分享前按实际内容确认隐私范围。布局记录只包含数值与事件类型。

## 界面操作

`observe` 返回 `snapshotId` 和 `e1`、`e2` 等短期引用。引用有效期为 60 秒；再次观察会替换上一组引用，目标离开页面或语义发生变化时需要重新观察。

```powershell
bun run control -- click --snapshot <snapshotId> --ref e12
bun run control -- fill --snapshot <snapshotId> --ref e18 --text "搜索内容"
bun run control -- scroll --css .sessions-list --delta-y 300
bun run control -- navigate --path /llm-chat
```

CSS 定位要求唯一匹配。Element Plus 开关、复选框和单选框通过可见包装元素呈现语义；下拉框先点击打开，再 `observe`，使用弹层内选项的引用点击。原生 `select` 可使用 `select --value <值>`。

`press` 发送页面键盘事件，支持 Enter、Escape、方向键、Home、End 和空格。需要系统原生输入的操作可使用项目已有的原生输入通道。

## 工具动作

`actions` 读取已有工具注册表中标记为 `agentCallable` 的方法及参数。`action` 调用同一工具入口；同步方法返回执行确认，异步方法返回现有任务系统的 `taskId`，结果通过对应工具界面查看。

```powershell
bun run control -- actions
bun run control -- action --tool <工具ID> --method <方法名> --args '{"name":"example"}'
```

含敏感参数的指令优先通过 `--stdin` 提交，避免参数进入 shell 历史。标准输入为单条 JSON 指令，其 `op` 应与命令一致。

## 连接与输出保护

Windows 使用 Named Pipe，Linux/macOS 使用 Unix Domain Socket。连接文件位于应用数据目录的 `control.json`，当前用户的 `.aiohub/control/` 保存进程发现信息；CLI 自动读取连接校验信息，实例列表仅输出连接目标概况。

界面输出会跳过表单值、敏感区域与控制排除区域。API Key、请求头值、密钥管理区域已增加敏感标记；工具原始输出留在业务界面。`--data-dir <应用数据目录>` 可直接指定目标连接文件。

接口与验证记录见[正式版控制架构](../architecture/production-agent-control-architecture.md)。
