# AIO Hub 工具架构总集篇

> 本文档是 `src/tools/` 下目前(2026-5-24)为止全部 37 个工具模块的架构速览花名册，按功能大类分组。
> 每个条目仅概述核心定位与关键亮点，完整架构细节请参阅对应模块的 `ARCHITECTURE.md`。

---

## 一、AI / LLM 核心工具

### 1. [llm-chat](../src/tools/llm-chat/ARCHITECTURE.md) — 核心对话系统

项目的旗舰交互模块，实际上是一套拥有 **25 个子系统** 的完整 Agent 平台。

- **树状对话架构**: 基于 `ChatMessageNode` 的树形历史，支持非破坏性分支探索与嫁接；`lastSelectedChildId` 记忆分支偏好；内建完整的撤销/重做栈。
- **统一上下文管道**: 9 步处理器流水线（加载→正则→注入→RAG→转写→世界书→Token限制→格式化→资源解析），确保 Prompt 构建高度可控。
- **高级 Agent 配置**: 深度集成用户档案、SillyTavern 兼容（角色卡/预设导入）、私有资产管理（`agent-asset://`）、虚拟时间线与三阶段宏引擎。
- **内容增强与处理**: 内置双向翻译（含 XML 保护）、上下文压缩（非破坏性摘要）、续写补全、快捷操作、本地路径转附件等功能。
- **RAG 与知识系统**: 智能 RAG（四种触发模式、双引擎检索、语义缓存）与世界书（关键词实时匹配注入）双轨并行。
- **基础设施与调试**: VCP 纯文本工具调用协议、统一思考能力控制（Thinking Budget）、上下文分析器、消息 JSON 编辑器、TTFT/TPS 性能监控。
- **UI 交互设计**: 支持 CSS content-visibility 原生虚拟渲染（千级消息不卡顿）、Vue Flow 驱动的对话树图、跨窗口主从同步、输入草稿持久化。

**亮点**：树形分支结构、9 步统一上下文管道、SillyTavern 生态兼容、VCP 工具调用、非破坏性压缩、跨窗口同步、虚拟时间线。

---

### 2. [media-generator](../src/tools/media-generator/ARCHITECTURE.md) — 媒体生成中心

一站式 AI 媒体生成工作站，采用**会话-任务双轨制**架构。支持图片/视频/音频/3D 多种模态生成，内置参数清洁、上下文规则、资产元数据嵌入等完整流程。

**亮点**：双轨解耦设计、树形分支实验管理、自动参数清洁与上下文规则。

---

### 3. [tool-calling](../src/tools/tool-calling/ARCHITECTURE.md) — 工具调用基础设施

为 LLM Agent 提供"感知工具→生成调用→解析执行→回注结果"闭环。支持多协议扩展，当前实现 **VCP（文本标记协议）**。内置调试测试界面。

**亮点**：协议可插拔、双重安全校验、超时保护、自动预览钩子。

---

### 4. [knowledge-base](../src/tools/knowledge-base/ARCHITECTURE.md) — 知识库 / RAG 引擎

高性能本地 RAG 引擎，支持关键词、向量、混合等多种检索引擎热切换。基于原子知识单元和标签池体系，提供不同风格的召回体验。

**亮点**：多引擎热切换、标签之海语义关联。

---

### 5. [embedding-playground](../src/tools/embedding-playground/ARCHITECTURE.md) — Embedding 测试场

交互式 Embedding 调试工具，提供**相似度对比**、**RAG 检索模拟**、**基础向量调试**三大面板。内置增量缓存机制。

**亮点**：二级缓存模型隔离、多种向量算法支持、RAG 原型快速验证。

---

### 6. [token-calculator](../src/tools/token-calculator/ARCHITECTURE.md) — Token 计数器

精确的 Token 计数工具，**Web Worker 离线计算**避免卡顿。支持动态 Tokenizer 懒加载和多模态图片 Token 估算。

**亮点**：Worker 主从架构、懒加载缓存策略、OpenAI 瓦片法/固定成本法兼容。

---

### 7. [skill-manager](../src/tools/skill-manager/ARCHITECTURE.md) — Skill 技能管理器 🆕

Agent Skills 规范的**运行时基础设施**。采用 **Backend-First 架构**（Rust 引擎 + TS 桥接层），将符合规范的 Skill 包无缝桥接到 AIO 工具调用系统。支持渐进式披露策略避免 Prompt 膨胀，双代理设计（SkillProxy 负责激活+上下文，SkillManagerProxy 提供脚本执行/文件读取）职责分离。内置可视化管理界面，支持从本地/Git/URL 安装 Skill。

**亮点**：Backend-First 安全架构（Rust 路径沙箱+超时控制）、工厂桥接热加载、渐进式披露、双代理分工、具名方法增强。

---

## 二、开发与调试工具

### 8. [llm-inspector](../src/tools/llm-inspector/ARCHITECTURE.md) — LLM 请求代理拦截器

基于 **Rust 原生 Axum 代理**的 LLM 请求拦截工具。事件驱动通信，支持 SSE 流式实时捕获和解析。

**亮点**：Rust 层高性能代理、实时 SSE 流处理、请求/响应生命周期追踪。

---

### 9. [api-tester](../src/tools/api-tester/ARCHITECTURE.md) — HTTP API 测试工具

**预设驱动**的 HTTP API 测试环境，内置 `{{variable}}` 模板变量系统，原生支持 SSE 流式响应。

**亮点**：预设一键填充、变量系统、流式响应自动检测。

---

### 10. [code-formatter](../src/tools/code-formatter/ARCHITECTURE.md) — 代码格式化工具

基于 Prettier 的代码格式化，采用**静态+动态混合插件加载**策略，内置启发式语言检测。

**亮点**：按需动态加载插件、启发式语言检测、零配置体验。

---

### 11. [component-tester](../src/tools/component-tester/ARCHITECTURE.md) — 组件测试面板

内部开发调试工具，集中展示和测试 UI 组件，验证主题系统在不同组件上的表现。

**亮点**：Tab 分类管理、主题色板验证、消息系统测试。

---

### 12. [service-monitor](../src/tools/service-monitor/ARCHITECTURE.md) — 服务注册中心监控

应用内部服务 API 可视化查询工具，读取 `serviceRegistry` 展示服务的元数据和方法签名。

**亮点**：自动服务发现、方法签名可视化。

---

## 三、文件与数据处理

### 13. [dir-search](../src/tools/dir-search/ARCHITECTURE.md) — 目录内容搜索 🆕

轻量级目录内容搜索与替换工具，**Rust 后端流式搜索 + 前端实时渲染**架构。基于 `ignore` crate 并行遍历，有界 channel 背压控制，支持正则/大小写/全词匹配、上下文行展示、单项精确替换。

**亮点**：并行流式搜索（sync_channel 背压）、搜索代计数器竞态解决、双视图（列表/树形）、Monaco 可编辑预览、Preserve Case 替换。

---

### 14. [asset-manager](../src/tools/asset-manager/ARCHITECTURE.md) — 中央资产管理中心

全局统一的资产管理服务。基于**Rust 后端索引**实现高性能查询，支持自动去重、多媒体元数据提取（视频缩略图、音频封面）。

**亮点**：哈希去重、Rust 高性能索引、无限滚动懒加载。

---

### 15. [content-deduplicator](../src/tools/content-deduplicator/ARCHITECTURE.md) — 内容查重工具

基于 **Rust 五阶段扫描漏斗**算法：文件收集→尺寸分桶→快速指纹→全文规范化哈希→结果构建。支持精确/规范化副本检测。

**亮点**：五阶段漏斗过滤、BLAKE3 高速哈希、流式读取避免内存溢出、回收站安全删除。

---

### 16. [data-filter](../src/tools/data-filter/ARCHITECTURE.md) — 数据筛选工具

处理大规模 JSON/YAML 数组的效率工具，支持深层路径访问和多条件组合过滤。

**亮点**：lodash 深层路径取值、自定义 JS 脚本过滤、预设系统。

---

### 17. [json-formatter](../src/tools/json-formatter/ARCHITECTURE.md) — JSON 格式化工具

支持**可控展开层级**的 JSON 格式化，允许用户精确控制折叠深度。

**亮点**：自定义递归序列化、可控展开深度、解耦的 Logic/Registry 分层。

---

### 18. [config-converter](../src/tools/config-converter/ARCHITECTURE.md) — 配置格式转换器

采用 **"Parse → JS Object → Serialize" 三阶段管道** 的配置文件格式互转工具。通过统一的中间表示（JS 对象）实现 JSON/YAML/TOML/INI/XML/.env 六种格式任意双向 **N×N 互转**。提供单文件实时预览（300ms 防抖 CodeMirror 双栏）和批量文件处理双模式。内置"路径优先 + 内容嗅探"的格式自动检测引擎，对 INI/.env 等扁平格式的有损转换自动收集警告而非阻断。

**亮点**：三阶段统一管道 N×N 互转、双模式（实时预览 + 批量处理）、路径优先+内容嗅探格式检测、有损转换警告收集不阻断流程。

---

### 19. [regex-applier](../src/tools/regex-applier/ARCHITECTURE.md) — 正则批量处理工具

**前后端双引擎架构**：前端 JS 引擎提供实时预览，Rust 后端处理批量文件。内置正则兼容性检查。

**亮点**：双引擎协同、跨引擎兼容性校验、规则链预设。

---

### 20. [text-diff](../src/tools/text-diff/ARCHITECTURE.md) — 文本对比工具

深度集成 **Monaco Diff Editor**，支持智能文件拖拽分配和 Unified Diff Patch 生成。

**亮点**：Monaco 企业级对比、智能文件分配、统一补丁格式。

---

### 21. [directory-tree](../src/tools/directory-tree/ARCHITECTURE.md) — 目录树可视化

基于 Rust `ignore`（ripgrep 引擎）高性能遍历，返回**结构化 TreeNode**，前端负责动态渲染与二次筛选。

**亮点**：后端结构化输出+前端动态渲染分离、原生 .gitignore 支持。

---

### 22. [directory-janitor](../src/tools/directory-janitor/ARCHITECTURE.md) — 目录清理器

Rust 后端驱动的目录清理工具，支持多条件过滤（Glob 名、年龄、大小、深度）和安全回收站删除。

**亮点**：Rust 高性能扫描、灵活 AND 组合过滤、回收站保护。

---

### 23. [symlink-mover](../src/tools/symlink-mover/ARCHITECTURE.md) — 符号链接搬家

将文件/目录移动到新位置并创建链接，支持**符号链接**和**硬链接**两种模式。Rust 后端前置安全校验。

**亮点**：双操作模式、双链接类型、前置校验防误操作。

---

## 四、媒体处理工具

### 24. [ffmpeg-tools](../src/tools/ffmpeg-tools/ARCHITECTURE.md) — FFmpeg 多媒体工作台

基于 **Tokio 异步进程管理**的 FFmpeg 前端，支持实时 stderr 进度解析和元数据提取。

**亮点**：流式进度解析、多任务并行管理、智能码率计算。

---

### 25. [media-info-reader](../src/tools/media-info-reader/ARCHITECTURE.md) — 媒体元数据读取

专为 AI 生成图片设计的元数据提取器，**三层解析策略**兼容易用 EXIF、WebUI 参数、非标准 PNG chunk。

**亮点**：分层递进解析、ST 角色卡支持、ComfyUI 工作流提取。

---

### 26. [danmaku-player](../src/tools/danmaku-player/ARCHITECTURE.md) — 弹幕播放器

非侵入式弹幕增强工具，支持**外部同步模式**（双窗口+Win32 API吸附）和**内置播放模式**（单窗口+组件化集成）。

**亮点**：窗口精准 Z-Order 吸附、虚拟时钟偏差校准、GPU 合成层渲染优化。

---

### 27. [transcription](../src/tools/transcription/ARCHITECTURE.md) — 多模态转写管理

弥合多模态资产与纯文本模型之间的鸿沟。**插件化引擎架构**支持图片/音频/视频/PDF 四种模态转写。

**亮点**：任务驱动架构、可插拔引擎、资产衍生数据秒开复用。

---

### 28. [smart-ocr](../src/tools/smart-ocr/ARCHITECTURE.md) — 智能 OCR

四引擎 OCR 工具（Tesseract.js / Windows Native / VLMAPI / OCRAPI），内置**智能切图算法**处理长截图。

**亮点**：多引擎架构、空白横带检测切图、并发控制。

---

### 29. [sketch-pad](../src/tools/sketch-pad/ARCHITECTURE.md) — 画板

轻量画板工具，基于 Konva.js 实现矢量形状编辑，结合 HTML Canvas 2D 实现位图手绘。两种图层类型自由混合排列。内置 `perfect-freehand` 笔画平滑、多色铅笔/马克笔/橡皮擦画笔、Transformer 变换控制与 10 种类型的混合撤销栈。支持图片导入（Asset Manager 集成）、文本就地编辑、图层栅格化与向下合并。项目以目录式结构持久化（appDataDir），支持自动保存、.aiosk ZIP 打包导出及一键发送到 LLM Chat。

**亮点**：专用位图/对象 Canvas 分离、10 种撤销类型、智能工具-图层自动匹配、图层混合模式控制、增量保存与断链占位图。

## 五、知识整合与外部连接

### 30. [web-canvas](../src/tools/web-canvas/ARCHITECTURE.md) — Agent 协作画布

**Physical-First** 架构的 Agent 协作画布，所有编辑直接作用磁盘，Git 追踪版本。内置强大的 **Search/Replace Diff 引擎**（4 级降级匹配策略）。

**亮点**：Physical-First 无影子文件、Git 原生版本控制、Bigram Dice 模糊匹配。

---

### 31. [git-analyzer](../src/tools/git-analyzer/ARCHITECTURE.md) — Git 仓库分析

基于 **git2-rs** 的原生 Git 分析，**流式加载**百万级提交记录。

**亮点**：原生 libgit2 高性能、流式分批推送、积木式格式化信息生成。

---

### 32. [web-distillery](../src/tools/web-distillery/ARCHITECTURE.md) — 网页蒸馏室

多模式网页内容提取工具，**三层蒸馏模式**（快速/Smart/交互），内置本地 Axum 代理绕过同源限制。

**亮点**：三层蒸馏能耗递增、本地代理+反检测注入、可视化配方编辑器（开发中）。

---

### 33. [vcp-connector](../src/tools/vcp-connector/ARCHITECTURE.md) — VCP 连接器

与 VCP（开源 AI 运行时）的桌面端对接工具。支持**消息监控**（6 种运行时事件实时展示）、**分布式节点**（暴露本地工具）、**工具桥接**到 AIO Hub 中使用。

**亮点**：双 WebSocket 独立管理、虚拟滚动消息监控、双向工具共享。

---

### 34. [color-picker](../src/tools/color-picker/ARCHITECTURE.md) — 智能取色器

图片颜色分析工具，**三种算法并行**（Quantize / Vibrant / Average Color）提供多维度配色洞察。

**亮点**：并行多算法分析、资产去重集成、持久化历史记录。

---

## 六、系统与渲染引擎

### 35. [system-pulse](../src/tools/system-pulse/ARCHITECTURE.md) — 系统硬件监控仪表盘

**推送驱动**的实时硬件监控，覆盖 CPU/内存/磁盘/网络/GPU。Rust 采集循环（1s/5s 分层采样），前端 RingBuffer 存储。

**亮点**：推送式架构无轮询、PDH 实时频率、NVML GPU 监控、三档密度缩放。

---

### 36. [rich-text-renderer](../src/tools/rich-text-renderer/ARCHITECTURE.md) — 富文本渲染引擎 🔥

LLM 时代的交互式内容渲染引擎。超越基础 Markdown，通过自研 V2 解析器实现 HTML 与 Markdown 的深度融合，支持嵌入式 SPA 沙箱运行与 VCP 工具调用可视化。

**亮点**：双区域 Patch 更新（零闪烁）、CSS 作用域隔离、嵌入式应用沙箱、多线程词法分析、LLM 思考链与可交互按钮支持。

---

## 七、包装入口工具

### 37. [st-worldbook-editor](../src/tools/st-worldbook-editor/ARCHITECTURE.md) — ST 世界书编辑器

**轻量包装器**，直接复用 `llm-chat` 的 `WorldbookFullManager` 组件，提供可分离窗口访问世界书编辑能力。

---

## 附录：架构文档索引

| 序号 | 模块                 | 路径                                                                                                  | 核心定位                                          |
| :--: | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
|  1   | llm-chat             | [`src/tools/llm-chat/ARCHITECTURE.md`](../src/tools/llm-chat/ARCHITECTURE.md)                         | 核心对话系统（树形历史 + 统一管道）               |
|  2   | media-generator      | [`src/tools/media-generator/ARCHITECTURE.md`](../src/tools/media-generator/ARCHITECTURE.md)           | 媒体生成中心（会话-任务双轨）                     |
|  3   | tool-calling         | [`src/tools/tool-calling/ARCHITECTURE.md`](../src/tools/tool-calling/ARCHITECTURE.md)                 | 工具调用基础设施（协议可插拔）                    |
|  4   | knowledge-base       | [`src/tools/knowledge-base/ARCHITECTURE.md`](../src/tools/knowledge-base/ARCHITECTURE.md)             | 本地 RAG 引擎（4 种检索引擎）                     |
|  5   | embedding-playground | [`src/tools/embedding-playground/ARCHITECTURE.md`](../src/tools/embedding-playground/ARCHITECTURE.md) | Embedding 测试场（缓存 + 多算法）                 |
|  6   | token-calculator     | [`src/tools/token-calculator/ARCHITECTURE.md`](../src/tools/token-calculator/ARCHITECTURE.md)         | Token 计数（Worker 离线计算）                     |
|  7   | skill-manager        | [`src/tools/skill-manager/ARCHITECTURE.md`](../src/tools/skill-manager/ARCHITECTURE.md)               | Skill 运行环境（Backend-First 桥接 + 渐进式披露） |
|  8   | llm-inspector        | [`src/tools/llm-inspector/ARCHITECTURE.md`](../src/tools/llm-inspector/ARCHITECTURE.md)               | LLM 代理拦截器（Rust 原生代理）                   |
|  9   | api-tester           | [`src/tools/api-tester/ARCHITECTURE.md`](../src/tools/api-tester/ARCHITECTURE.md)                     | HTTP API 测试（预设驱动 + 变量）                  |
|  10  | code-formatter       | [`src/tools/code-formatter/ARCHITECTURE.md`](../src/tools/code-formatter/ARCHITECTURE.md)             | 代码格式化（混合插件加载）                        |
|  11  | component-tester     | [`src/tools/component-tester/ARCHITECTURE.md`](../src/tools/component-tester/ARCHITECTURE.md)         | 组件测试面板                                      |
|  12  | service-monitor      | [`src/tools/service-monitor/ARCHITECTURE.md`](../src/tools/service-monitor/ARCHITECTURE.md)           | 服务注册中心监控                                  |
|  13  | dir-search           | [`src/tools/dir-search/ARCHITECTURE.md`](../src/tools/dir-search/ARCHITECTURE.md)                     | 目录内容搜索（流式 + 背压 + 双视图）              |
|  14  | asset-manager        | [`src/tools/asset-manager/ARCHITECTURE.md`](../src/tools/asset-manager/ARCHITECTURE.md)               | 中央资产管理（Rust 索引 + 去重）                  |
|  15  | content-deduplicator | [`src/tools/content-deduplicator/ARCHITECTURE.md`](../src/tools/content-deduplicator/ARCHITECTURE.md) | 内容查重（五阶段扫描漏斗）                        |
|  16  | data-filter          | [`src/tools/data-filter/ARCHITECTURE.md`](../src/tools/data-filter/ARCHITECTURE.md)                   | JSON/YAML 数据筛选                                |
|  17  | json-formatter       | [`src/tools/json-formatter/ARCHITECTURE.md`](../src/tools/json-formatter/ARCHITECTURE.md)             | JSON 格式化（可控展开层级）                       |
|  18  | config-converter     | [`src/tools/config-converter/ARCHITECTURE.md`](../src/tools/config-converter/ARCHITECTURE.md)         | 配置格式转换器（三阶段管道 N×N 互转）             |
|  19  | regex-applier        | [`src/tools/regex-applier/ARCHITECTURE.md`](../src/tools/regex-applier/ARCHITECTURE.md)               | 正则批量处理（前后端双引擎）                      |
|  20  | text-diff            | [`src/tools/text-diff/ARCHITECTURE.md`](../src/tools/text-diff/ARCHITECTURE.md)                       | 文本对比（Monaco Diff + Patch）                   |
|  21  | directory-tree       | [`src/tools/directory-tree/ARCHITECTURE.md`](../src/tools/directory-tree/ARCHITECTURE.md)             | 目录树可视化（Rust 遍历 + 前端渲染）              |
|  22  | directory-janitor    | [`src/tools/directory-janitor/ARCHITECTURE.md`](../src/tools/directory-janitor/ARCHITECTURE.md)       | 目录清理（Rust 扫描 + 回收站）                    |
|  23  | symlink-mover        | [`src/tools/symlink-mover/ARCHITECTURE.md`](../src/tools/symlink-mover/ARCHITECTURE.md)               | 符号链接搬家（双模式 + 安全校验）                 |
|  24  | ffmpeg-tools         | [`src/tools/ffmpeg-tools/ARCHITECTURE.md`](../src/tools/ffmpeg-tools/ARCHITECTURE.md)                 | FFmpeg 工作台（Tokio 异步进程）                   |
|  25  | media-info-reader    | [`src/tools/media-info-reader/ARCHITECTURE.md`](../src/tools/media-info-reader/ARCHITECTURE.md)       | 媒体元数据读取（三层解析）                        |
|  26  | danmaku-player       | [`src/tools/danmaku-player/ARCHITECTURE.md`](../src/tools/danmaku-player/ARCHITECTURE.md)             | 弹幕播放器（窗口吸附 + 虚拟时钟）                 |
|  27  | transcription        | [`src/tools/transcription/ARCHITECTURE.md`](../src/tools/transcription/ARCHITECTURE.md)               | 多模态转写（插件化引擎）                          |
|  28  | smart-ocr            | [`src/tools/smart-ocr/ARCHITECTURE.md`](../src/tools/smart-ocr/ARCHITECTURE.md)                       | 智能 OCR（四引擎 + 切图）                         |
|  29  | sketch-pad           | [`src/tools/sketch-pad/ARCHITECTURE.md`](../src/tools/sketch-pad/ARCHITECTURE.md)                     | 画板（位图手绘 + 矢量形状 + 图层管理）            |
|  30  | web-canvas           | [`src/tools/web-canvas/ARCHITECTURE.md`](../src/tools/web-canvas/ARCHITECTURE.md)                     | Agent 协作画布（Physical-First + Diff）           |
|  31  | git-analyzer         | [`src/tools/git-analyzer/ARCHITECTURE.md`](../src/tools/git-analyzer/ARCHITECTURE.md)                 | Git 仓库分析（git2-rs + 流式）                    |
|  32  | web-distillery       | [`src/tools/web-distillery/ARCHITECTURE.md`](../src/tools/web-distillery/ARCHITECTURE.md)             | 网页蒸馏（三层模态 + 本地代理）                   |
|  33  | vcp-connector        | [`src/tools/vcp-connector/ARCHITECTURE.md`](../src/tools/vcp-connector/ARCHITECTURE.md)               | VCP 连接器（监控 + 节点 + 桥接）                  |
|  34  | color-picker         | [`src/tools/color-picker/ARCHITECTURE.md`](../src/tools/color-picker/ARCHITECTURE.md)                 | 智能取色（三算法并行分析）                        |
|  35  | system-pulse         | [`src/tools/system-pulse/ARCHITECTURE.md`](../src/tools/system-pulse/ARCHITECTURE.md)                 | 系统硬件监控（推送式 + RingBuffer）               |
|  36  | rich-text-renderer   | [`src/tools/rich-text-renderer/ARCHITECTURE.md`](../src/tools/rich-text-renderer/ARCHITECTURE.md)     | 富文本渲染引擎（流式零闪烁）                      |
|  37  | st-worldbook-editor  | [`src/tools/st-worldbook-editor/ARCHITECTURE.md`](../src/tools/st-worldbook-editor/ARCHITECTURE.md)   | ST 世界书编辑器（轻量包装器）                     |

---

> 📅 生成时间: 2026-05-24

> 📁 文档来源: `src/tools/*/ARCHITECTURE.md`（37 篇架构文档汇总）
