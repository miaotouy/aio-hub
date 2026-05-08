# 宏参考手册 (Macro Reference)

本页面列出了 LLM Chat 中所有可用的内置宏及其详细说明。

## 1. 核心上下文宏

用于获取当前会话的基本信息。

| 宏名称                   | 说明                       | 示例             |
| :----------------------- | :------------------------- | :--------------- |
| `{{user}}`               | 当前用户档案的名称         | `你好，{{user}}` |
| `{{char}}` / `{{agent}}` | 当前 Agent 的名称          | `我是{{char}}`   |
| `{{persona}}`            | 当前用户档案的完整描述内容 | -                |
| `{{description}}`        | Agent 的详细描述信息       | -                |
| `{{input}}`              | 用户当前输入的内容         | -                |
| `{{lastMessage}}`        | 会话中的最后一条消息内容   | -                |
| `{{lastUserMessage}}`    | 最后一条用户消息内容       | -                |
| `{{lastCharMessage}}`    | 最后一条助手消息内容       | -                |

## 2. 时间与日期宏

所有时间宏都自动感知 Agent 的[虚拟时间线](../agents/virtual-timeline)配置。

### 标准格式

- `{{time}}`: 12小时制时间 (如 `10:30 PM`)
- `{{time24}}`: 24小时制时间 (如 `22:30`)
- `{{date}}`: 英文日期 (如 `May 8, 2026`)
- `{{date_ymd}}`: ISO 日期 (如 `2026-05-08`)
- `{{datetime}}`: 完整日期时间 (如 `2026-05-08 22:30:00`)
- `{{weekday}}`: 英文星期 (如 `Friday`)

### 中文与本地化格式

- `{{date_cn}}`: `2026年5月8日`
- `{{datetime_cn}}`: `2026年5月8日 星期五 晚上10点30分`
- `{{weekday_cn}}`: `星期五`
- `{{datetime_format::pattern}}`: 自定义格式 (如 `{{datetime_format::YYYY/MM/DD}}`)
- `{{datetime_locale::ja-JP}}`: 日本语本地化格式

### 古风格式

- `{{date_cn_ancient}}`: 农历/干支 (如 `乙巳年（蛇年）十月十八`)
- `{{time_cn_ancient}}`: 时辰刻数 (如 `亥时一刻`)
- `{{shichen}}`: 仅时辰名称 (如 `亥时`)

## 3. 模型元数据宏

获取当前执行请求的模型信息。

| 宏名称            | 说明         | 示例                  |
| :---------------- | :----------- | :-------------------- |
| `{{modelId}}`     | 完整模型 ID  | `openai:gpt-4o`       |
| `{{modelName}}`   | 模型显示名称 | `GPT-4o`              |
| `{{profileName}}` | 服务渠道名称 | `My OpenAI`           |
| `{{provider}}`    | 提供商类型   | `openai`, `anthropic` |

## 4. 功能性宏

提供逻辑处理与文本操作。

- `{{random::opt1::opt2}}`: 随机选择。示例：`{{random::高冷::热情::神秘}}`
- `{{pick::A::B}}`: 基于会话 ID 的稳定选择（同一会话结果始终固定）。
- `{{roll::NdM}}`: 掷骰子。示例：`{{roll::1d100}}`
- `{{randomInt::min::max}}`: 生成指定范围内的随机整数。
- `{{repeat::text::n}}`: 重复文本 N 次。
- `{{newline}}`: 插入一个硬换行符。
- `{{trim}}`: 特殊宏，移除其前后的所有空白和换行（常用于保持模板整洁）。

## 5. 变量操作宏

变量允许你在上下文构建过程中传递状态。详见[变量系统详解](./session-variables)。

| 宏名称                   | 说明                       | 阶段        |
| :----------------------- | :------------------------- | :---------- |
| `{{setvar::name::val}}`  | 设置临时局部变量           | PRE_PROCESS |
| `{{getvar::name}}`       | 读取临时局部变量值         | SUBSTITUTE  |
| `{{incvar::name}}`       | 变量自增 1                 | PRE_PROCESS |
| `{{decvar::name}}`       | 变量自减 1                 | PRE_PROCESS |
| `{{setglobalvar::k::v}}` | 设置全局变量（进程内有效） | PRE_PROCESS |
| `{{getglobalvar::k}}`    | 读取全局变量值             | SUBSTITUTE  |

## 6. 资产与工具宏

- `{{assets::groupId}}`: 列出 Agent 的可用资产。可选参数为分组 ID。
- `{{tools::id1::id2}}`: 注入工具定义。支持手动指定工具 ID 列表。
- `{{tool_usage}}`: 注入当前工具调用协议的使用说明（如 VCP 协议）。
- `{{tool_context}}`: 注入已启用工具/插件的实时运行时上下文。
- `{{visual_guideline}}`: 注入 Agent 配置的视觉化输出指南。
- `{{cssvar::--name}}`: 获取当前主题下 CSS 变量的实际值（如颜色代码）。

## 7. 系统信息宏

获取运行环境信息。

- `{{os}}`: 操作系统名称 (如 `Windows_NT`)
- `{{platform}}`: 运行平台 (如 `win32`)
- `{{arch}}`: CPU 架构 (如 `x86_64`)
- `{{locale}}`: 系统语言环境 (如 `zh-CN`)
