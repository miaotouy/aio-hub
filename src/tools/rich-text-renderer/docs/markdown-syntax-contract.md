# Markdown 语法与项目扩展契约

> 更新：2026-10-26
>
> 适用范围：V2 `CustomParser.parse()` 的静态解析，以及与渲染层的交接。流式完成态沿用相同契约；输入尚未闭合时允许暂时展示待定内容或等待安全切点。

## 标准语法和对照配置

CommonMark 使用仓库固定的 0.31.2 官方用例。报告同时保存官方 HTML、markdown-it `commonmark` preset 的默认输出、启用 `breaks: true` 的项目配置输出，以及 V2 原始 AST。兼容进度按具体语义差异复核。

- 段落内单次回车产生可见换行，空白行分隔段落。
- 文本末尾回车是否产生尾部空白行仍待主人确认，现有解析行为保留。报告仅在最终顶层段落多出单个 `br`、其余结构和文本完全一致时归入“末尾换行待确认”。
- 代码文本、链接属性、列表起始编号、紧凑/宽松列表的段落包装和嵌套结构严格比较。
- 图片节点的空 `title` 按 `ImageNode` 的属性透传行为视为未设置；非空标题继续参与比较。链接标题单独保留。

GFM 扩展的参考配置为 `commonmark` + `breaks: true` + `table` / `strikethrough` 规则。任务列表使用独立编写的 GFM 预期；当前已安装的 markdown-it 配置尚未接入任务列表插件。扩展语料使用项目自编示例，预期独立于两套解析器。

参考规范：[Tables](https://github.github.com/gfm/#tables-extension-)、[Strikethrough](https://github.github.com/gfm/#strikethrough-extension-)、[Task list items](https://github.github.com/gfm/#task-list-items-extension-)；配置说明见 [markdown-it](https://github.com/markdown-it/markdown-it)。

### 本轮覆盖的 GFM 行为

- 表格的表头和分隔行列数一致；分隔格由连字符及可选的左右冒号组成。无效分隔行和宽度不一致的表头按正文解析。
- 空单元格保留列位置；数据行缺列时补空，多列时按表头宽度截断。最后一格在省略尾部管道符或末尾回车时仍保存。
- 数据行支持开头的加粗等行内格式和行内 HTML。空白行或新的块级结构结束表格。
- 普通单元格中的 `\|` 及实体生成的 `|` 保留为字面内容；实体生成的空格保留。实体生成的连字符参与正文显示。
- 双波浪线删除线支持内部强调。

### 保留的兼容差异

- **任务列表**：V2 当前将 `[ ]` / `[x]` 留作列表正文。目标行为为只读复选框并保留选中状态，相关预期保存在 `task-list` 用例。
- **代码单元格中的转义管道符**：`table-code-pipe` 暴露了代码内容中多余的反斜杠，预期显示为普通管道符。修复需要同时照顾表格分列与行内代码的字面量规则。
- 更广泛的 GFM 语法和复杂嵌套继续通过具体用例逐项推进，本轮结果描述已列入语料的行为范围。

## 数学公式

数学节点属于项目扩展，按 LaTeX 源码语义保存，公式排版由 KaTeX 组件负责。

| 输入                 | 解析契约                          |
| -------------------- | --------------------------------- |
| `$x+1$`              | 行内 `katex_inline`，保存公式源码 |
| `$$x+1$$`            | 块级 `katex_block`，保存公式源码  |
| `\(x+1\)`            | 兼容简单 MathJax 行内形式         |
| 未闭合的单美元标记   | 保留正文，后续输入可补全          |
| 行内代码中的公式标记 | 保留字面量                        |

Tokenizer 还支持受路径特征、长度和 LaTeX 关键词限制的 `\[...\]` 兼容形式；这些启发式边界继续沿用当前实现，后续扩展单独补充语料。涉及货币、复杂反斜杠或嵌套分隔符时，按实际输入复核。

CommonMark 中反斜杠可能表达普通标点转义。官方报告保持严格比较，数学节点缺少标准对应时保存原始 AST 并列入适配器待支持；项目扩展报告显式使用数学语义映射。两类统计各自保留其来源。

## 思考块

- 默认标签集合为 `think`，调用方可通过配置传入其他标签与展示规则。
- `<think>check **carefully**</think>` 产生 `llm_think`；节点保留标签、原文及内部 Markdown 结构。
- 未闭合标签保留已收到的内容，并以 `isThinking` 表示进行中状态；闭合后完成态更新。
- 行内代码中的思考标签保持字面量。自定义 HTML 的其他标签按现有 HTML 解析路径处理。
- 比较使用标签、原文、思考状态和子内容。名称、折叠偏好等展示配置由调用方和节点组件负责。

## VCP

完整 `<<<[TOOL_REQUEST]>>>` … `<<<[END_TOOL_REQUEST]>>>` 请求按展示节点解析，保存原文、闭合状态、工具名、命令和参数。行内代码中的标记保持字面量，围栏示例和角色块的交界沿用已有 VCP 专项测试。

渲染侧的模糊识别服务于内容展示；工具执行继续使用严格协议解析。执行边界和协议格式以 [tool-calling 架构](../../tool-calling/ARCHITECTURE.md)及 [vcp-connector 架构](../../vcp-connector/ARCHITECTURE.md)为准。

本轮对照使用默认 V2 配置和完整请求，扩展语料中的 `vcp-request` 保护展示数据交接。结果汇总、角色块、日记与模糊围栏继续由既有专项测试覆盖。

## 附件引用

- 裸引用 `【file::id】` 在 AST 中保留为正文，`TextNode` 根据渲染上下文解析附件。引用缺失时继续显示原文。
- `![preview](【file::pic】)` 保存图片目标引用，交由图片节点解析。
- 代码中的附件标记保持字面量。
- 同一引用可重复使用，附件晚于文本到达时由现有响应式渲染更新。

解析报告保护引用文本、图片目标和代码边界；附件解析、预览操作与流式资源到达的行为由 `TextNode` 既有组件测试覆盖。

## 报告和维护入口

```powershell
bun run rich-text:commonmark
bun run rich-text:check
bun run test:run -- scripts/rich-text/commonmark.test.ts scripts/rich-text/extensions.test.ts src/tools/rich-text-renderer/core/__tests__/StreamProcessorV2.markdown.test.ts
```

默认输出 `.tmp/rich-text-commonmark/report.{json,md}` 与 `extensions.{json,md}`。前者保留全部官方用例及分项分类，后者保留 GFM / 项目自编预期和参考库支持情况。已知差异保留在报告语料，已修复行为纳入相关测试。
