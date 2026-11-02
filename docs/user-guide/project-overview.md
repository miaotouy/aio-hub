# 项目概览

AIO Hub 是一款跨平台桌面 AI 工作台，将对话、资料检索、媒体创作、文件处理和开发工具放在同一个工作区中。你可以直接使用单个工具，也可以通过智能体、技能和工具调用组合工作流。

## 可以用它做什么

| 任务               | 相关能力                                                   |
| ------------------ | ---------------------------------------------------------- |
| 长期对话和角色创作 | 智能体与用户档案、树状分支、世界书、动态宏、上下文压缩     |
| 整理资料并辅助问答 | 网页搜索与正文提取、OCR、多模态转写、知识库检索            |
| 生成和管理媒体     | 图片、视频、音频等生成任务，资产预览、来源追踪和缩略图管理 |
| 处理代码与文件     | 格式化、配置转换、文本差异、目录搜索、文件查重与整理       |
| 开发和调试         | API 测试、模型请求检查、Git 分析与提交、Embedding 测试     |
| 扩展自动化能力     | Agent Skills、工具调用审批、VCP 连接器、插件和窗口自动化   |

完整入口见 [工具总览](./tools/index.md)。

## 对话与上下文

[LLM 对话](./tools/llm-chat/index.md) 支持多会话和树状历史，可以从已有消息创建分支，切换不同回答路径。智能体保存角色设定、模型参数、私有资产和世界书；用户档案保存你在对话中使用的身份。

发送消息前，[上下文管道](./tools/llm-chat/context-pipeline/index.md) 会按配置组合消息、世界书、宏、正则规则和知识库检索结果。你可以查看最终请求的内容和 Token 分布，并按需要配置 [压缩策略](./tools/llm-chat/context-pipeline/context-compression.md)。

使用 SillyTavern 素材时，可以参考 [兼容性说明](./tools/llm-chat/agents/st-compatibility.md)，导入角色卡、世界书、快捷操作和正则等内容。

## 搜索、提取与知识整理

[网页蒸馏室](./tools/web-distillery.md) 支持网页搜索，以及快速模式、浏览器智能模式、Jina Reader 和 DeepSeek Fetch 等正文提取方式。对固定站点还可以编辑配方和身份信息。

图片文字使用 [智能 OCR](./tools/smart-ocr/index.md)，屏幕字幕和本地视频使用 [实时字幕 OCR](./tools/realtime-subtitle-ocr/index.md)，音视频和 PDF 等内容可以通过 [多模态转写](./tools/transcription.md) 处理。整理后的资料可导入 [知识资料库](./tools/knowledge-base/index.md)，建立索引后用于智能体检索。

## 媒体创作与资产

[媒体生成中心](./tools/media-generator/index.md) 按模型能力提供生成参数、输入内容和任务管理。生成结果和其他工具导入的文件统一交给 [资产管理器](./tools/asset-manager/index.md) 浏览、筛选和追溯来源。

资产管理器支持图片、音视频及文档预览。文档查看器可阅读 PDF、DOCX、WPS 和 OpenDocument 文本文档；部分 WPS 格式需要配置本机文档转换程序。视频压缩和转码等任务使用 [FFmpeg 工具](./tools/ffmpeg-tools.md)。

## 工具调用与扩展

智能体可通过 [工具调用](./tools/llm-chat/tool-calling/index.md) 使用已启用的服务，并按 [审批策略](./tools/llm-chat/tool-calling/approval-strategy.md) 确认操作。技能管理负责安装和启用 Agent Skills，VCP 连接器用于连接外部 VCP 运行时。

插件系统提供 JS、Native 和 Sidecar 三种扩展方式。希望自行开发工具时，可从 [工具注册指南](../guide/tool-registry-guide.md) 开始。

## 工作区与外观

工具、侧边栏和支持分离的面板可以组成适合当前任务的布局。独立窗口适合在多屏之间同时查看聊天、资料和调试工具，具体操作见 [工作区基础](./workspace-basics.md)。

外观设置提供明暗主题、主题色、壁纸、毛玻璃效果和 CSS 样式覆盖，见 [外观与壁纸](./settings/appearance.md)。

## 平台与数据

桌面端支持 Windows、macOS 和 Linux；安装格式和依赖以 [安装指南](./installation.md) 及对应发布附件为准。Android / iOS 的使用情况见 [移动端概述](./mobile/index.md)。

配置和资产保存在本地。访问远程模型、云端 OCR、网页提取等服务时，请求会携带完成任务所需的输入；调用范围取决于你选择的渠道和工具。连接本地模型服务时，可以使用本机模型完成对话。

迁移机器或进行较大版本升级前，可通过 [通用设置](./settings/general-startup.md) 导出配置，并按需要备份资产和聊天数据。

## 安装后的推荐顺序

1. 按 [快速开始](./getting-started.md) 添加模型渠道并完成第一次对话。
2. 在 [工具总览](./tools/index.md) 中选择当前任务需要的工具。
3. 根据需要创建智能体、导入资料或配置生成模型。
4. 在 [关于与许可](./settings/about.md) 中选择更新通道、检查更新和查看版本说明。

遇到问题时可先查看 [故障排除](./troubleshooting.md)，再通过 GitHub Issues 提供复现步骤和相关日志。
