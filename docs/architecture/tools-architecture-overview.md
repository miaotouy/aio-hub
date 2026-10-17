# AIO Hub 工具架构总集篇

> 本文档按 2026-10-18 复核（核查基准 `c1fb114ec`），汇总 `src/tools/` 下全部 **48 个工具模块**。
> 每个条目只保留定位、架构主线和近期需要关注的边界；完整设计、数据流和实现约束请参阅对应模块的 `ARCHITECTURE.md`。
>
> 统一口径：`src/tools/` 共 48 个顶层工具目录，且每个目录均已建立 `ARCHITECTURE.md` 架构入口（48/48）。本文档条目数、目录数与架构文档篇数采用同一口径；agent-manager、user-profile-manager、retrieval、window-automator、wallpaper-detector 的入口已于本轮补齐，不再维护单独的「缺少入口目录名单」。

---

## 一、AI / LLM 核心工具

### 1. [llm-chat](../../src/tools/llm-chat/ARCHITECTURE.md) — 核心对话系统

项目的旗舰 Agent 交互平台，以 `ChatMessageNode` 树维护非破坏性分支历史，并由会话索引/详情管理器负责多会话、收藏夹和原子化持久化恢复。

- **统一上下文管道**：当前为 11 个核心处理器，覆盖会话加载、异步任务、正则、转写、世界书、预设注入、Recall、会话变量、Token 限制、消息格式化和资源解析。
- **跨工具编排**：Agent、User Profile、Recall、Knowledge、ST Worldbook Manager、Tool Calling 和 Skill Manager 通过明确的门面/类型边界协作，`llm-chat` 不再独占这些领域的数据所有权。
- **交互与诊断**：支持树状分支、推理状态回放、上下文分析、搜索取消与竞态保护、快捷操作、附件管道、虚拟时间线和跨窗口同步。

**亮点**：树形会话、11 步上下文管道、原子化恢复、SillyTavern 兼容、Recall/Worldbook 解耦、VCP 工具调用和跨窗口同步。

---

### 2. [media-generator](../../src/tools/media-generator/ARCHITECTURE.md) — 媒体生成中心

一站式 AI 媒体生成工作站，采用**会话—任务双轨制**管理图片、视频、音频和 3D 生成。生成运行时只读取模型自身的 `mediaGenParams`，参数清洁、上下文规则和资产元数据嵌入在任务管道内完成。

**亮点**：会话与任务解耦、树形分支实验、按媒体类型的提示词优化、参数清洁与资产元数据闭环。

---

### 3. [tool-calling](../../src/tools/tool-calling/ARCHITECTURE.md) — 工具调用基础设施

为 LLM Agent 提供“工具发现 → 协议解析 → 安全执行 → 结果回注”的闭环。协议层可扩展，当前生产实现以 VCP 文本标记协议为主，并通过 discovery、parser、executor、engine 分层承载工具调用。

**亮点**：协议可插拔、工具上下文发现、双重安全校验、AbortSignal 取消传播、超时/资源释放、授权原子检索工具和内置调试工作台。

---

### 4. [knowledge-base](../../src/tools/knowledge-base/ARCHITECTURE.md) — Knowledge 文档资料库

面向文档资料的独立领域，负责资料导入、持久摄取、目录同步、标签管理、检索过滤和显式授权访问。它与 Recall 的完整语义条目域分离，不再把 Recall store、entry 类型或运行时状态当作自己的实现。

**亮点**：文档域与 Recall 域分离、统一资料格式、持久摄取与目录同步、标签/过滤、显式资料引用和授权原子检索。

---

### 5. [recall](../../src/tools/recall/ARCHITECTURE.md) — Recall 思绪召回

管理完整语义条目、思绪集、标签、优先级、向量和检索运行时；以 SQLite 为真源，前端通过服务门面访问，后端提供模块化检索管线和监控能力。

- **检索预设**：当前稳定预设为 `algorithmic` 与 `comprehensive`，分别覆盖无需外部向量的算法召回和融合关键词/内容向量/标签/关联信号的综合召回。
- **产品接入**：支持 Agent binding、`recallConfig`、`{{recall}}` 与 `【recall::key=value】` 契约，供 `llm-chat` 的上下文管道执行被动召回。

**亮点**：SQLite 真源、原子条目模型、可编译检索管线、全局 LRU 检索缓存、向量空间身份隔离、迁移兼容边界清晰。

---

### 6. [embedding-playground](../../src/tools/embedding-playground/ARCHITECTURE.md) — Embedding 测试场

交互式 Embedding 调试与评估工具，提供 A/B 相似度、1:N 排行、多模型竞技场、检索模拟和原始向量调试五种工作模式。

**亮点**：模型身份与 Embedding 空间分离、二级缓存隔离、向量数学工具、检索原型验证和多模型横向比较。

---

### 7. [token-calculator](../../src/tools/token-calculator/ARCHITECTURE.md) — Token 计数器

在 Web Worker 中离线计算文本和多模态图片 Token。Tokenizer 通过资产注册表按需加载，主线程维护权威状态，Worker 使用无状态镜像，避免动态 loader 和主线程阻塞。

**亮点**：Tokenizer 资产化、Worker 主从架构、缓存隔离、OpenAI 图片 Token 估算和向后兼容的计算结果扩展。

---

### 8. [skill-manager](../../src/tools/skill-manager/ARCHITECTURE.md) — Skill 技能管理器

Agent Skills 规范的运行时基础设施。采用 **Backend-First** 架构（Rust 引擎 + TypeScript 桥接），通过渐进式披露把 Skill 包接入工具调用系统，并用 SkillProxy 与 SkillManagerProxy 分离激活、上下文、脚本执行和文件读取职责。

**亮点**：Rust 路径沙箱与超时控制、Bundle 安装管理、用户主动安装、`.env` 环境变量管理、工厂桥接热加载、渐进式披露和双代理分工。

---

### 9. [translator](../../src/tools/translator/ARCHITECTURE.md) — 翻译工作台

多渠道 LLM 并排翻译工具，采用 Facade + 子模块结构，通过 Pinia Store 编排设置、预设、引擎和历史。支持流式并发、单渠道停止/重试、场景化预设、智能语言粘性和输出 Token 风险估算。

**亮点**：多渠道对比、独立 AbortController、8 套场景预设、XML 保护、智能分片和三级 Token 风险预警。

---

### 10. [st-worldbook-manager](../../src/tools/st-worldbook-manager/ARCHITECTURE.md) — ST 世界书管理器

从 `llm-chat` 完全剥离出的自治工具，管理 SillyTavern 格式世界书的存储、编辑、导入导出和跨窗口同步。其他模块通过单向依赖引用其组件、Store 和类型。

**亮点**：独立工具注册、冷启动自动迁移、JSON 存储闭环、跨窗口同步、原子选择器到完整管理面板的分层 UI。

---

### 11. [agent-manager](../../src/tools/agent-manager/ARCHITECTURE.md) — 智能体大厅

`ChatAgent` 实体的唯一属主模块，负责智能体全生命周期管理：创建、编辑、复制、删除、导入导出、私有资产管理，以及把配置暴露给 LLM 的工具调用接口。所有持久化经存储层（`useAgentStorage`）收口，索引与详情文件分离并带严格写入校验。

**亮点**：单一持久化收口、索引/详情分离与半加载写入防护、`agentCallable` 方法注册、导入导出迁移兼容。

---

### 12. [user-profile-manager](../../src/tools/user-profile-manager/ARCHITECTURE.md) — 用户档案中心

管理用户在对话中扮演的角色与身份档案（User Profile），是 Chat 体系与智能体体系的公共基础数据模块。档案数据由本模块持有并持久化，`llm-chat`、`agent-manager`、`sub-agent`、标题栏等消费方通过统一 Store 接口读取。

**亮点**：`{{user}}` 宏替换与全局默认档案、头像资产与历史管理、消息样式与正则管道配置、分离式文件存储。

---

### 13. [sub-agent](../../src/tools/sub-agent/ARCHITECTURE.md) — 子智能体与后台任务系统

面向多智能体协同、异步长时间任务与后台长效自治运行的基础设施，与会话编排双轨解耦。支持在任务中心、标题栏胶囊和 Chat 伴生分栏实时透视子任务消息流，提供安全点追加指导与紧急叫停，并经 Tauri 后台无头 JS 运行时 Bridge 脱离前台窗口持续运行。

**亮点**：子会话与任务调度双轨、后台无头运行时 Bridge、内置基线子智能体按需释出、工具调用统一审批仲裁。

---

## 二、开发与调试工具

### 14. [llm-inspector](../../src/tools/llm-inspector/ARCHITECTURE.md) — LLM 请求代理拦截器

面向 LLM 请求的开发调试面板，提供请求捕获、筛选、详情查看和响应分析；外部代理运行时会计算并展示监听地址，支持复制地址进行联调。

**亮点**：请求/响应可视化、代理状态与监听地址联动、调试数据与业务会话解耦。

---

### 15. [api-tester](../../src/tools/api-tester/ARCHITECTURE.md) — HTTP API 测试工具

支持请求构建、变量模板、响应查看、请求历史和接口校验的 API 调试工作台。

**亮点**：预设一键填充、变量系统、请求历史、响应面板和流式响应自动检测。

---

### 16. [code-formatter](../../src/tools/code-formatter/ARCHITECTURE.md) — 代码格式化工具

基于 `FormatterCore` 的 Prettier 格式化工具。Prettier 核心和 YAML、PHP、XML 等语言插件均按需动态加载并缓存，通过启发式语言检测选择解析器，加载失败时提供 warning 回退。

**亮点**：全量按需加载、插件缓存、启发式语言检测、失败回退和零配置体验。

---

### 17. [component-tester](../../src/tools/component-tester/ARCHITECTURE.md) — 组件测试面板

内部开发调试工具，集中展示和测试 UI 组件，验证主题系统、消息系统和通用组件在不同状态下的表现。

**亮点**：Tab 分类管理、主题色板验证、消息系统测试和组件级快速回归。

---

### 18. [service-monitor](../../src/tools/service-monitor/ARCHITECTURE.md) — 工具注册中心监控

通过 `toolRegistryManager` / `ToolRegistry` 读取已注册工具的元数据、分类和方法签名，为应用内部工具提供可视化发现和调试入口。

**亮点**：自动注册、工具分类、方法签名可视化和运行时注册边界检查。

---

### 19. [git-committer](../../src/tools/git-committer/ARCHITECTURE.md) — Git 提交助手

多仓库并发的轻量级 Git 提交与版本管理工作流工具，聚焦暂存管理、AI 智能生成 Commit Message、拓扑分支泳道图谱、工作区秒级搜索与多媒体差异对比。

- **多仓库状态隔离**：通过 Edge 风格垂直仓库栏与全景看板快速切换仓库，每个仓库维护独立的打开 Tab、激活状态、会话记忆与草稿。
- **分支泳道与图谱可视化**：纯前端拓扑排序算法，动态追踪活跃泳道槽位，紧凑渲染分叉与合并流向。
- **右键菜单与安全交互**：全区域覆盖单例右键菜单，未跟踪文件显式区分物理删除与放弃修改，就地暂存/取消暂存与差异跳转。
- **AI 提交流程与个性化**：Unified Diff 增量差异提取，自动剥离 Markdown 围栏；支持仓库专属 System Prompt、首选生成语言及色盘个性化。

**亮点**：多仓库并发隔离、分支拓扑泳道、统一右键菜单体系、工作区全文与文件名快速搜索、多媒体差异对比（图像/音频/视频）和仓库级 AI 提交流程定制。

---

## 三、文件与数据处理

### 20. [dir-search](../../src/tools/dir-search/ARCHITECTURE.md) — 目录内容搜索

Rust 后端流式搜索与前端实时渲染的目录内容搜索/替换工具。基于 `ignore` 并行遍历和有界 channel 背压，支持正则、大小写、全词匹配、上下文展示、预览和单项替换。

**亮点**：资源范围安全限制、完整取消生命周期、流式结果竞态保护、列表/树形双视图、Monaco 预览和 Preserve Case 替换。

---

### 21. [aio-file-operator](../../src/tools/aio-file-operator/ARCHITECTURE.md) — 本地文件操作器

面向 Agent 的本地文件操作桥，通过 registry 暴露文件读写方法，复用通用文件命令、文档解析器和 web-canvas Diff 引擎。白名单/黑名单沙箱、审批区、大小限制、覆盖策略和审计日志共同构成安全边界。

**亮点**：Agent 可调用文件读写、双层安全策略、审批区前置校验、CRLF/LF 保持的 Diff 修改和操作审计。

---

### 22. [asset-manager](../../src/tools/asset-manager/ARCHITECTURE.md) — 中央资产管理中心

全局统一的资产管理服务，以 Rust 后端索引提供高性能查询、哈希去重和多媒体元数据提取，并为图片、视频、音频等资产提供统一入口。

**亮点**：Rust 索引、哈希去重、视频缩略图、音频波形/封面采样、无限滚动懒加载和跨工具资产复用。

---

### 23. [content-deduplicator](../../src/tools/content-deduplicator/ARCHITECTURE.md) — 内容查重工具

以 Rust 五阶段扫描漏斗处理文本文件：文件收集、尺寸分桶、快速指纹、全文规范化哈希和结果构建。支持精确副本与仅存在格式差异的规范化副本检测。

**亮点**：漏斗式过滤、BLAKE3 哈希、流式读取、进度事件和回收站安全删除。

---

### 24. [data-filter](../../src/tools/data-filter/ARCHITECTURE.md) — 数据筛选工具

面向大规模 JSON/YAML 数组的数据筛选和清洗工具，支持深层路径访问、多条件组合过滤、自定义脚本、预设和 `keepUnmatched` 结果控制。

**亮点**：lodash 深层路径取值、脚本过滤、预设系统、Agent 调用入口和未匹配项保留策略。

---

### 25. [json-formatter](../../src/tools/json-formatter/ARCHITECTURE.md) — JSON 格式化工具

支持可控展开层级的 JSON 格式化工具，逻辑、视图和注册入口分层，允许用户精确控制折叠深度和输出结构。

**亮点**：自定义递归序列化、可控展开深度、Logic/Registry 解耦。

---

### 26. [config-converter](../../src/tools/config-converter/ARCHITECTURE.md) — 配置格式转换器

采用 `Parse → JS Object → Serialize` 三阶段管道，在 JSON/YAML/TOML/INI/XML/.env 六种格式之间进行 N×N 互转。提供实时预览和批量处理两种工作模式，并对有损转换收集警告而非静默丢失信息。

**亮点**：统一中间表示、路径优先+内容嗅探、300ms 防抖预览、批处理和有损转换警告。

---

### 27. [regex-applier](../../src/tools/regex-applier/ARCHITECTURE.md) — 正则批量处理工具

前后端双引擎架构：前端 JavaScript 引擎提供实时预览，Rust 后端负责批量文件处理，并在跨引擎执行前进行兼容性检查。

**亮点**：双引擎协同、兼容性校验、规则链预设和批量处理。

---

### 28. [text-diff](../../src/tools/text-diff/ARCHITECTURE.md) — 文本对比工具

深度集成 Monaco Diff Editor，支持智能文件拖拽分配、差异查看和 Unified Diff Patch 生成。

**亮点**：企业级 Diff 编辑器、智能文件分配和统一补丁格式。

---

### 29. [directory-tree](../../src/tools/directory-tree/ARCHITECTURE.md) — 目录树可视化

基于 Rust `ignore` 引擎高性能遍历目录并返回结构化 `TreeNode`，前端通过组合式状态层进行路径/文件名、多路径和多条件二次筛选，默认过滤模式为 `gitignore`。

**亮点**：后端初筛+前端二次筛选、路径历史、文件/目录大小统计、忽略规则支持和大目录性能。

---

### 30. [directory-janitor](../../src/tools/directory-janitor/ARCHITECTURE.md) — 目录清理器

Rust 后端驱动的目录清理工具，支持 Glob 名称、年龄、大小和深度等多条件过滤，并通过回收站删除降低误操作风险。

**亮点**：高性能扫描、AND 组合过滤、删除前校验和回收站保护。

---

### 31. [symlink-mover](../../src/tools/symlink-mover/ARCHITECTURE.md) — 符号链接搬家

将文件或目录移动到新位置并创建链接，支持符号链接和硬链接两种模式，Rust 后端在执行前完成路径与目标校验。

**亮点**：双操作模式、双链接类型、前置安全校验和可逆迁移思路。

---

## 四、媒体处理工具

### 32. [ffmpeg-tools](../../src/tools/ffmpeg-tools/ARCHITECTURE.md) — FFmpeg 多媒体工作台

基于 Tokio 异步进程管理的 FFmpeg 工作台，负责参数构建、三作用域积木式参数编辑、子进程生命周期、stderr/pipe:1 结构化进度解析、时间片段裁剪与关键帧吸附；同时通过 Agent actions 支持自定义命令、串行 Pipeline 和媒体信息查询。

**亮点**：积木式参数编辑、时间裁剪关键帧吸附、流式进度解析、单文件任务防覆盖保护、串行 Pipeline 与智能码率计算。

---

### 33. [media-info-reader](../../src/tools/media-info-reader/ARCHITECTURE.md) — 媒体元数据读取

面向 AI 生成图片和通用媒体资产的元数据读取器，使用分层解析兼容 EXIF、WebUI 参数、非标准 PNG chunk、ST 角色卡和 ComfyUI 工作流。

**亮点**：三层递进解析、生成参数提取、角色卡支持和工作流提取。

---

### 34. [danmaku-player](../../src/tools/danmaku-player/ARCHITECTURE.md) — 弹幕播放器

非侵入式弹幕增强工具，支持外部播放器同步模式（双窗口 + Win32 吸附）和内置播放模式（单窗口 + 组件化集成），兼容 PotPlayer、mpv、VLC 等外部播放器。

**亮点**：窗口 Z-Order 吸附、虚拟时钟偏差校准、外部播放器适配和 GPU 合成层渲染。

---

### 35. [transcription](../../src/tools/transcription/ARCHITECTURE.md) — 多模态转写管理

以任务驱动的插件化引擎处理图片、音频、视频、PDF 和 DOCX，将多模态资产转换为可复用的文本衍生数据，供 Chat 和其他工具消费。OCR 支持本地引擎、分批处理和 PDF 纯文字模式。

**亮点**：可插拔引擎、任务级模型优先级、OCR 分批、DOCX/PDF 引擎、资产衍生数据复用和物理清理。

---

### 36. [realtime-subtitle-ocr](../../src/tools/realtime-subtitle-ocr/ARCHITECTURE.md) — 实时字幕 OCR

具备屏幕实时监控与本地离线视频双工作台的字幕提取工具。支持屏幕定时采样、Rust aHash 去重、可调图像滤镜与行内实时编辑；本地视频工作台提供 PR/达芬奇式视口控制、Konva 时间轴轨道、时间片段与关键帧吸附及双栏校验。

**亮点**：屏幕/视频双工作台并行隔离、后端图像去重、滤镜实时对比预览、离线视频时间轴视口、行内实时编辑与 SRT 导出。

---

### 37. [smart-ocr](../../src/tools/smart-ocr/ARCHITECTURE.md) — 智能 OCR

多引擎 OCR 工具，支持 Tesseract.js、Windows Native、VLMAPI 和 OCRAPI，并以智能切图处理长截图和批量任务。插件通过 manifest 声明能力，使用作业确认、结果和增量事件契约；插件注册和安装阶段还提供结构化诊断与平台产物预检。

**亮点**：多引擎插件化、空白横带切图、并发控制、作业协议、稳定贡献点、平台验证和可修复诊断。

---

### 38. [sketch-pad](../../src/tools/sketch-pad/ARCHITECTURE.md) — 画板

基于 Konva.js 矢量形状与 HTML Canvas 2D 位图手绘的轻量画板，两类图层可混合排列。支持自由笔、变换、文本编辑、图片导入、栅格化、合并、自动保存、`.aiosk` ZIP 导出和发送到 LLM Chat。

**亮点**：位图/对象 Canvas 分离、10 种撤销类型、图层混合模式、增量保存和断链占位图。

---

## 五、知识整合与外部连接

### 39. [web-canvas](../../src/tools/web-canvas/ARCHITECTURE.md) — Agent 协作画布

采用 Physical-First 架构，编辑直接作用于磁盘，Git 负责版本追踪。内置 Search/Replace Diff 引擎，使用多级降级匹配策略处理 Agent 文件修改。

**亮点**：无影子文件、Git 原生版本控制、Bigram Dice 模糊匹配和 Diff 可审阅。

---

### 40. [git-analyzer](../../src/tools/git-analyzer/ARCHITECTURE.md) — Git 仓库分析

基于 git2-rs 的原生 Git 分析工具，流式加载提交、分支和仓库统计信息，并将分析结果交给前端格式化展示。

**亮点**：libgit2 性能、流式分批推送、分支加载回退保护和积木式格式化信息生成。

---

### 41. [web-distillery](../../src/tools/web-distillery/ARCHITECTURE.md) — 网页蒸馏室

多模式网页内容提取工具，提供快速、Smart 和交互式三层蒸馏模式，并以本地 Axum 代理与浏览器注入能力处理同源、Cookie、指纹和交互采集问题。

**亮点**：分层蒸馏、配方/规则管理、身份与 Cookie 工作台、实时预览和本地代理。

---

### 42. [vcp-connector](../../src/tools/vcp-connector/ARCHITECTURE.md) — VCP 连接器

VCP 运行时桌面连接工具，分别管理 Observer 消息监控和分布式工具节点，支持 AIO → VCP 暴露工具、VCP → AIO 桥接工具及异步任务执行。分布式协议通过 `requestId` 维护 `AbortController`，支持 `cancel_tool`，断线时清理在途调用。

**亮点**：双 WebSocket、虚拟滚动监控、工具双向共享、审批系统、分布式超时保护、主动取消和断线清理。

---

### 43. [color-picker](../../src/tools/color-picker/ARCHITECTURE.md) — 智能取色器与批量色彩整理

多算法图片颜色分析工具与批量色彩整理工作台。单图支持 Quantize、Vibrant、Average 三种算法并行提取；批量整理下沉至 Rust 后端并行计算，前端支持 1~4 档动态亮度阈值调节、H/S 圆盘欧氏距离最近邻色系分类、预设快照管理与一键归档。

**亮点**：三算法并行取色、Rust 后端多线程批量采样、H/S 圆盘分类编辑器、1~4 档动态亮度阈值与批量结果归档。

---

### 44. [retrieval](../../src/tools/retrieval/ARCHITECTURE.md) — 统一检索门面

纯服务注册模块，不含 UI、store 或领域实现，把 Recall（思绪）与 Knowledge（知识资料库）两个独立检索域封装为面向 Agent 的统一 `search` 工具入口。支持 `recall` / `knowledge` / `mixed` 三种模式，mixed 按域配额并行检索后以 RRF 融合排序；Knowledge 侧完整复用其授权解析链路。

**亮点**：零 UI 服务门面、三模式参数归一化与 VCP 输入容错、RRF 融合与溯源元数据、授权边界复用。

---

## 六、系统与渲染引擎

### 45. [system-pulse](../../src/tools/system-pulse/ARCHITECTURE.md) — 系统硬件监控仪表盘

推送驱动的实时硬件监控，覆盖 CPU、内存、磁盘、网络和 GPU。Rust 采集循环按采样层级推送，前端使用 RingBuffer 保存时间序列。

**亮点**：无轮询推送、分层采样、PDH/NVML 指标、RingBuffer 和可调密度展示。

---

### 46. [rich-text-renderer](../../src/tools/rich-text-renderer/ARCHITECTURE.md) — 富文本渲染引擎

面向 LLM 内容的交互式渲染引擎，以自研 V2 解析器融合 Markdown/HTML，提供稳定区/待定区流式更新、Patch 节流、样式隔离、Agent 资产解析、CDN 本地化和 VCP 可视化。

**亮点**：流式零闪烁、内容样式隔离、Patch 更新、嵌入式 SPA 沙箱和独立测试工作台。

---

### 47. [window-automator](../../src/tools/window-automator/ARCHITECTURE.md) — 窗口自动化助手

面向窗口化轻量重复操作的可视化动作流执行器：将点击、按键、延时、取色/OCR 判断、跳转与子流程调用编排为步骤序列并绑定目标窗口反复执行。默认通过窗口消息后台注入输入（不抢焦点），提供像素/百分比/中心坐标系三套定位体系，OCR 步骤复用 `smart-ocr` 引擎执行。

**亮点**：后台优先输入注入、三套坐标系统、带控制流的动作流（goto/counter/分支/子流程）、smart-ocr 引擎复用。

---

### 48. [wallpaper-detector](../../src/tools/wallpaper-detector/ARCHITECTURE.md) — 壁纸探测器

轻量系统工具，解决「系统当前壁纸是哪张图、存在哪里」的问题。按显示器探测壁纸绝对路径，支持卡片内预览、全局图片查看器、一键定位并高亮文件与复制路径；Windows 走 `IDesktopWallpaper` COM 接口返回幻灯片当前实际显示的图，macOS/Linux 按桌面环境能力返回。纯 UI 工具，无持久化状态。

**亮点**：多屏独立壁纸探测、跨平台探测矩阵、预览与一键定位、实时探测零持久化。

---

## 附录：架构文档索引

|   # | 工具                  | 架构文档                                       | 一句话定位                        |
| --: | --------------------- | ---------------------------------------------- | --------------------------------- |
|   1 | llm-chat              | [`src/tools/llm-chat/ARCHITECTURE.md`](../../src/tools/llm-chat/ARCHITECTURE.md) | 树状会话与统一上下文管道 |
|   2 | media-generator       | [`src/tools/media-generator/ARCHITECTURE.md`](../../src/tools/media-generator/ARCHITECTURE.md) | 多模态媒体生成工作站 |
|   3 | tool-calling          | [`src/tools/tool-calling/ARCHITECTURE.md`](../../src/tools/tool-calling/ARCHITECTURE.md) | Agent 工具发现与执行基础设施 |
|   4 | knowledge-base        | [`src/tools/knowledge-base/ARCHITECTURE.md`](../../src/tools/knowledge-base/ARCHITECTURE.md) | Knowledge 文档资料域 |
|   5 | recall                | [`src/tools/recall/ARCHITECTURE.md`](../../src/tools/recall/ARCHITECTURE.md) | Recall 完整语义条目与检索管线 |
|   6 | embedding-playground  | [`src/tools/embedding-playground/ARCHITECTURE.md`](../../src/tools/embedding-playground/ARCHITECTURE.md) | Embedding 评估与检索模拟 |
|   7 | token-calculator      | [`src/tools/token-calculator/ARCHITECTURE.md`](../../src/tools/token-calculator/ARCHITECTURE.md) | Worker 化 Token 与图片估算 |
|   8 | skill-manager         | [`src/tools/skill-manager/ARCHITECTURE.md`](../../src/tools/skill-manager/ARCHITECTURE.md) | Agent Skills 运行时桥接 |
|   9 | translator            | [`src/tools/translator/ARCHITECTURE.md`](../../src/tools/translator/ARCHITECTURE.md) | 多渠道流式翻译 |
|  10 | st-worldbook-manager  | [`src/tools/st-worldbook-manager/ARCHITECTURE.md`](../../src/tools/st-worldbook-manager/ARCHITECTURE.md) | 独立 ST 世界书管理 |
|  11 | agent-manager         | [`src/tools/agent-manager/ARCHITECTURE.md`](../../src/tools/agent-manager/ARCHITECTURE.md) | 智能体全生命周期与存储收口 |
|  12 | user-profile-manager  | [`src/tools/user-profile-manager/ARCHITECTURE.md`](../../src/tools/user-profile-manager/ARCHITECTURE.md) | 用户身份档案公共数据模块 |
|  13 | sub-agent             | [`src/tools/sub-agent/ARCHITECTURE.md`](../../src/tools/sub-agent/ARCHITECTURE.md) | 子智能体协同与后台任务 |
|  14 | llm-inspector         | [`src/tools/llm-inspector/ARCHITECTURE.md`](../../src/tools/llm-inspector/ARCHITECTURE.md) | LLM 请求调试与拦截 |
|  15 | api-tester            | [`src/tools/api-tester/ARCHITECTURE.md`](../../src/tools/api-tester/ARCHITECTURE.md) | HTTP API 请求调试 |
|  16 | code-formatter        | [`src/tools/code-formatter/ARCHITECTURE.md`](../../src/tools/code-formatter/ARCHITECTURE.md) | Prettier 格式化与插件加载 |
|  17 | component-tester      | [`src/tools/component-tester/ARCHITECTURE.md`](../../src/tools/component-tester/ARCHITECTURE.md) | UI 组件调试面板 |
|  18 | service-monitor       | [`src/tools/service-monitor/ARCHITECTURE.md`](../../src/tools/service-monitor/ARCHITECTURE.md) | 工具注册中心可视化监控 |
|  19 | git-committer         | [`src/tools/git-committer/ARCHITECTURE.md`](../../src/tools/git-committer/ARCHITECTURE.md) | 多仓库 Git 提交工作流 |
|  20 | dir-search            | [`src/tools/dir-search/ARCHITECTURE.md`](../../src/tools/dir-search/ARCHITECTURE.md) | 流式目录搜索与安全取消 |
|  21 | aio-file-operator     | [`src/tools/aio-file-operator/ARCHITECTURE.md`](../../src/tools/aio-file-operator/ARCHITECTURE.md) | Agent 文件读写与安全沙箱 |
|  22 | asset-manager         | [`src/tools/asset-manager/ARCHITECTURE.md`](../../src/tools/asset-manager/ARCHITECTURE.md) | 全局资产索引与去重 |
|  23 | content-deduplicator  | [`src/tools/content-deduplicator/ARCHITECTURE.md`](../../src/tools/content-deduplicator/ARCHITECTURE.md) | 文本文件查重 |
|  24 | data-filter           | [`src/tools/data-filter/ARCHITECTURE.md`](../../src/tools/data-filter/ARCHITECTURE.md) | JSON/YAML 数据筛选 |
|  25 | json-formatter        | [`src/tools/json-formatter/ARCHITECTURE.md`](../../src/tools/json-formatter/ARCHITECTURE.md) | 可控展开的 JSON 格式化 |
|  26 | config-converter      | [`src/tools/config-converter/ARCHITECTURE.md`](../../src/tools/config-converter/ARCHITECTURE.md) | 六种格式 N×N 转换 |
|  27 | regex-applier         | [`src/tools/regex-applier/ARCHITECTURE.md`](../../src/tools/regex-applier/ARCHITECTURE.md) | 前后端双引擎正则处理 |
|  28 | text-diff             | [`src/tools/text-diff/ARCHITECTURE.md`](../../src/tools/text-diff/ARCHITECTURE.md) | Monaco Diff 与 Unified Patch |
|  29 | directory-tree        | [`src/tools/directory-tree/ARCHITECTURE.md`](../../src/tools/directory-tree/ARCHITECTURE.md) | Rust 遍历与前端目录树 |
|  30 | directory-janitor     | [`src/tools/directory-janitor/ARCHITECTURE.md`](../../src/tools/directory-janitor/ARCHITECTURE.md) | 条件扫描与回收站清理 |
|  31 | symlink-mover         | [`src/tools/symlink-mover/ARCHITECTURE.md`](../../src/tools/symlink-mover/ARCHITECTURE.md) | 符号/硬链接搬家 |
|  32 | ffmpeg-tools          | [`src/tools/ffmpeg-tools/ARCHITECTURE.md`](../../src/tools/ffmpeg-tools/ARCHITECTURE.md) | FFmpeg 异步多媒体工作台 |
|  33 | media-info-reader     | [`src/tools/media-info-reader/ARCHITECTURE.md`](../../src/tools/media-info-reader/ARCHITECTURE.md) | 媒体元数据与生成参数解析 |
|  34 | danmaku-player        | [`src/tools/danmaku-player/ARCHITECTURE.md`](../../src/tools/danmaku-player/ARCHITECTURE.md) | 弹幕增强与外部播放器同步 |
|  35 | transcription         | [`src/tools/transcription/ARCHITECTURE.md`](../../src/tools/transcription/ARCHITECTURE.md) | 多模态转写管理 |
|  36 | realtime-subtitle-ocr | [`src/tools/realtime-subtitle-ocr/ARCHITECTURE.md`](../../src/tools/realtime-subtitle-ocr/ARCHITECTURE.md) | 屏幕实时监控与离线视频双工作台 |
|  37 | smart-ocr             | [`src/tools/smart-ocr/ARCHITECTURE.md`](../../src/tools/smart-ocr/ARCHITECTURE.md) | 多引擎 OCR 调度层 |
|  38 | sketch-pad            | [`src/tools/sketch-pad/ARCHITECTURE.md`](../../src/tools/sketch-pad/ARCHITECTURE.md) | 矢量/位图画板 |
|  39 | web-canvas            | [`src/tools/web-canvas/ARCHITECTURE.md`](../../src/tools/web-canvas/ARCHITECTURE.md) | Agent 协作画布与 Physical-First 编辑 |
|  40 | git-analyzer          | [`src/tools/git-analyzer/ARCHITECTURE.md`](../../src/tools/git-analyzer/ARCHITECTURE.md) | Git 仓库分析 |
|  41 | web-distillery        | [`src/tools/web-distillery/ARCHITECTURE.md`](../../src/tools/web-distillery/ARCHITECTURE.md) | 网页内容提取与蒸馏 |
|  42 | vcp-connector         | [`src/tools/vcp-connector/ARCHITECTURE.md`](../../src/tools/vcp-connector/ARCHITECTURE.md) | VCP 连接器 |
|  43 | color-picker          | [`src/tools/color-picker/ARCHITECTURE.md`](../../src/tools/color-picker/ARCHITECTURE.md) | 三算法并行取色与批量色彩整理 |
|  44 | retrieval             | [`src/tools/retrieval/ARCHITECTURE.md`](../../src/tools/retrieval/ARCHITECTURE.md) | Recall/Knowledge 统一检索门面 |
|  45 | system-pulse          | [`src/tools/system-pulse/ARCHITECTURE.md`](../../src/tools/system-pulse/ARCHITECTURE.md) | 推送式系统硬件监控 |
|  46 | rich-text-renderer    | [`src/tools/rich-text-renderer/ARCHITECTURE.md`](../../src/tools/rich-text-renderer/ARCHITECTURE.md) | 流式富文本渲染 |
|  47 | window-automator      | [`src/tools/window-automator/ARCHITECTURE.md`](../../src/tools/window-automator/ARCHITECTURE.md) | 窗口动作流自动化执行 |
|  48 | wallpaper-detector    | [`src/tools/wallpaper-detector/ARCHITECTURE.md`](../../src/tools/wallpaper-detector/ARCHITECTURE.md) | 多屏壁纸探测与定位 |

---

> 📅 最后更新：2026-10-18（复核基准 `c1fb114ec`）
>
> 📁 文档来源：`src/tools/*/ARCHITECTURE.md`（当前 48 篇，48/48 目录全覆盖）
