# 文档站维护与教程截图

文档站发布用户手册和精选开发文档。功能说明以当前源码和真实应用操作为依据，截图由 Agent 通过项目开发控制 CLI 准备和采集。

## 发布范围

发布清单位于 `docs/.vitepress/publication.ts`：

| 内容                       | 发布规则                                         |
| -------------------------- | ------------------------------------------------ |
| 站点首页                   | 发布 `docs/index.md`                             |
| 用户手册                   | 发布 `docs/user-guide/` 下的 Markdown 页面       |
| 开发文档                   | 仅发布 `developerPages` 逐篇列出的指南与架构文章 |
| 计划、设计稿和其他仓库文档 | 保留在仓库，供实施与维护时查阅                   |

页面排除规则在 VitePress 发现路由时生效，因此搜索索引、页面打包和站点路由都使用相同范围。公开文档引用范围外的 Markdown 或仓库源码时，链接自动指向 GitHub 中的原文件。

新增用户教程时，在对应工具目录中编写页面并补充导航。新增公开开发文档时，将路径加入发布清单，再添加侧边栏入口。新增、移动或删除文件后重新启动文档开发服务，使页面清单重新计算。

截图与配套资源放在 `docs/public/user-guide/<toolId>/`，正文通过 `/user-guide/<toolId>/<image>.png` 引用。原始截图、批量操作指令和本地调试数据保留在 `.dev-data/`。

## 功能说明更新

修改教程前，阅读目标组件、直接调用及工具注册信息，确认入口名称、实际能力和平台依赖。按使用任务组织说明：在哪里打开、需要准备什么、如何操作、结果如何继续使用、失败后可以采取什么动作。

功能发生变化时，同步更新相关教程、工具总览和必要的入口介绍。涉及布局、操作入口或多步交互时，结合真实截图说明；已有操作说明可以直接由 Agent 补图，沿用项目开发实例与数据隔离规则。

## 字符画排版

仓库提供字符画整理脚本，扫描项目中的 Markdown 文档，支持中文混排、ASCII 框线和 Unicode 矩形框线。文档站在解析代码块时运行相同算法，开发预览、构建页面和代码复制使用整理后的文本，源文件保持原样。

```powershell
# 预览项目中待整理的文档
bun run docs:format

# 将可识别的字符画写回文档
bun run docs:format -- --write

# 只整理指定文件或目录
bun run docs:format -- --write src/tools/weather/docs/Plan/weather-feature-plan.md
bun run docs:format -- --write docs/architecture

# 只检查；有待整理内容时返回退出码 1
bun run docs:format -- --check
```

`bun run format` 会在常规格式化之后自动整理项目文档中的字符画。扫描范围遵循 Git 工作区及忽略规则，涵盖 `docs/`、工具文档、移动端文档和项目其他 Markdown；独立插件仓库由各插件维护。

字符画放入空语言标记或 `text`、`txt`、`plain`、`plaintext`、`ascii`、`ascii-art`、`diagram` 代码块。脚本保留文字、符号、行序、换行格式和 Markdown 容器缩进，根据完整横框确定边界，再调整空格和框宽。边界缺失、连接线复杂或对应关系有歧义的代码块保留原样；批量脚本会提示文件及代码块位置，便于人工查看。实现入口位于 `scripts/docs/`。

显示宽度采用英文一格、汉字通常两格的字符列规则。查看结果时使用支持中英混排的等宽字体；遇到 `★`、Emoji 等字体回退字符时，实际字形宽度可能偏离字符格，可按文档语义选用字体覆盖的符号。

## 文档图标

页面使用 `<LIcon name="..." />` 引用 Lucide 图标或项目工具图标。图标名称以对应图标库的实际导出为准；新增名称时，在 `docs/.vitepress/theme/icons.ts` 中添加具名导入与注册项，供文档正文和顶部操作菜单共同使用。显式注册可让打包器移除其余图标，减少每次打开文档时加载的资源。

## Agent 自行准备截图

使用 [Agent 开发界面控制](./dev-control.md) 操作真实 Tauri 窗口：

1. 查看现有实例，选择合适的开发实例；需要新建时使用独立实例名启动。
2. 使用可公开的示例数据准备目标场景，通过现有 store、service 或开发适配器填充必要内容。
3. 导航到目标工具，实际完成教程中的操作，确认页面和结果加载完成。
4. 调整窗口尺寸与面板宽度，让关键控件和内容可见，然后保存截图。
5. 查看原图，再制作需要的标注并放入文档资源目录。

查看与截图的基本命令：

```powershell
bun scripts/dev-control/cli.ts instances
bun scripts/dev-control/cli.ts windows --instance docs-demo
bun scripts/dev-control/cli.ts navigate /web-distillery --instance docs-demo
bun scripts/dev-control/cli.ts observe --instance docs-demo
bun scripts/dev-control/cli.ts screenshot --instance docs-demo
```

需要启动专用实例时：

```powershell
bun run dev -- --agent --agent-instance docs-demo
```

具体控件定位、批量步骤、截图范围和遮罩参数见 [CLI 指南](./dev-control.md)。含私人内容的界面使用公开示例或遮罩后采集，检查最终图片中的可见文字。

## 引导叠加层与标注

Agent 可以自行给真实截图添加编号、箭头、描边、文字气泡和局部放大。按内容选择制作方式：

- **截图后标注**：在原始 PNG 上叠加 SVG 或图片标注层，导出适合文档展示的 PNG / WebP。适合编号、框选和放大细节。
- **临时页面叠加层**：通过开发控制的显式求值，在当前开发窗口添加只负责展示的引导层，再截图。引导元素使用独立根节点、固定定位和 `pointer-events: none`；完成后移除该节点及配套样式。

标注指向实际存在的控件，文字使用教程中的步骤名称。保留关键按钮文字、菜单和结果，避免遮挡读者要找的内容。涉及多步操作时，每张图围绕一个操作或一组紧密相关的操作制作。

原始截图保留在本地，文档资源目录保存最终展示图。后续界面变化时，重新采集真实状态并更新对应标注。

## 构建与预览

```powershell
bun run docs:build
bun run docs:preview
```

构建后打开修改过的页面，检查图片清晰度、标注位置、链接和窄屏布局。发布清单变化时，核对产物页面与搜索结果。推送到主分支后的部署行为以 `.github/workflows/deploy-docs.yml` 为准。
