# 会话变量处理器 (`variable-processor`)

源码：[`variable-processor.ts`](../../../core/context-processors/variable-processor.ts)

## 基本信息

| 字段       | 值                             |
| ---------- | ------------------------------ |
| 处理器 ID  | `primary:variable-processor`   |
| 显示名称   | 会话变量处理器                 |
| 默认优先级 | `500`                          |
| 默认启用   | 是                             |
| 管道位置   | 知识库替换之后，Token 限制之前 |

## 职责

会话变量处理器解析消息中的 `<svar>` 标签，维护变量状态快照，并执行 `$[...]` 内置替换。它让角色卡或预设能够在上下文构建时进行轻量状态计算，例如数值增减、状态展示和压缩节点快照延续。

## 输入

- `context.messages`：当前消息列表。
- `context.agentConfig.variableConfig`：变量系统启用状态和变量定义。
- 消息正文中的 `<svar ... />` 标签。
- 消息正文中的 `$[...]` 替换符。
- 消息元数据中的 `sessionVariableSnapshot`。

## 输出

- 对含 `<svar>` 的消息写入或更新 `message.metadata.sessionVariableSnapshot`。
- 对压缩节点写入当前状态快照，保证后续从压缩节点恢复变量状态。
- 替换消息正文中的 `$[...]`。
- 在 `context.logs` 中记录变量变更次数。

## `<svar>` 标签

基础格式：

```html
<svar name="path.to.var" op="+" value="10" />
```

字段说明：

| 字段            | 说明                                  |
| --------------- | ------------------------------------- |
| `name` / `path` | 变量路径，支持点号路径                |
| `op`            | 操作符，默认 `=`                      |
| `value`         | 操作值，支持数字和简单 JSON 对象/数组 |

支持操作：

- `=` / `set`
- `+` / `add`
- `-` / `sub`
- `*`
- `/`

变量定义中的 `min`、`max` 会对数字结果做边界裁剪。

## `$[...]` 替换

- `$[path.to.var]`：替换为当前变量值。
- `$[svars::json]`：输出所有非隐藏变量的 JSON。
- `$[svars::table]`：输出 Markdown 表格。
- `$[svars::list]`：输出列表。

## 状态恢复流程

1. 先根据变量定义初始化默认值，并把可转数字的初始值转成数字。
2. 从消息列表末尾向前寻找最近的 `sessionVariableSnapshot`。
3. 从快照后一条消息开始继续应用 `<svar>` 变更。
4. 对每条处理过的字符串消息执行 `$[...]` 替换。

## 维护注意事项

- `SVAR_REGEX` 和 `ATTR_REGEX` 是轻量解析器，不支持复杂 HTML 属性值；需要复杂值时优先使用简单 JSON 且避免空白。
- 处理器会直接修改消息正文中的 `$[...]`，但不会删除 `<svar>` 标签本身。是否隐藏标签由上游内容设计或正则规则负责。
- 变量替换发生在 Token 限制前，确保替换后的变量展示内容会被计入预算。

