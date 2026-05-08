# <LIcon name="Settings2" size="28" /> 聊天设置概览

LLM Chat 提供了极其深度的定制化能力。通过全局设置，你可以精细控制从消息渲染性能到附件转写策略的每一个细节。

## 设置入口

点击聊天界面右上角的 **<LIcon name="Settings2" size="18" /> (设置)** 按钮即可打开对话框。

## 配置分区

| 分区                                                      | 说明                                                       |
| :-------------------------------------------------------- | :--------------------------------------------------------- |
| **<LIcon name="Bot" size="16" /> 通用设置**               | 默认模型选择等基础兜底配置。                               |
| **<LIcon name="Settings2" size="16" /> 界面偏好**         | 字体、间距、自动滚动、悬浮窗行为及 UI 元素可见性。         |
| **<LIcon name="Zap" size="16" /> 渲染设置**               | 渲染器版本、代码引擎、节流平滑、安全护栏及 HTML 预览控制。 |
| **<LIcon name="MessageSquareMore" size="16" /> 消息管理** | 删除消息、会话或清空内容时的二次确认逻辑。                 |
| **<LIcon name="Keyboard" size="16" /> 快捷键**            | 发送键绑定及高级关系图操作修饰键配置。                     |
| **<LIcon name="PenTool" size="16" /> 话题命名**           | 会话标题自动生成的触发阈值、提示词与模型配置。             |
| **<LIcon name="Languages" size="16" /> 翻译助手**         | 翻译模型、常用语言列表及提示词策略。                       |
| **<LIcon name="FileText" size="16" /> 附件转写**          | 图片、音视频及文档的自动化转录、压缩与切图策略。           |
| **<LIcon name="Regex" size="16" /> 文本处理**             | HTML 自动转 MD、全局正则替换规则与绑定模式。               |
| **<LIcon name="Library" size="16" /> 知识库设置**         | Embedding 模型信息、向量缓存与检索缓存管理。               |
| **<LIcon name="BookMarked" size="16" /> 世界书**          | 全局关联世界书、递归扫描深度与条目管理。                   |
| **<LIcon name="Zap" size="16" /> 快捷操作**               | 全局快捷操作组关联与操作库管理。                           |
| **<LIcon name="Palette" size="16" /> 样式设置**           | 全局消息 Markdown 样式（CSS）自定义。                      |
| **<LIcon name="Network" size="16" /> 上下文管道**         | 编排用于构建请求上下文的处理器系列。                       |
| **<LIcon name="Globe" size="16" /> 请求设置**             | 超时、重试次数、指数退避模式及增量自动保存。               |
| **<LIcon name="TerminalSquare" size="16" /> 开发者选项**  | 调试模式开关与强制原生缩放等高级控制。                     |

## 配置层级与优先级

系统遵循 **“就近原则”**，优先级从高到低依次为：

1.  **会话临时覆盖**: 在聊天顶部模型选择器或临时参数中进行的修改。
2.  **智能体 (Agent) 配置**: 在 [Agent 编辑器](../agents/editor-guide) 中定义的特定规则。
3.  **用户档案 (User Profile)**: 关联到当前档案的特定设置。
4.  **全局设置**: 本章节介绍的通用配置，作为所有操作的兜底。

---

### 详细指南

- [通用设置](./general)
- [界面偏好](./ui-preferences)
- [渲染设置](./rendering)
- [消息管理](./message-management)
- [快捷键](./shortcuts)
- [话题命名](./topic-naming)
- [翻译助手](./translation)
- [附件转写](./transcription)
- [文本处理](./text-processing)
- [知识库设置](./knowledge-base)
- [世界书](./worldbook)
- [快捷操作](./quick-actions)
- [样式设置](./styling)
- [上下文管道](./context-pipeline)
- [请求设置](./request)
- [开发者选项](./developer)
