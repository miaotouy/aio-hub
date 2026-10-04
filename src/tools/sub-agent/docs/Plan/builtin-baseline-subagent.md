# 释出型内置开箱即用 Subagent 架构方案

> **状态**：Implemented（三阶段已实施，2026-10-04）  
> **关联模块**：`src/tools/sub-agent`、`src/tools/agent-manager`、`src/tools/llm-chat`、`src/composables/useLlmProfiles`  
> **设计演进**：摒弃硬搬纯工程客户端（OpenCode / DSH）的无入口虚拟 Overlay 做法，回归 AIO Hub 本地资产优先（Local-First）与开箱即用的自洽化释出模式（Materialization Pattern）  
> **最后更新**：2026-10-04  

---

## 1. 架构演进与核心问题复盘

### 1.1. 既有现状：开箱状态下子智能体不可用
`sub-agent` 工具（[`src/tools/sub-agent/sub-agent.registry.ts`](../../sub-agent.registry.ts:401)）在纯净安装或未手动配置时**没有任何可用子智能体**：
- [`SubAgentRegistry.list_available_agents()`](../../sub-agent.registry.ts:401) 与 [`SubAgentRegistry.ask()`](../../sub-agent.registry.ts:580) 强制要求 `subAgentConfig.enabled === true`；
- 首次安装时创建的默认「助手」取自 `DEFAULT_SUB_AGENT_CONFIG = { enabled: false }`；
- 导致主会话 Agent 第一次尝试调用子任务时直接报错或获取到空列表，用户必须进入智能体编辑器深处的「高级能力」手动勾选开关，体验存在明显断层。

### 1.2. 为什么“虚拟组装 + 工作区 Overlay”在 AIO Hub 中是不自洽的？
前期草案曾尝试借鉴 OpenCode 或 DeepSeek Harness 的做法，采用“代码常驻虚拟定义 + 工作区同名文件覆盖”的方案。深入调研后发现该做法与 AIO Hub 桌面端的定位严重脱节：
1. **脱离工作区心智**：AIO Hub 并非工作区制（Workspace-based）的 coding 模块，而是纯 GUI 的桌面 AI 工具枢纽。用户在日常使用中根本没有代码工程目录去新建一个同名 `worker.json` 搞所谓的“覆盖”；
2. **缺乏显式入口的黑盒感**：如果内置 Subagent 纯粹在内存中动态组装、不在智能体体系中露脸，用户既看不到它们携带了什么特化提示词，也无法调整它们的参数或工具权限，完全丧失掌控力；
3. **删除与禁用的心智割裂**：在 GUI 中，如果一个对象被用户删除后在重启时“幽灵复活”，或者必须区分“删除”与“禁用”，用户体验极其生硬。

### 1.3. 统一认知：AIO Hub 的“释出型（Materialization Pattern）”哲学
AIO Hub 现有的类似场景（如 [`agentStore.createDefaultAgents`](../../agent-manager/stores/agentStore.ts:629) 创建默认助手、[`agentAssetService.ensurePresetAssetsImported`](../../agent-manager/services/agentAssetService.ts:38) 将随包预设释放为本地物理资产）验证了一条自洽的原则：
**“系统随包携带高质量只读母版（Preset），但在运行时面向用户的，必须是触手可及、可看可改的本地物理实体（Physical Agent）。”**

基于此，确立五大核心法则：
1. **按需释出（Lazy Materialization）**：不增加冷启动负担。仅在 `sub-agent` 工具首次初始化、或首次被调用时，若检测到系统内缺少内置 Subagent，才按需释出到用户的 `AppData` 中；
2. **可自由修改的一等公民**：释出后的智能体与普通 Agent 无异，可在智能体大厅统一管理、修改提示词、微调参数、配置工具白名单；
3. **删除即重置，禁用即生效（Delete-to-Reset vs Explicit-Disable）**：
   - **用户显式禁用（`subAgentConfig.enabled = false`）**：物理实体完整保留在磁盘，系统检测到该 Agent 已存在，**绝不重复释出覆盖**。即使因此导致可用子智能体列表为空，也是符合用户意志的预期行为；
   - **用户物理删除（Delete）**：在心智上等同于“放弃此自定义配置”。下次按需检查时，系统将重新从母版释出一份干净的内置默认配置（**删除等价于重置内置设置**）；
4. **极简自调分身（Self-Clone Subagent）**：
   - 用户可以关闭所有内置 Subagent，仅将自己当前正在对话的 Agent 的「允许作为子智能体调用」打开；
   - 此时可用列表中仅有当前 Agent 自身，调度器完全支持**“自己派发给自己的分身”**（创建独立的 detached session 隔离执行）；
   - 核心调整：解除过去粗暴的 `context?.agent?.id === args.agentId` 拦截，转由**调用深度链（Depth Limit = 1）**精准防范死循环递归。
5. **模型跟随偏好与优雅降级（Model Resolution Hierarchy）**：
   - 支持子智能体配置模型偏好：`inherit_caller`（跟随上层会话，默认）与 `prefer_self`（优先自身模型）；
   - 若自身模型配置为空，或用户把自身配置绑定的 Profile/Model 删除了，自动优雅降级回退到上层会话模型，绝不抛出“配置丢失”而暴毙。

---

## 2. 总体架构与执行链路

```text
┌─────────────────────────────────────────────────────────────┐
│ 随包内置预设目录 (Shipped Preset Catalog)                    │
│ - public/agent-presets/builtin-subagent/ (🤖子任务助手)      │
│ 注册于 src/config/agent-presets/index.ts 的 builtinPresets   │
│ config 声明 category:'workflow', subAgentConfig.enabled:true │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               │ 首次打开 sub 工具 / 首次 ask 调用
                               │ [条件：AppData 中对应 ID 不存在]
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 用户物理存储区 (AppData: agents/{id}/agent.json)            │
│ 状态 A: 启用态 (enabled: true) ──► 参与 list_available 候选 │
│ 状态 B: 禁用态 (enabled: false) ─► 保留文件，不重复释出覆盖 │
│ 状态 C: 已被删 (不存在) ─────────► 下次需要时自动重置再释出 │
└──────────────────────────────┬──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ sub-agent 调度执行层 (SubAgentRegistry)                     │
│ 1. list_available_agents: 读取物理开启 sub 的 Agent          │
│ 2. ask: 读取调用方父会话 context，执行模型晚绑定继承解析    │
│ 3. 模型决策：prefer_self(有效) > inherit_caller > 系统默认   │
│ 4. 派生独立子会话并执行 (createDetachedSession)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. 详细设计与数据契约

### 3.1. 子智能体配置契约扩展 (`SubAgentConfig`)

> 现状：[`SubAgentConfig`](../../agent-manager/types/agent.ts:220) 仅含 `{ enabled: boolean }`，`DEFAULT_SUB_AGENT_CONFIG` 也仅含 `{ enabled: false }`。以下为本次扩展后的**目标契约**，属 Phase 1 待实现项。

在 [`src/tools/agent-manager/types/agent.ts`](../../agent-manager/types/agent.ts) 中扩展 `SubAgentConfig`：

```typescript
export interface SubAgentConfig {
  /** 是否允许作为子智能体被调度 */
  enabled: boolean;

  /**
   * 模型绑定偏好策略：
   * - 'inherit_caller' (默认): 动态跟随调度方/父会话的模型配置，上下文成本低且开箱即用；
   * - 'prefer_self': 优先使用当前 Agent 自身配置的 profileId 与 modelId（用于特定能力的大模型特化）。
   */
  modelBindingMode?: "inherit_caller" | "prefer_self";

  /**
   * 允许的最大嵌套调用深度 (Max Delegation Depth)。
   * - 默认值: 1 (仅允许主智能体调度一级子智能体，子智能体不可继续派发)；
   * - 支持配置范围: 1 ~ 3；严控最大上限以杜绝不可控的递归与 Token 消耗。
   */
  maxDelegationDepth?: number;

  /** 是否为系统内置的 Baseline Subagent（用于 UI 标识） */
  isBuiltinBaseline?: boolean;

  /**
   * 是否仅作为子智能体可见（在 Chat 主会话的可用智能体侧边栏/列表中隐藏）。
   * - 默认为 false；
   * - 内置内置预设（worker/task-runner/reviewer）默认置为 true，避免专项工作节点污染主聊天的日常角色列表；
   * - 用户可在智能体编辑器或 Subagent 控制面板中按需切换。
   */
  onlySubVisible?: boolean;
}

export const DEFAULT_SUB_AGENT_CONFIG: SubAgentConfig = {
  enabled: false,
  modelBindingMode: "inherit_caller",
  maxDelegationDepth: 1,
  isBuiltinBaseline: false,
  onlySubVisible: false,
};
```

### 3.2. 首批随包内置 Baseline 矩阵

在 `public/agent-presets/` 中放置单一通用的内置预制目录，包含 `config.json`（可选 `icon.jpg`）：

> ⚠️ **预设发现依赖静态索引**：`public/agent-presets/{id}/` 目录不会自动被扫描，必须在 [`src/config/agent-presets/index.ts`](../../../../config/agent-presets/index.ts) 的 `builtinPresets` 中注册元数据（`id / name / description / icon / configUrl`），详见 [`src/config/agent-presets/README.md`](../../../../config/agent-presets/README.md)「如何添加新内置预设」。预设 ID 由索引的 `id`（即目录名）注入，`config.json` 内不写 `id`。

| 预设 ID                | 显示名称   | 图标 | 能力定位与 `description`                                | 默认模型偏好     | 默认可见性 (`onlySubVisible`) | 默认工具配置                      |
| :--------------------- | :--------- | :--: | :------------------------------------------------------ | :--------------- | :---------------------------- | :-------------------------------- |
| **`builtin-subagent`** | 子任务助手 |  🤖  | **专用于承接派发子任务的通用子智能体。** 提示词极简中立 | `inherit_caller` | `true` (主聊天侧边栏隐藏)     | 继承完整环境工具权限（auto 模式） |

**命名与分类约定**：
- `config.json` 的 `name` 是**稳定 ID/宏替换名**（`{{char}}`），用英文 slug（如 `\"builtin-subagent\"`）；UI 显示名单独放在 `displayName`（如 `\"子任务助手\"`）。这与智能体编辑器「ID/名称 → 显示名称」的分工一致（见 [`BasicInfoSection.vue:55-75`](../../agent-manager/components/agent-editor/sections/BasicInfoSection.vue)），UI 处统一按 `displayName || name` 回退（如 [`sub-agent.registry.ts`](../../sub-agent.registry.ts) 的 `list_available_agents`）；
- 预设 ID 由索引 `id`（即目录名）注入，`config.json` 内不写 `id`；`name` 的 slug 应与目录名保持一致；
- `category` 必须取自 [`AgentCategory`](../../agent-manager/types/agent.ts:594) 枚举值（`assistant / character / expert / creative / workflow / other`）。内置子智能体作为系统级执行节点统一使用 `workflow`，**不存在 `system` 这个枚举值**；
- 预设不携带具体 `profileId / modelId`（模型绑定偏好由 `subAgentConfig.modelBindingMode` 表达）；
- 图标可直接用 Emoji（表格所示），也可放置 `icon.jpg` 并将 `icon` 指向 `/agent-presets/{id}/icon.jpg`，后者会在释出后由 `ensurePresetAssetsImported` 本地化。

内置预设的 `config.json`（保持极简，避免越俎代庖的繁琐提示词导致模型降智）：
```json
{
  "version": 1,
  "name": "builtin-subagent",
  "displayName": "子任务助手",
  "category": "workflow",
  "description": "专用于承接派发子任务的通用子智能体。",
  "icon": "🤖",
  "subAgentConfig": {
    "enabled": true,
    "modelBindingMode": "inherit_caller",
    "isBuiltinBaseline": true,
    "onlySubVisible": true
  },
  "parameters": {
    "temperature": 0.5,
    "maxTokens": 8192
  },
  "presetMessages": [
    {
      "id": "preset-system-subagent",
      "parentId": null,
      "childrenIds": [],
      "role": "system",
      "content": "你是子任务助手（Subagent）。负责承接并执行派发给你的独立专项任务。请结合上下文与可用工具认真完成任务，并交付清晰可靠的执行结果。",
      "status": "complete",
      "isEnabled": true
    }
  ],
  "toolCallConfig": {
    "enabled": true,
    "mode": "auto"
  }
}
```

对应的索引注册项（`src/config/agent-presets/index.ts`，`name` 为预设列表展示名，加载后 UI 仍按 `displayName || name` 回退）：
```typescript
{
  id: "builtin-subagent",
  name: "子任务助手",
  description: "专用于承接派发子任务的通用子智能体。",
  icon: "🤖",
  category: AgentCategory.Workflow,
  tags: ["系统", "子智能体"],
  configUrl: "/agent-presets/builtin-subagent/config.json",
}
```

---

## 4. 按需释出与模型晚绑定核心机制

### 4.1. 按需释出服务 (`SubAgentBaselineService`)

新建 `src/tools/sub-agent/services/subAgentBaselineService.ts`：

```typescript
import { useAgentStore } from "@/tools/agent-manager/stores/agentStore";
import { builtinPresets } from "@/config/agent-presets";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("sub-agent/baselineService");

export const BUILTIN_BASELINE_IDS = [
  "builtin-subagent",
] as const;

export class SubAgentBaselineService {
  private materializationPromise: Promise<void> | null = null;

  /**
   * 确保内置基线 Subagent 已按需释出到 AppData。
   * - 若某个内置 ID 在用户物理列表中已存在（无论其 enabled 是 true 还是 false），绝不重复覆盖！
   * - 若某个内置 ID 彻底缺失（纯净安装或被用户删除），则从预设中加载并物理化。
   */
  public async ensureBaselineMaterialized(): Promise<void> {
    if (this.materializationPromise) return this.materializationPromise;

    this.materializationPromise = (async () => {
      const agentStore = useAgentStore();
      if (agentStore.agents.length === 0) {
        await agentStore.loadAgents();
      }

      const existingIds = new Set(agentStore.agents.map((a) => a.id));
      const missingIds = BUILTIN_BASELINE_IDS.filter((id) => !existingIds.has(id));

      if (missingIds.length === 0) {
        return; // 全量存在，无需释出
      }

      logger.info("检测到缺失内置基线子智能体，开始按需释出", { missingIds });

      for (const id of missingIds) {
        try {
          // 通过静态索引定位 configUrl，而非裸拼目录路径
          const presetMeta = builtinPresets.find((p) => p.id === id);
          if (!presetMeta) {
            logger.warn(`内置预设未在 builtinPresets 中注册: ${id}`);
            continue;
          }

          const res = await fetch(presetMeta.configUrl);
          if (!res.ok) {
            logger.warn(
              `加载内置预设失败: ${presetMeta.configUrl} (${res.status})`
            );
            continue;
          }
          // 本批预设使用 config.json；若改用 config.yaml 需引入 js-yaml 解析
          const presetData = await res.json();

          // 物理化落盘。customId 依赖 Phase 1 对 agentStore.createAgent 的改造，
          // 使其以显式 ID 替代随机 id（现状见 agentStore.ts:127）。
          // 传参只挑选受支持的字段，避免把预设整包展开污染 Agent 对象。
          agentStore.createAgent(
            presetData.name ?? id, // 第一参为 name：稳定 ID/宏替换名（slug）
            "",
            "",
            {
              displayName: presetData.displayName ?? presetMeta.name, // UI 显示名
              description: presetData.description ?? presetMeta.description,
              icon: presetMeta.icon ?? presetData.icon,
              category: presetData.category,
              tags: presetData.tags,
              presetMessages: presetData.presetMessages ?? [],
              parameters: presetData.parameters,
              subAgentConfig: presetData.subAgentConfig,
              toolCallConfig: presetData.toolCallConfig,
              customId: id, // 显式指定 ID 保持内置预设稳定 ID（Phase 1 改造）
            }
          );
          // 内置预设若引用 /agent-presets/{id}/icon.jpg 等资源，这里完成本地物理化
          await agentStore.ensurePresetAssetsImported(id);
          logger.info(`内置基线子智能体已释出落盘并完成资产导入: ${id}`);
        } catch (error) {
          logger.error(`释出内置智能体失败: ${id}`, error as Error);
        }
      }
    })().finally(() => {
      this.materializationPromise = null;
    });

    return this.materializationPromise;
  }
}

export const subAgentBaselineService = new SubAgentBaselineService();
```

> 释出流程与现有"从预设创建智能体"的 UI 路径保持一致：即 [`AgentManager.vue:130`](../../agent-manager/AgentManager.vue) 的 `agentStore.createAgent(...)` + `ensurePresetAssetsImported(agentId)`。无需改造 `agentImportService`（其负责用户文件导入、世界书与重名预检，与本场景正交）。

### 4.2. 模型解析与降级算法 (`resolveSubAgentModel`)

在 `src/tools/sub-agent/services/subAgentModelResolver.ts` 中实现严密的模型决策链：

```typescript
import { useLlmProfiles } from "@/composables/useLlmProfiles";
import type { ChatAgent } from "@/tools/agent-manager/types/agent";

export interface SubAgentResolveContext {
  callerProfileId?: string;
  callerModelId?: string;
}

export interface ResolvedModelTarget {
  profileId: string;
  modelId: string;
  source: "self" | "caller" | "fallback";
}

/**
 * 决定子智能体最终执行所绑定的模型：
 * 1. 若配置为 prefer_self，且自身 profileId / modelId 依然有效，使用自身；
 * 2. 其余情况（inherit_caller 或自身配置失效），优先跟随调用方父会话模型；
 * 3. 若调用方模型不可用，安全回退到系统激活的默认 Profile/首选模型。
 */
export function resolveSubAgentModel(
  targetAgent: ChatAgent,
  context?: SubAgentResolveContext
): ResolvedModelTarget {
  const { enabledProfiles } = useLlmProfiles();
  const profiles = enabledProfiles.value;

  const isModelAvailable = (pid?: string, mid?: string) => {
    if (!pid || !mid) return false;
    const profile = profiles.find((p) => p.id === pid);
    return profile ? profile.models.some((m) => m.id === mid) : false;
  };

  const mode = targetAgent.subAgentConfig?.modelBindingMode ?? "inherit_caller";

  // 1. 尝试 prefer_self
  if (mode === "prefer_self") {
    if (isModelAvailable(targetAgent.profileId, targetAgent.modelId)) {
      return {
        profileId: targetAgent.profileId,
        modelId: targetAgent.modelId,
        source: "self",
      };
    }
  }

  // 2. 尝试 inherit_caller
  if (isModelAvailable(context?.callerProfileId, context?.callerModelId)) {
    return {
      profileId: context!.callerProfileId!,
      modelId: context!.callerModelId!,
      source: "caller",
    };
  }

  // 3. 兜底系统激活的默认 Profile
  const defaultProfile = profiles[0];
  const defaultModel = defaultProfile?.models[0]?.id ?? "default";

  return {
    profileId: defaultProfile?.id ?? "default",
    modelId: defaultModel,
    source: "fallback",
  };
}
```

---

## 5. 对既有系统的改造与平滑对接

### 5.1. 自调用分身与可配调用深度链（Self-Clone & Configurable Depth Limit）
原先代码中存在粗暴的同名限制与硬编码单层限制（现状位于 [`sub-agent.registry.ts:587-591`](../../sub-agent.registry.ts)）：
```typescript
if (context?.agent?.id === args.agentId) {
  throw new Error("当前智能体不能调用自身，避免形成递归调用");
}
```
这一限制直接掐死了“用户只想用自己当前调教好的人设/分身去独立并发跑子任务”的核心诉求。

**重构方案：解除同名拦截与强单层拦截，引入调用深度链跟踪与可配阈值：**
1. **解除同名拦截**：允许主会话 Agent A 调度 Agent A（实例化为独立的 detached session 作为分身并行执行，隔离消息树）；
2. **重构 `activeTargetAgentIds` 强单层限制**：现状 [`sub-agent.registry.ts:590`](../../sub-agent.registry.ts) 以 `this.activeTargetAgentIds.has(context.agent.id)`（`Map<string, number>` 引用计数）禁止被调用中的 Agent 再次委托，重构为基于深度链动态校验；
3. **深度上下文传递（Delegation Depth Chain）**：
   - 扩展 [`ToolContext`](../../../../services/types.ts:269)（增加 `delegationDepth?: number`），主会话发起时未指定默认为 0；
   - 每次子智能体调用前，校验当前深度 `(context?.delegationDepth ?? 0) + 1 <= maxDepth`（`maxDepth` 读取目标 Agent 配置中的 `subAgentConfig.maxDelegationDepth ?? 1`，全局安全硬上限 clamp 至 3）；
   - 若超出设定的允许深度，明确抛出错误：`已达到允许的最大子任务派发深度（当前深度：${currentDepth}，限制：${maxDepth}）`；
   - 调度下一级子会话时，在派生的下层 `ToolContext` 中向下透传递增的 `delegationDepth: currentDepth + 1`；
4. **自调用分身心智闭环**：
   - 用户在大厅关闭所有内置 Subagent，仅把当前 Agent 的 `subAgentConfig.enabled` 置为 `true`；
   - `list_available_agents()` 中仅呈现当前 Agent 自身；
   - 主会话 Agent 遇到耗时子任务时，派发给自身分身，在独立的 detached session 中并发执行，并在终态将产物无缝送回主会话。

### 5.2. `sub-agent.registry.ts` 接入改造
在 [`SubAgentRegistry`](../../sub-agent.registry.ts) 中：
1. **`list_available_agents` 触发按需释出**：
   ```typescript
   public async list_available_agents(): Promise<string> {
     await llmChatService.ensureInitialized();
     // 触发按需释出检查（若已全量存在则微秒级跳过）
     await subAgentBaselineService.ensureBaselineMaterialized();

     const agentStore = useAgentStore();
     const loadedAgents = await Promise.all(
       agentStore.agents.map((agent) => agentStore.loadAgentDetails(agent.id))
     );
     const agents = loadedAgents
       .filter((agent) => agent?.subAgentConfig?.enabled === true)
       .map((agent) => ({
         id: agent!.id,
         name: agent!.displayName || agent!.name,
         description: agent!.description || "",
       }));

     return JSON.stringify({ agents }, null, 2);
   }
   ```
2. **`ask` 与 `askInBackground` 触发按需释出 + 应用模型继承与临时模型生效**：
   在 `ask` 入口（`agentId` 校验前）调用 `subAgentBaselineService.ensureBaselineMaterialized()`，确保首次直接 `ask` 也能释出内置基线；随后在派生独立会话时，通过父级会话的 Agent 提取模型上下文，并通过 `sendMessage` 的 `temporaryModel` 动态注入生效模型：
   ```typescript
   await subAgentBaselineService.ensureBaselineMaterialized();

   // 提取调用方模型上下文（父会话绑定的 Agent 或当前活跃 Agent）
   const parentSession = llmChatService.getCurrentSession();
   const parentAgentId = parentSession?.displayAgentId || context?.agent?.id;
   const parentAgent = parentAgentId ? agentStore.getAgentById(parentAgentId) : llmChatService.getCurrentAgent();

   const callerContext: SubAgentResolveContext = {
     callerProfileId: parentAgent?.profileId,
     callerModelId: parentAgent?.modelId,
   };

   const resolved = resolveSubAgentModel(targetAgent, callerContext);

   // 创建 detached 会话
   const sessionId = await store.createDetachedSession(
     targetAgent.id,
     `子智能体：${targetName}`
   );

   // 在 sendMessage 时通过 temporaryModel 注入解析出的模型配置
   await llmChatService.sendMessage(message, {
     agentId: targetAgent.id,
     sessionId,
     temporaryModel: {
       profileId: resolved.profileId,
       modelId: resolved.modelId,
     },
   });
   ```

### 5.3. 智能体大厅与子智能体管理面板协同
1. **Chat 侧边栏列表隔离（`AgentsSidebar.vue`）**：
   - 在主聊天侧边栏计算属性 `filteredAndSortedAgents` 中过滤掉开启了 `onlySubVisible === true` 的智能体；
   - 确保内置的 `builtin-subagent` 专项子智能体默认不出现在主聊天的角色切换列表中，避免污染普通对话心智；
   - 当用户在智能体编辑器中取消勾选“仅作为子智能体可见”时，该智能体立即自然出现在主聊天的列表中，允许直接与它单独会话。
2. **智能体大厅（`AgentManager.vue`）**：
   - 智能体大厅保留**全局完整视图**，所有物理实体（包括 `onlySubVisible === true` 的子智能体）均完整呈现并带有“仅子智能体”和“系统基线”Badge；
   - 用户可以像对待普通 Agent 一样点击编辑、修改系统提示词、微调参数、切换可见性与工具白名单；
   - 用户如果彻底删除某张卡片，提示文字依然是标准的删除确认；删除后不会强行即时复活，只有在下次调用 sub-agent 时才会等价于“重置内置”重新释出。
3. **Sub-Agent 工具内控制面板（Subagent Control Panel）**：
   - 罗列出当前所有可作为子智能体的列表（物理已开启 + 物理已禁用的）；
   - 提供直观开关，允许用户一键切换 `subAgentConfig.enabled` 与 `subAgentConfig.onlySubVisible`；
   - 若用户禁用了所有项，界面友好展示：“当前无可用子智能体，调度器将由主智能体单体执行”；
   - 提供一个显式按钮：`[补全缺失的内置子智能体]`，点击后仅对**缺失**的 Baseline 执行释出（与 §4.1「已存在实体绝不覆盖」一致，不会回滚用户的修改或禁用）；
   - 若要把已被用户修改的内置子智能体恢复为内置配置，请先在智能体大厅删除对应实体，下次释出即等价于「重置内置」（见法则 3）。

---

## 6. 分期实施路线与检查清单

### Phase 1：契约扩展、预设目录构建与按需释出服务
- [x] 在 `public/agent-presets/` 下建立 `builtin-subagent` 极简通用预设（`name` 用英文 slug、`displayName` 填中文显示名、`category` 用合法枚举 `workflow`；采用极简中立提示词，避免预制复杂指令造成模型降智）；
- [x] 在 [`src/config/agent-presets/index.ts`](../../../../config/agent-presets/index.ts) 的 `builtinPresets` 中注册 `builtin-subagent` 预设的元数据（`id / name / description / icon / configUrl`）——预设目录不会自动发现，缺此步释出与预设列表均不可用；
- [x] 扩展 [`src/services/types.ts`](../../../../services/types.ts) 的 `ToolContext`，增加 `delegationDepth?: number` 支持嵌套深度追踪；
- [x] 扩展 [`src/tools/agent-manager/types/agent.ts`](../../agent-manager/types/agent.ts) 的 `SubAgentConfig`，支持 `modelBindingMode`、`maxDelegationDepth` 与 `onlySubVisible`（另新增 `MAX_DELEGATION_DEPTH_LIMIT = 3` 常量）；
- [x] 改造 `agentStore.createAgent` 支持可选显式 `customId`（ID 已存在时返回空串由调用方跳过），确保释出内置智能体时的 ID 稳定性；
- [x] 实现 `SubAgentBaselineService`，支持按需释出并在释出后调用 `agentStore.ensurePresetAssetsImported` 完成资源本地物理化（并发调用共享同一释出 Promise，完成后重置以支持"删除即重释"）。

### Phase 2：模型解析容错与调度层打通
- [x] 实现 `resolveSubAgentModel` 决策器与降级测试；
- [x] 改造 [`SubAgentRegistry.list_available_agents()`](../../sub-agent.registry.ts) 与 `ask()` 入口，接入 `ensureBaselineMaterialized()`（覆盖"首次打开工具"与"首次直接 ask"两条触发路径）；
- [x] 重构 `activeTargetAgentIds` 与自调用拦截，改为由 `delegationDepth` 深度链统一控制（自调用分身已放开；`activeTargetAgentIds` 保留仅作运行并发引用计数，不再做单层禁止）；`delegationDepth` 沿 `useChatHandler -> useChatExecutor -> useToolCallOrchestrator -> useToolCalling -> engine -> executor` 全链透传至子会话工具调用 `ToolContext`；
- [x] 改造 [`SubAgentRegistry.ask()`](../../sub-agent.registry.ts) 与 `askInBackground()`，透传父会话模型上下文并在 `sendMessage` 中通过 `temporaryModel` 生效；
- [x] 补齐端到端单测：`subAgentModelResolver.test.ts`（prefer_self 失效回退、调用方失效回退默认 Profile、无 Profile 占位不抛错）与 `subAgentBaselineService.test.ts`（稳定 ID、不覆盖已存在、部分补全、并发去重、索引注册校验）。

### Phase 3：UI 管理视图与内置补全闭环
- [x] 改造 [`AgentsSidebar.vue`](../../../llm-chat/components/sidebar/AgentsSidebar.vue)，在常规列表与搜索结果中过滤掉 `onlySubVisible === true` 的智能体；
- [x] 在智能体编辑器的「高级能力 -> 子智能体调用」中（`CapabilitiesSection.vue`），增加：
  - 「模型偏好：跟随父会话 / 优先自身模型」的单选配置项；
  - 「最大嵌套派发深度（1 ~ 3）」配置项；
  - 「仅作为子智能体可见（在 Chat 列表隐藏）」开关；
- [x] 新增 `SubagentControlPanel.vue`（挂载于 `TitleBar.vue`，由后台任务中心头部"子智能体管理"按钮打开），提供子智能体配置列表与「补全缺失的内置子智能体」快捷操作（仅补全缺失项，不覆盖已存在实体）；
- [x] 验证编译与测试套件：`bun run check:frontend` 与 `bun run build` 全绿（2026-10-04）。

---

## 7. 验收标准与验证方案

1. **开箱即用闭环验证**：
   - 清空 `AppData/agent-manager/agents/` 下的对应 ID；
   - 打开 `sub-agent` 工具或主会话发送任务唤起 `list_available_agents`，确认立即释出并列出官方内置子智能体，无任何报错；
2. **用户修改持久化验证**：
   - 在大厅中将 `子任务助手` 的名字改为 `自定义工作助手`，提示词增加特定业务领域的个性化要求；
   - 多次调用 sub-agent，确认调用的始终是修改后的物理配置，绝不发生覆盖倒退；
3. **禁用与删除行为预期验证**：
   - 将全部子智能体的 `subAgentConfig.enabled` 置为 `false`，调用 `list_available_agents` 返回空列表，符合预期；
   - 彻底删除 `builtin-subagent`，再次触发 sub-agent 时自动释出内置母版，实现优雅内置重置；
4. **模型容错验证**：
   - 切换或删除子智能体原绑定的 Profile，发起任务时能够顺畅继承父会话的模型继续生成，不报 `Profile not found`。
