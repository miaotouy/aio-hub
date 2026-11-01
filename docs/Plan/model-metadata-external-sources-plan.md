# 模型元数据外部源接入实施方案

> 状态：实施中  
> 目标：让模型元数据不再只能依赖内置规则或用户手填，支持从公开元数据源手动拉取与可选自动更新。

## 1. 背景与边界

现有系统为 v3 分层结构：内置目录快照 + 用户覆盖/禁用 + 自定义规则（`packages/model-metadata-core`）。元数据在模型创建、导入、刷新或显式应用预设时物化写入模型对象，运行时不回读全局规则。

本方案只扩展「目录来源」，不改变物化时机与 `metadataBinding` 审计语义。外部源数据默认以低优先级参与规则合并，且仅在目标字段为空时填充，不覆盖用户手填值。

## 2. 外部源

| 源 ID | 名称 | 地址 | 许可 | 格式 |
| --- | --- | --- | --- | --- |
| `models-dev` | models.dev | `https://models.dev/api.json` | MIT | provider → models 嵌套 JSON |
| `litellm` | LiteLLM 模型价格表 | `https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json` | MIT | 模型键 → 能力/价格平铺 JSON |

字段映射：

- `contextLength`：models.dev `limit.context`；LiteLLM `max_input_tokens ?? max_tokens`
- `pricing`：统一为每百万 token；LiteLLM 的 per-token 价格乘以 1e6
- `capabilities`：`vision` / `audio` / `toolUse` / `thinking` / `webSearch` / `computerUse` / `embedding` / `rerank` / `imageGeneration`
- `description` / `releaseDate`：仅 models.dev 提供
- `mediaGenParams`：外部源不提供，继续由内置规则维护

外部源不生成 `group` 与 `icon`，避免污染现有展示与匹配。

## 3. 数据模型变更

`MetadataCatalogSnapshot.sourceId` 由字面量 `"aiohub-builtin"` 泛化为 `string`。

`ModelMetadataStoreV3` 新增可选字段：

```ts
externalCatalogs?: Record<string, MetadataCatalogSnapshot>;
externalSourceStates?: Record<string, {
  enabled: boolean;
  autoUpdate?: boolean;
  lastFetchedAt?: string;
  lastRevision?: string;
  ruleCount?: number;
  lastError?: string;
}>;
```

`ModelMetadataRule` 新增可选 `sourceId`，用于覆盖后仍能追溯来源。

规则 ID 约定：`ext-<sourceId>-<slug>`；外部规则默认 `priority: -10`，低于内置规则，保证同一字段内置值优先。

## 4. 编译与优先级

`compileActiveRules` 合并顺序：

1. 内置目录（应用用户覆盖，剔除禁用）
2. 已启用外部目录（应用用户覆盖，剔除禁用）
3. 上游已移除但本地保留的覆盖规则
4. 自定义规则

排序仍由 `priority`、匹配类型精度与 ID 决定。外部规则优先级低，且目标字段已有值时物化不会写入。

## 5. 拉取与更新

- 手动更新：设置页「元数据源」对话框逐源更新，展示规则数、更新时间与错误。
- 自动更新：源级开关，默认关闭；应用启动后延迟静默检查已启用源，失败只记录状态，不阻塞启动。
- 更新只替换外部目录快照，不自动改写已有模型；用户通过「刷新模型配置」显式物化。
- 拉取先走 Tauri HTTP 插件，失败回落到带代理的 `fetchWithTimeout`。

## 6. UI

- 规则列表新增「来源」筛选：全部 / 内置 / 内置已修改 / 外部源 / 自定义，外部源可按具体源筛选。
- 卡片来源标签识别外部源名称与「已修改」状态。
- 新增「元数据源」入口，可启用/禁用、手动更新、查看许可与更新时间。

## 7. 兼容与风险

- 旧 `metadata-rules.json` 无新字段，加载后按默认值处理，不触发迁移。
- 外部源数据可能滞后或不准确；默认关闭自动更新，且仅填充空字段。
- LiteLLM 条目量大，适配器过滤明显的尺寸规格键与非对话模型，控制规则规模。
- 导出/导入沿用 v3 store；外部目录随导出一并携带，导入后仍需用户启用对应源。

## 8. 验收

- core 单测覆盖适配器映射、多目录编译、来源判定与优先级。
- `model-metadata-core` 类型检查与测试通过。
- 桌面端 `vue-tsc` 与 Vite 构建通过。
- 设置页可按来源筛选、手动更新两个源、启停后规则列表随之变化。
