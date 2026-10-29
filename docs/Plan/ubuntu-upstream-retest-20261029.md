# Ubuntu 上游同步与回归复测（2026-10-29）

## 结论

已将 Windows 主线检出 `E:/rc20/allinweb/aiohub-dev` 的已提交变更同步到本工作区，并在 Ubuntu 真实 Tauri / WebKitGTK 窗口重新构建、回放和查看截图。

- HTML 预览交互 8/8 通过，前轮失败的高度回缩和围栏收尾状态保留均已修复。
- 复杂会话 32/32 回放完成，主题矩阵 38/38 生效；主页与设置页另检查 16 个页面状态。
- 27/27 富文本预设产生可见内容；8/8 复杂流式样本最终 AST 匹配。
- 本轮发现并修复附件 URL 拼接强制使用 Windows 分隔符的问题。复杂会话采样中的损坏图片计数为 0。
- 重会话仍有显著停顿，多媒体最长单次 rAF 间隔约 2.06 秒，多分支约 1.21 秒。补充回放将后续排查范围收敛到正文激活、真实高度展开和布局恢复。

## 同步范围与保留内容

同步来源为 `win-main/dev` 的 `d6e4836a966abb2ff8d1daaef86fd88e5dfdb6d6`，共同基点为 `a74aa3ae1`，共 40 个提交、118 个文件。包含：

- HTML 预览节流追帧、自动高度回缩、等价文档状态保留和 fixed 视口边界。
- 长消息按阅读视口回收、异步布局稳定后缓存高度、公式及 Mermaid 调度与输出清理。
- 聊天增量同步、折叠思考和工具结果显示，以及上下文管线与分词复用优化。
- 对应测试、运行脚本、架构文档及桌面版本 `0.7.1-alpha.1`。

115 个上游文件与来源 Git blob 一致。`package.json` 合并保留已有 Linux 控制入口；两个内嵌预览脚本做了下述跨平台适配。已有 Linux 资源修复和未提交控制脚手架均保留。

变更目前位于工作区，Git HEAD 仍为 `2d516cf94`；本轮未创建提交或推送。Windows 主线中的 README 和图片编辑保持原状。同步清单与同步前差异快照位于 `.tmp/ubuntu-upstream/sync.json`、`pre-sync.patch`。

## 本轮修复与脚手架适配

### 附件图片路径

`src/composables/useAssetManager.ts` 的 `convertToAssetProtocol()` 原先将根目录和相对路径统一转换为反斜杠。Linux 附件请求因此指向 `\home\mty\...`，原生资源协议报告文件不存在。

现统一使用正斜杠，保留 POSIX 根、Windows 盘符与 UNC 前缀，清理拼接处重复分隔符。真实实例中的附件图片已完成加载，URL 解码后对应 guest 内实际文件路径。

新增 4 个路径契约用例，覆盖 POSIX 路径、根目录尾分隔符、Windows 盘符和 UNC。它们防护附件 URL 指向错误文件的公开行为，保持独立于组件实现；修复前 2 个 POSIX 用例失败，修复后 4/4 通过。Windows 原生运行态留待对应平台复测。

前轮对独立资源目录的授权修复已经生效；此次补齐了附件自身的路径拼接。前轮单张 PNG 探测与资源授权日志未覆盖这条附件路径。

### 内嵌预览正式入口

`rich-text:embedded:tauri` 复用现有跨平台会话层，WebView2 与 WebKitGTK 运行同一页面契约，并保存运行引擎与诊断错误。原有 `--allow-hmr` 选项保留；WebKitGTK 使用生产资源 Debug 实例。

生产 Vue 构建中的组件查找改为读取 `app.mount()` 返回实例的子树，避开仅开发构建可用的 `app._instance`。正式入口现在可直接在 Ubuntu 重复调用。

## 实际验证结果

| 范围                 | 结果                          | 说明                                         |
| -------------------- | ----------------------------- | -------------------------------------------- |
| 上游关联单测         | 36 个文件、279 项通过         | 显式排除 `.tmp/**` 中历史源码快照            |
| 附件路径回归         | 4/4 通过                      | 保留修复前失败证据                           |
| 前端类型检查         | 通过                          | `bun run build:tsc`                          |
| 富文本脚本类型检查   | 通过                          | `bun run rich-text:check`                    |
| Vite 生产资源构建    | 通过                          | `AIO_DEV_CONTROL=1`                          |
| 原生 Debug 构建      | 通过                          | 生产资源、独立数据目录，版本 `0.7.1-alpha.1` |
| HTML 预览交互        | 8/8 通过                      | 正式 CLI 入口                                |
| 复杂会话             | 8 类 × 4 种外观，共 32 例完成 | 会话选择、程序滚动、截图与诊断               |
| 完整主题矩阵         | 38/38 生效                    | 浅/深、壁纸、透明度、模糊、关闭特效          |
| 主页与设置           | 16 个页面状态                 | 8 组代表外观                                 |
| 富文本静态预设       | 27/27 有可见内容              | 代码、公式、图表、HTML、样式隔离等           |
| 复杂流式样本         | 8/8 最终 AST 匹配             | 参考解析器沿用实际 Renderer 默认配置         |
| 正式复杂样本性能入口 | static / stream 均通过        | 最终 AST 匹配，采样错误为空                  |

宿主机首次单测运行有 4 个测试文件因本机 workspace 依赖缺失而未能加载；转到依赖完整的 Ubuntu 原生检出后，上述 36 个关联文件全部通过。结果依据 guest 最终日志。

### HTML 预览交互

- Canvas：iframe 高度 `288 → 648 → 288 px`，正确随正文回缩。
- 异步图片：iframe 高度 `200 → 488 → 200 px`，图片移除后回缩。
- 卸载后新增 Canvas tick 为 0。
- fixed 浮层、百分比高度与仅 fixed 内容的视口契约通过。
- 等价围栏收尾时 iframe 新增 load 为 0，输入内容和计数 `1` 保留。
- 真正修改 HTML 后新增 load 为 1，并显示新内容。

## 重会话滚动观察

同一套脱敏语料与主题定义继续用于回放。两轮原始会话采样的 WebView 视口均为 `1440 × 900`。

下表为每类样本在 4 种外观下，约 900 ms 程序滚动期间的最长单次 rAF 间隔范围，单位 ms：

| 样本        | 前轮旧实现 | 同步后本轮 |
| ----------- | ---------: | ---------: |
| typical     |     69–133 |     92–146 |
| long-thread |     94–119 |     97–149 |
| long-answer |    614–648 |    361–607 |
| rich-text   |    109–142 |    109–138 |
| reasoning   |    164–238 |    134–185 |
| tools       |      18–72 |      17–69 |
| branches    |   327–1347 |   477–1208 |
| media       |   269–2168 |  1787–2060 |

每种配置仅做一次诊断回放，顺序和缓存影响仍在。本轮又修复了图片附件加载，渲染工作量有所变化。表格用于判断停顿是否仍然存在；量化上游收益需要固定素材加载状态后的成对重复采样。

正式复杂预设的首次内容帧为 static 237 ms、stream 47 ms，也各只有一个样本。WebKitGTK 未提供 longtask entry 与 CDP Performance 指标，报告对应字段保留缺失状态。

### 补充：上翻意图与 DOM 驻留

新上游滚动锚点由滚轮、键盘等阅读意图解除底部跟随。直接设置 `scrollTop` 时，异步布局可能继续把视图对齐到底部。首轮纯程序探针保留为 `residency-programmatic.json`；补充探针通过合成 wheel 事件表达方向，再执行 rAF 程序滚动，顶部和底部目标均达到。

该补充采样关闭 UI 特效：

| 样本     | 下滚最大间隔 | 上滚最大间隔 | 起始 / 下滚后 DOM 元素 |      列表高度变化 |
| -------- | -----------: | -----------: | ---------------------: | ----------------: |
| branches |      1089 ms |       272 ms |            4743 / 4319 |  28690 → 37808 px |
| media    |      1984 ms |       493 ms |            2607 / 2542 | 27282 → 238102 px |

两例均未观察到块级 `data-render-placeholder`。滚动前后的 DOM 数量接近，但首次向下激活内容时，列表真实高度仍显著展开；多媒体样本由约 2.7 万增至 23.8 万 px。此结果将排查重点指向消息激活后的高度估算、异步内容完成与布局恢复，后续结合时间线定位具体耗时调用。

这些操作使用 DOM 输入与合成事件，原生鼠标滚轮体验仍需独立验证。生产构建中 DOM 上的 Vue 组件元数据探测未能可靠读取，整理结果已标记缺失；上述表格只使用 DOM、几何和帧观察。

## 界面与错误观察

实际查看了复杂会话、浅深色页面和富文本预设截图，并通过 VMware 窗口截图确认 guest 控制台显示正常。

- 三栏聊天工作区、输入工具栏、主页与设置导航均完整显示；会话、矩阵和页面采样未出现页面级横向溢出。
- 修复后的图片附件正常显示。图片为测试器合成素材，文字经过脱敏；其尺寸与解码负载沿用旧语料的重建规则。
- 代码高亮、Mermaid 连线、公式、HTML 交互区和样式隔离样例在真实 WebKitGTK 中可见。
- 基础透明度 0.3 配合壁纸时，背景对正文的干扰仍明显；0.75 的文字层次更清楚。
- 复杂会话诊断仍出现 8 次 `ResizeObserver loop completed with undelivered notifications.`；主题、主页/设置、静态预设与流式阶段的前端诊断为空。
- 原生日志另记录 2 次预设头像 `/agent-icons/sakata-gintoki.jpg` 缺失；该路径来自示例内容。复杂会话的 `assets/memory/` 路径未再出现文件不存在或授权错误。

测试期间使用有时限的显示唤醒，保留系统长期电源与锁屏设置。结束后移除测试唤醒标记，独立测试应用保留在复杂渲染预设页面。

## 证据与复现

产物根目录：`.tmp/ubuntu-upstream/`。

- `embedded/report.json`：8 项原始交互结果。
- `results/corpus.json`、`matrix.json`、`pages.json`：复杂会话、38 项主题配置和页面状态。
- `results/presets.json`、`stream.json`：静态预设和流式 AST 校验。
- `results/residency.json`：补充阅读意图与驻留诊断；原始探针另行保留。
- `formal-complex/report.json`：正式性能入口原始报告。
- `results/*contact.jpg`、`final-complex-rendering-test.png`、`vm-console-final.png`：查看过的界面证据。
- `unit-tests.log`、`asset-path-before.log`、`asset-path-after.log`、`typecheck-final.log`、`vite-final.log`、`native-final.log`、`app-native.log`：检查与原生运行日志。

```bash
cd /home/mty/aio-hub-Ubuntu
export PATH="$HOME/.local/bin:$HOME/.bun/bin:$HOME/.cargo/bin:$PATH"
bun run rich-text:embedded:tauri -- --instance ubuntu-matrix --out-dir .tmp/ubuntu-upstream/embedded-repeat
bun run rich-text:performance:tauri -- --instance ubuntu-matrix --cycles 1 --sizes 10 --filter '^preset:complex-rendering-test$' --modes static,stream --out-dir .tmp/ubuntu-upstream/formal-repeat
```

后续优先调查多媒体与多分支的首次激活和高度恢复路径，沿用本轮语料及窄范围滚动探针。
