# 数据筛选工具 (Data Filter) 架构文档

## 1. 概述

数据筛选工具是一款专为处理大规模 JSON/YAML 数组数据设计的效率工具。它允许用户通过直观的 UI 或 Agent 接口，利用多维条件和自定义脚本对数据进行精确过滤、清洗和提取。

### 核心价值

- **结构化过滤**: 支持深层路径访问 (`a.b.c`)。
- **多条件组合**: 默认采用 `AND` 逻辑组合多个过滤项，单项内部支持多键 `OR` 匹配。
- **动态脚本**: 允许编写简单的 JavaScript 表达式处理复杂逻辑。
- **无缝衔接**: 支持一键发送结果到聊天面板或导出。

## 2. 目录结构

```text
src/tools/data-filter/
├── logic/
│   └── dataFilter.logic.ts     # 核心计算层：数据解析、过滤引擎、结果格式化
├── composables/
│   └── useDataFilterConfig.ts   # 状态管理层：配置持久化、预设 (Preset) 管理
├── DataFilter.vue               # UI 表现层：响应式三栏布局、交互逻辑
├── dataFilter.registry.ts       # 系统集成：工具注册、Agent 能力暴露
└── ARCHITECTURE.md              # 架构文档
```

## 3. 技术实现细节

### 3.1 过滤引擎 (Logic Layer)

核心逻辑位于 [`logic/dataFilter.logic.ts`](./logic/dataFilter.logic.ts)，采用纯函数设计，便于单元测试和 Agent 调用。

- **数据定位**: 使用 `lodash-es` 的 `get` 函数，支持通过 `dataPath` 定位深层数组。
- **多键 OR 匹配**: `FilterCondition.key` 支持逗号分隔（如 `name,title`），只要其中一个键满足条件，该行即视为通过。
- **自定义脚本实现**: 通过 `new Function("item", "value", ...)` 执行用户提供的 JS 表达式。
- **容错处理**: 内置自动识别 JSON/YAML 格式，并在解析失败时提供友好的错误提示。

### 3.2 筛选操作符规范

| 操作符       | 内部标识            | 说明                        | 逻辑参考                                 |
| :----------- | :------------------ | :-------------------------- | :--------------------------------------- |
| **等于**     | `eq`                | 严格相等匹配                | `itemValue === cond.value`               |
| **不等于**   | `ne`                | 严格不等匹配                | `itemValue !== cond.value`               |
| **包含**     | `contains`          | 字符串包含匹配              | `String(itemValue).includes(cond.value)` |
| **真值**     | `truthy`            | 存在且非假值                | `!!itemValue`                            |
| **假值**     | `falsy`             | 不存在或为假值              | `!itemValue`                             |
| **数值比较** | `gt`/`ge`/`lt`/`le` | 大于/大于等于/小于/小于等于 | `Number(itemValue) > Number(value)`      |
| **自定义**   | `custom`            | 执行 JS 脚本                | `return ${cond.customScript}`            |

### 3.3 状态管理与持久化 (State Management)

通过 [`useDataFilterConfig`](./composables/useDataFilterConfig.ts) 实现：

- **自动保存**: 利用 `configManager` 对输入内容和当前配置进行防抖保存（默认 800ms）。
- **预设系统**: 支持将常用的过滤组合保存为“预设”，存储于 `AppData/data-filter/config.json`。
- **版本控制**: 预设包含 `id`, `name`, `options`, `createdAt` 等元数据。

## 4. UI 布局与交互

采用 **响应式三栏布局**，确保在大屏幕下拥有极佳的操作视野：

1. **左侧：输入面板**
   - 使用 `RichCodeEditor` (Monaco/CodeMirror)。
   - 支持 JSON/YAML 自动高亮。
2. **中间：配置面板**
   - **路径配置**: 设置 `dataPath`。
   - **条件列表**: 动态增删改过滤条件，支持开关 (`enabled`)。
   - **预设管理**: 快速切换、保存、更新预设。
3. **右侧：结果面板**
   - 实时/手动触发过滤。
   - 结果只读展示，附带统计信息（总数/过滤后/剔除数）。
   - 操作区：复制结果、发送到聊天。

## 5. Agent 接入能力

[`DataFilterRegistry`](./dataFilter.registry.ts) 暴露了 `applyFilter` 方法，使 LLM 能够处理本地数据文件：

- **调用流程**:
  1. Agent 提供文件路径 `path`。
  2. Agent 定义 `conditions` (JSON 字符串)。
  3. 注册器调用 `logic.applyFilterFromFile` 执行。
  4. 返回包含统计信息和结果数据的 Markdown 报表。

## 6. 核心依赖

- **Tauri FS**: 读取本地大文件。
- **js-yaml**: 处理 YAML 格式数据。
- **lodash-es**: 路径取值与对象操作。
- **Element Plus**: UI 组件支撑。
- **RichCodeEditor**: 高性能代码编辑与预览。
