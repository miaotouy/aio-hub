# 工具总览

AIO Hub 内置了 **34 个专业工具**，覆盖 AI 对话、媒体处理、文件管理、开发调试等各个领域。所有工具都在**主页**平铺展示，点击即可打开并自动固定到侧边栏标签页中。

---

## 🤖 AI 与 LLM 工具

### 智能对话

AIO Hub 的旗舰功能，一个高度模块化的对话式 AI 智能体工作站。支持树形对话历史、统一上下文管道、SillyTavern 生态兼容、RAG 知识检索、世界书、工具调用等完整能力。 [[查看教程](/user-guide/tools/llm-chat)](即将推出)

### 媒体生成中心

一站式 AI 媒体生成工作站，支持图片、视频、音频、3D 多种模态生成。采用会话-任务双轨制架构，内置参数清洁、上下文规则、资产元数据嵌入等完整流程。 [[查看教程](/user-guide/tools/media-generator)](即将推出)

### 工具调用中心

为 LLM 提供"感知工具→生成调用→解析执行→回注结果"的完整闭环。支持多协议扩展，内置调试测试界面，可自动/手动审批工具执行。 [[查看教程](/user-guide/tools/tool-calling)](即将推出)

### 知识库 / RAG 引擎

高性能本地 RAG 引擎，支持关键词、向量、混合等多种检索引擎热切换。基于原子知识单元和标签池体系，提供不同风格的召回体验。 [[查看教程](/user-guide/tools/knowledge-base)](即将推出)

### Embedding 测试场

交互式 Embedding 调试工具，提供相似度对比、RAG 检索模拟和基础向量调试三大面板，帮你快速验证 Embedding 模型效果。 [[查看教程](/user-guide/tools/embedding-playground)](即将推出)

### Token 计算器

精确的 Token 计数工具，支持多厂商模型 Tokenizer 动态加载。Web Worker 离线计算避免卡顿，还支持图片 Token 的可视化分析。 [[查看教程](/user-guide/tools/token-calculator)](即将推出)

### Skill 技能管理器

Agent Skills 运行时基础设施，让你能通过简单的目录结构扩展 LLM 的能力。支持从本地、Git 或 URL 安装 Skill，内置安全沙箱保障执行安全。 [[查看教程](/user-guide/tools/skill-manager)](即将推出)

---

## 🛠️ 开发与调试工具

### LLM 请求检查器

基于 Rust 原生代理的 LLM 请求拦截工具。启动本地中间人代理服务器，实时拦截、查看发往远程 LLM API 的请求和响应，方便调试和审计。 [[查看教程](/user-guide/tools/llm-inspector)](即将推出)

### API 测试器

灵活高效的 HTTP API 测试环境。支持 URL 模板变量、预设快速填充，原生处理 SSE 流式响应，让你轻松测试各种 API 接口。 [[查看教程](/user-guide/tools/api-tester)](即将推出)

### 代码格式化器

基于 Prettier 引擎的多语言代码格式化工具。自动检测代码语言，一键格式化，支持多种主流编程语言。 [[查看教程](/user-guide/tools/code-formatter)](即将推出)

### 组件测试面板

内部组件测试沙盒，集中展示和测试 UI 组件在不同主题下的表现，帮助开发者验证组件效果。 [[查看教程](/user-guide/tools/component-tester)](即将推出)

### 服务注册中心

可视化查看应用内所有已注册的工具服务及其元数据、方法签名，方便开发者了解系统能力并进行集成调试。 [[查看教程](/user-guide/tools/service-monitor)](即将推出)

---

## 📁 文件与数据处理

### 资产管理中心

应用级资源中心，基于 SHA-256 自动去重，集中管理所有工具产生的图片、文档、音视频等资产。支持无限滚动浏览和多媒体元数据提取。 [[查看教程](/user-guide/tools/asset-manager)](即将推出)

### 内容查重工具

基于 Rust 高性能引擎的重复文件查找工具。采用五阶段扫描漏斗算法，支持精确副本和规范化（去空格/大小写）副本检测，可安全删除至回收站。 [[查看教程](/user-guide/tools/content-deduplicator)](即将推出)

### 数据筛选工具

专门处理 JSON / YAML 大规模数据的效率工具。支持深层路径访问、多条件组合过滤，甚至可以用自定义 JS 脚本实现复杂筛选逻辑。 [[查看教程](/user-guide/tools/data-filter)](即将推出)

### JSON 格式化工具

支持可控展开层级的 JSON / YAML 格式化和校验工具。你可以精确控制折叠深度，让复杂数据结构一目了然。 [[查看教程](/user-guide/tools/json-formatter)](即将推出)

### 正则批量处理工具

双引擎正则处理架构：前端 JS 引擎提供毫秒级实时预览，后端 Rust 引擎处理大规模文件修改。支持将多个正则组合成处理流水线。 [[查看教程](/user-guide/tools/regex-applier)](即将推出)

### 文本差异对比

深度集成 Monaco Diff Editor 的文本对比工具。支持文件拖拽自动分配左右侧、语法高亮对比、生成 Unified Diff 补丁文件。 [[查看教程](/user-guide/tools/text-diff)](即将推出)

### 目录树生成

基于 Rust `ripgrep` 引擎的高性能目录树遍历工具。原生支持 `.gitignore` 规则，后端直接返回结构化树数据供前端渲染。 [[查看教程](/user-guide/tools/directory-tree)](即将推出)

### 目录清理工具

Rust 后端驱动的目录清理工具。支持按文件名模式、文件年龄、文件大小、目录深度等多条件组合过滤，删除前预览，安全放入回收站。 [[查看教程](/user-guide/tools/directory-janitor)](即将推出)

### 符号链接搬家

文件"搬家"利器。将文件或目录移动到新位置并创建链接，支持符号链接和硬链接两种模式，Rust 后端前置校验确保操作安全。 [[查看教程](/user-guide/tools/symlink-mover)](即将推出)

---

## 🎬 媒体与创意

### FFmpeg 多媒体工作台

基于 Rust 后端的 FFmpeg 图形化前端。支持视频压缩、格式转换、批量处理，实时解析处理进度，还支持智能码率计算。 [[查看教程](/user-guide/tools/ffmpeg-tools)](即将推出)

### 媒体元数据读取

专为 AI 生成图片设计的元数据提取器。支持 A1111 / ComfyUI 等主流工具的参数提取，还能读取 ST 角色卡和 PNG 隐藏信息。 [[查看教程](/user-guide/tools/media-info-reader)](即将推出)

### 弹幕播放器

非侵入式弹幕增强工具。支持外部同步模式（双窗口+窗口吸附）和内置播放模式，让你在观看视频时享受弹幕互动乐趣。 [[查看教程](/user-guide/tools/danmaku-player)](即将推出)

### 多模态转写管理

弥合多模态资产与纯文本模型之间的鸿沟。插件化引擎架构，支持图片 OCR、音频转文字、视频描述提取和 PDF 分批视觉转写。 [[查看教程](/user-guide/tools/transcription)](即将推出)

### 智能 OCR

四引擎 OCR 工具（Tesseract.js / Windows Native / VLM / OCR API），内置独创长图智能切片算法，轻松应对各种复杂的图片文字识别场景。 [[查看教程](/user-guide/tools/smart-ocr)](即将推出)

### 智能取色器

智能图片颜色分析工具。三种算法并行分析（量化/活力色/平均色），帮你从图片中提取配色方案，还支持屏幕取色和历史记录。 [[查看教程](/user-guide/tools/color-picker)](即将推出)

---

## 🌐 知识整合与外部连接

### Agent 协作画布

Physical-First 架构的 Agent 协作画布。所有编辑直接作用于磁盘文件，Git 原生追踪版本。内置强大的 Search/Replace Diff 引擎，支持模糊匹配。 [[查看教程](/user-guide/tools/web-canvas)](即将推出)

### Git 仓库分析器

基于 `git2-rs` 的高性能 Git 分析工具，秒开大型仓库。提供贡献者热力图、分支推断、提交频率分析，支持格式化导出报告。 [[查看教程](/user-guide/tools/git-analyzer)](即将推出)

### 网页蒸馏室

多模式网页内容提取工具。支持快速提取 / Smart 智能提取 / 交互式提取三层蒸馏模式，内置本地代理绕过同源限制。 [[查看教程](/user-guide/tools/web-distillery)](即将推出)

### VCP 连接器

连接 VCP 开源 AI 运行时的桌面对接工具。支持实时监控运行时事件、将 AIO Hub 注册为分布式节点、实现双向工具桥接。 [[查看教程](/user-guide/tools/vcp-connector)](即将推出)

### ST 世界书编辑器

专为 SillyTavern 格式设计的独立世界书编辑器。让你在独立窗口中便捷地管理超大规模的世界书设定集，与聊天功能深度配合。 [[查看教程](/user-guide/tools/st-worldbook-editor)](即将推出)

---

## ⚙️ 系统与渲染引擎

### 系统硬件监控

推送驱动的实时系统监控仪表盘。覆盖 CPU、内存、磁盘、网络、GPU 的实时数据，支持多种时间范围的历史走势图。 [[查看教程](/user-guide/tools/system-pulse)](即将推出)

### 富文本渲染引擎

专为 LLM 流式输出打造的高性能渲染引擎。支持 Markdown 与 HTML 深度混合排版，零闪烁增量渲染，内嵌 Mermaid 图表、KaTeX 公式、可交互按钮和嵌入式 SPA 沙箱。 [[查看教程](/user-guide/tools/rich-text-renderer)](即将推出)

---

> 💡 **提示**：每个工具都支持从主页一键打开，已打开的工具会显示在侧边栏标签页中。你也可以将工具拖拽为独立悬浮窗口使用，效率翻倍。
