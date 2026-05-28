# 世界书处理器 (`worldbook-processor`)

源码：[`worldbook-processor.ts`](../../../core/context-processors/worldbook-processor.ts)

## 基本信息

| 字段       | 值                            |
| ---------- | ----------------------------- |
| 处理器 ID  | `primary:worldbook-processor` |
| 显示名称   | 世界书处理器                  |
| 默认优先级 | `300`                         |
| 默认启用   | 是                            |
| 管道位置   | 转写之后，预设注入组装之前    |

## 职责

世界书处理器实现 SillyTavern 风格的关键词扫描和条目注入。它读取预加载的世界书内容，基于近期历史、角色信息、递归缓冲区和条目规则激活匹配条目，并将其作为系统、用户或助手消息插入上下文。

## 输入

- `context.sharedData.loadedWorldbooks`：由执行器预加载的世界书列表。
- `context.messages`：当前消息列表，主要扫描 `sourceType === "session_history"` 的历史文本。
- `context.agentConfig`：提供角色名、标签、描述和世界书覆盖设置。
- `context.settings.worldbook`：全局世界书设置。
- `context.settings.world_info_max_recursion_steps`：最大递归步数兼容字段。

## 输出

- 将激活条目写入 `context.sharedData.activatedWorldbookEntries`。
- 按条目位置向 `context.messages` 插入世界书内容。
- 在 `context.logs` 中记录激活条目数量和条目摘要。

## 激活能力

- 关键词匹配：支持普通包含、整词匹配、大小写敏感和 `/pattern/flags` 正则写法。
- 常驻条目：`constant` 直接激活。
- 延迟与冷却：支持 `delay`、`cooldown`、`sticky`。
- 二级关键词：支持 `AND_ANY`、`AND_ALL`、`NOT_ANY`、`NOT_ALL` 逻辑。
- 递归：激活内容可加入递归扫描缓冲区，支持 `preventRecursion` 和延迟递归层级。
- 组竞争：支持 inclusion group、权重和 `groupOverride`。
- 角色过滤：支持按智能体名称或标签包含、排除。

## 注入位置映射

| 世界书位置              | AIO Hub 注入策略                                             |
| ----------------------- | ------------------------------------------------------------ |
| `BeforeChar`            | 插入到第一个 system 预设消息之前，找不到则退到预设或历史锚点 |
| `AfterChar`             | 插入到角色锚点之后                                           |
| `BeforeAN` / `BeforeEM` | 插入到历史消息之前                                           |
| `AfterAN` / `AfterEM`   | 插入到历史第一条之后                                         |
| `Depth`                 | 相对历史末尾按深度倒数插入                                   |
| `Outlet`                | 不直接插入，只保留在共享数据里供后续能力使用                 |

## 维护注意事项

- 该处理器在 `injection-assembler` 之前运行，因此注入结果会参与后续预设组装、知识库替换、变量处理和 Token 限制。
- 世界书扫描只取历史消息文本；预设消息和已注入消息默认不作为初始扫描来源。
- 递归循环有双重限制：配置步数和硬限制 `20`，避免错误世界书导致无限激活。
- 条目唯一键使用 `uid + bookName`，同 uid 来自不同世界书时可并存。

