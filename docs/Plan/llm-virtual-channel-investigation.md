# LLM 虚拟渠道概念调查

> 状态：调查中
> 调查日期：2026-08-12
> 范围：跨渠道容灾、模型聚合、故障转移、负载均衡
> 前置：Phase 0–3（模型执行路由）已实施

## 1. 问题背景

当前 Phase 0–3 已实现**模型级路由**（model execution routing），单个渠道内的不同模型可以使用不同的协议适配器。这解决了 New API、Sub2API、OpenCode Go 等"单端点多协议"聚合服务的基础接入问题。

但仍有以下场景未被覆盖：

1. **跨渠道容灾**：主渠道失败时自动切换到备用渠道（如 OpenAI 主渠道限速，自动切到 Azure 或 OpenRouter）。
2. **模型聚合**：将多个渠道的同名模型视为一个逻辑模型，自动选择可用的实例（如将三个不同渠道的 `gpt-4o` 聚合为一个用户可见的模型）。
3. **负载均衡**：在多个渠道间分配请求，避免单一渠道配额耗尽。
4. **成本优化**：按价格、配额剩余、延迟等因素选择最优渠道。
5. **渠道级优先级**：用户明确指定主备渠道顺序，而非在每个模型上重复配置。

当前的 `model.routing.bindings` 只能为单个模型指定一个渠道的一个适配器，不能表达"这个模型可以从三个渠道中任选一个"的语义。

## 2. 核心概念

### 2.1 虚拟渠道 vs 聚合渠道

**聚合渠道**（Phase 4 待实施）解决的是"单服务端点暴露多种协议"的适配问题：
- 一个 Base URL
- 一个 API Key
- 一份模型列表
- 不同模型使用不同的线协议（OpenAI Chat / Responses / Anthropic Messages / Gemini）

**虚拟渠道**解决的是"多个独立渠道共同对外提供服务"的编排问题：
- 多个物理渠道（每个有独立的 Base URL、API Key、模型列表）
- 逻辑上视为一个统一服务
- 具备故障转移、负载均衡、优先级选择等编排能力
- 用户在模型选择器中看到的是虚拟渠道聚合后的模型列表

### 2.2 虚拟渠道的职责边界

虚拟渠道是**渠道编排层**，不是协议适配层：

```
┌─────────────────────────────────────────┐
│  用户选择模型并发起请求                 │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  虚拟渠道：选择物理渠道实例              │◄─── 新增层级
│  - 容灾策略（主备顺序、超时重试）         │
│  - 负载策略（轮询、权重、配额感知）       │
│  - 健康检查与熔断                       │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  物理渠道：提供模型与 API 端点           │
│  - OpenAI 主渠道                        │
│  - Azure OpenAI 备渠道                  │
│  - OpenRouter 备渠道                    │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  模型执行路由：解析协议适配器            │◄─── Phase 0–3 已实施
│  resolveModelExecution()                │
└──────────────┬──────────────────────────┘
               │
┌──────────────▼──────────────────────────┐
│  协议适配器：执行实际请求                │
│  - openai-chat-completions              │
│  - anthropic-messages                   │
│  - gemini-generate-content              │
└─────────────────────────────────────────┘
```

关键职责划分：
- **虚拟渠道**：选择"用哪个物理渠道"
- **模型执行路由**：选择"用哪个协议适配器"
- **协议适配器**：构造请求并解析响应

## 3. 领域模型草案

### 3.1 虚拟渠道类型定义

```ts
interface VirtualChannelProfile {
  id: string;
  name: string;
  type: "virtual";  // 标识为虚拟渠道，与物理渠道区分
  
  /** 虚拟渠道的模式 */
  mode: VirtualChannelMode;
  
  /** 成员物理渠道配置 */
  members: VirtualChannelMember[];
  
  /** 模型聚合策略 */
  modelAggregation: ModelAggregationConfig;
  
  /** 请求路由策略 */
  routingStrategy: RoutingStrategyConfig;
  
  /** 健康检查与熔断配置 */
  healthCheck?: HealthCheckConfig;
}

type VirtualChannelMode =
  | "failover"      // 主备故障转移
  | "load-balance"  // 负载均衡
  | "cost-optimize" // 成本优化
  | "manual";       // 手工选择优先级

interface VirtualChannelMember {
  /** 引用的物理渠道 ID */
  profileId: string;
  
  /** 在虚拟渠道中的角色 */
  role?: "primary" | "secondary" | "fallback";
  
  /** 优先级（数字越小越优先，主备模式使用） */
  priority?: number;
  
  /** 权重（负载均衡模式使用） */
  weight?: number;
  
  /** 是否启用 */
  enabled: boolean;
  
  /** 成员特定的覆盖配置 */
  overrides?: {
    /** 仅使用该成员的特定模型（模型 ID 白名单） */
    includedModels?: string[];
    /** 排除该成员的特定模型（模型 ID 黑名单） */
    excludedModels?: string[];
  };
}

interface ModelAggregationConfig {
  /** 模型合并策略 */
  strategy: "union" | "intersection" | "primary-only";
  
  /** 同名模型的去重规则 */
  deduplication: {
    /** 去重依据 */
    by: "model-id" | "model-id-and-provider" | "identity";
    
    /** 去重后如何选择展示信息 */
    displayFrom: "primary" | "first" | "merge";
  };
  
  /** 是否在模型名称中显示渠道来源 */
  showChannelSource?: boolean;
}

interface RoutingStrategyConfig {
  mode: VirtualChannelMode;
  
  /** 主备模式配置 */
  failover?: {
    /** 主渠道失败后的重试次数 */
    retries: number;
    /** 重试超时（毫秒） */
    timeout: number;
    /** 是否自动回切到主渠道 */
    autoRecover: boolean;
  };
  
  /** 负载均衡配置 */
  loadBalance?: {
    /** 均衡算法 */
    algorithm: "round-robin" | "weighted" | "least-loaded" | "random";
    /** 是否感知渠道配额剩余 */
    quotaAware: boolean;
  };
  
  /** 成本优化配置 */
  costOptimize?: {
    /** 价格来源 */
    priceSource: "model-metadata" | "custom";
    /** 自定义价格表 */
    customPrices?: Record<string, { input: number; output: number }>;
    /** 成本阈值（超过后切换渠道） */
    costThreshold?: number;
  };
}

interface HealthCheckConfig {
  /** 健康检查间隔（秒） */
  interval: number;
  
  /** 连续失败多少次后熔断 */
  failureThreshold: number;
  
  /** 熔断后多久尝试恢复（秒） */
  recoveryTimeout: number;
  
  /** 熔断后是否完全移除成员 */
  removeOnCircuitBreak: boolean;
}
```

### 3.2 运行时解析流程

```ts
interface ResolveVirtualChannelExecutionOptions {
  virtualChannel: VirtualChannelProfile;
  modelId: string;
  operation: LlmOperation;
  context?: {
    /** 上次请求失败的渠道 ID（用于故障转移） */
    lastFailedProfileId?: string;
    /** 当前会话已使用的渠道统计（用于负载均衡） */
    usageStats?: Record<string, number>;
  };
}

interface ResolvedVirtualChannelExecution {
  /** 选中的物理渠道 */
  selectedProfile: LlmProfile;
  
  /** 该物理渠道的模型执行路由 */
  execution: ResolvedModelExecution;
  
  /** 选择原因（用于日志和 Inspector） */
  selectionReason: string;
  
  /** 备选渠道（故障转移时使用） */
  fallbackProfiles?: LlmProfile[];
}

function resolveVirtualChannelExecution(
  options: ResolveVirtualChannelExecutionOptions
): ResolvedVirtualChannelExecution {
  // 1. 筛选可用成员渠道
  // 2. 根据策略排序或加权选择
  // 3. 检查健康状态和熔断状态
  // 4. 返回选中的物理渠道 + 备选列表
}
```

## 4. 与现有架构的集成点

### 4.1 渠道类型扩展

当前 `ProviderType` 都是物理渠道类型。需要区分：

```ts
type ChannelCategory = "physical" | "virtual";

interface LlmProfile {
  // ... existing fields
  category: ChannelCategory;  // 新增字段，区分物理渠道和虚拟渠道
  
  // 当 category === "physical" 时，type 是现有的 ProviderType
  // 当 category === "virtual" 时，type 固定为 "virtual"
  type: ProviderType | "virtual";
  
  // 当 category === "virtual" 时，必须有 virtualConfig
  virtualConfig?: VirtualChannelProfile;
}
```

### 4.2 请求入口改造

当前 `useLlmRequest.ts` 的核心流程：

```ts
// 当前实现（Phase 0–3）
const execution = resolveModelExecution({ profile, model, operation });
const adapter = adapters[execution.effectiveProfile.type];
const result = await adapter.request(...)
```

需要改造为：

```ts
// 支持虚拟渠道（Phase 6+）
let selectedProfile = profile;
let fallbackProfiles: LlmProfile[] = [];

if (profile.category === "virtual") {
  const resolved = resolveVirtualChannelExecution({
    virtualChannel: profile.virtualConfig!,
    modelId: model.id,
    operation,
    context: { lastFailedProfileId, usageStats },
  });
  selectedProfile = resolved.selectedProfile;
  fallbackProfiles = resolved.fallbackProfiles ?? [];
}

const execution = resolveModelExecution({
  profile: selectedProfile,
  model,
  operation,
});

const adapter = adapters[execution.effectiveProfile.type];

try {
  const result = await adapter.request(...);
  // 成功：记录统计
  recordChannelSuccess(selectedProfile.id);
  return result;
} catch (error) {
  // 失败：尝试 fallback
  if (fallbackProfiles.length > 0) {
    return await retryWithFallback(fallbackProfiles, model, operation);
  }
  throw error;
}
```

### 4.3 模型列表聚合

虚拟渠道的模型列表需要从成员渠道聚合：

```ts
function aggregateModelsForVirtualChannel(
  virtualChannel: VirtualChannelProfile,
  memberProfiles: LlmProfile[]
): LlmModelInfo[] {
  const allModels: LlmModelInfo[] = [];
  
  for (const member of virtualChannel.members) {
    if (!member.enabled) continue;
    
    const physicalProfile = memberProfiles.find(p => p.id === member.profileId);
    if (!physicalProfile) continue;
    
    let models = physicalProfile.models ?? [];
    
    // 应用成员的包含/排除过滤
    if (member.overrides?.includedModels) {
      models = models.filter(m => member.overrides!.includedModels!.includes(m.id));
    }
    if (member.overrides?.excludedModels) {
      models = models.filter(m => !member.overrides!.excludedModels!.includes(m.id));
    }
    
    // 为每个模型附加来源信息
    allModels.push(...models.map(m => ({
      ...m,
      _virtualChannelSource: {
        profileId: physicalProfile.id,
        profileName: physicalProfile.name,
        priority: member.priority,
      },
    })));
  }
  
  // 根据聚合策略去重和合并
  return deduplicateModels(allModels, virtualChannel.modelAggregation);
}
```

## 5. 与外部实现的对比

### 5.1 New API 的"渠道组"

New API 有 Channel Group 概念，但它主要用于：
- 组织和批量管理渠道
- 共享配额和限流
- 不涉及请求级的故障转移或负载均衡

AIO Hub 的虚拟渠道是**运行时编排**，不是管理分组。

### 5.2 OpenRouter 的自动路由

OpenRouter 提供了模型级的自动路由：
- 用户请求一个模型
- OpenRouter 自动选择可用的上游提供商
- 透明处理故障转移

但这是**服务端能力**，客户端无法配置策略。AIO Hub 的虚拟渠道是**客户端编排**，用户完全控制路由策略。

### 5.3 LangChain 的 Fallback

LangChain 有 `FallbackLLM` 模式：

```python
primary = ChatOpenAI()
fallback = ChatAnthropic()
llm = primary.with_fallbacks([fallback])
```

这与虚拟渠道的主备模式接近，但：
- LangChain 是代码级配置，AIO Hub 是 UI 可配置
- LangChain 无健康检查和熔断
- LangChain 不处理模型列表聚合

## 6. 实施复杂度分析

### 6.1 核心能力依赖

| 能力                   | 前置要求                     | 复杂度 |
| ---------------------- | ---------------------------- | ------ |
| 主备故障转移           | Phase 0–3 已实施             | 中     |
| 模型列表聚合           | 模型去重与合并逻辑           | 中     |
| 健康检查与熔断         | 后台任务调度、状态持久化     | 高     |
| 负载均衡（轮询/权重）  | 请求统计、状态管理           | 高     |
| 成本优化               | 模型元数据价格、计费统计     | 高     |
| 配额感知负载均衡       | 渠道配额 API 集成            | 极高   |

### 6.2 与现有功能的冲突

1. **模型选择器 UI**：当前假设"一个渠道 = 一份模型列表"，虚拟渠道打破这个假设。
2. **模型配置**：当前模型配置存储在 `profile.models`，虚拟渠道的模型是动态聚合的，无法直接持久化。
3. **Inspector 和日志**：需要同时展示"虚拟渠道 ID"和"实际使用的物理渠道 ID"。
4. **渠道包导入导出**：虚拟渠道依赖成员渠道，导出时需要一并导出依赖关系。

### 6.3 用户体验挑战

1. **配置复杂度**：虚拟渠道的配置项远多于物理渠道，用户容易困惑。
2. **调试困难**：请求失败时，用户需要知道是哪个物理渠道失败的，以及为什么选择了这个渠道。
3. **模型重名**：聚合后的模型列表中，用户无法直接看到某个模型来自哪个渠道（除非显式标注）。

## 7. 替代方案

### 7.1 方案 A：不引入虚拟渠道，在现有渠道内增加优先级

在 `LlmProfile` 内增加 `fallbackProfiles: string[]`：

```ts
interface LlmProfile {
  // ... existing fields
  fallbackProfiles?: string[];  // 备用渠道 ID 列表
}
```

优点：
- 实现简单，不需要新的渠道类型
- 向后兼容

缺点：
- 无法表达"多个渠道的模型聚合"
- 优先级配置分散在每个渠道，不利于管理
- 无法支持负载均衡和成本优化

### 7.2 方案 B：只实现最小的主备故障转移

不引入完整的虚拟渠道概念，只在请求层增加简单的 fallback 逻辑：

```ts
interface RequestOptions {
  fallbackProfiles?: LlmProfile[];  // 请求级的备用渠道
}
```

优点：
- 实现成本低
- 用户无需理解虚拟渠道概念

缺点：
- 每次请求都要手工传递 fallback 列表
- 无法在 UI 中持久化故障转移策略
- 无法支持健康检查和熔断

### 7.3 方案 C：只实现模型聚合，不实现故障转移

引入虚拟渠道，但只用于聚合模型列表，不改变请求逻辑：

```ts
interface VirtualChannelProfile {
  type: "virtual";
  members: { profileId: string }[];
  modelAggregation: ModelAggregationConfig;
  // 没有 routingStrategy
}
```

优点：
- 解决了"多渠道同名模型"的 UI 问题
- 不涉及运行时请求路由，实现简单

缺点：
- 无法容灾，用户仍需手工切换渠道
- 价值有限（用户可以手工在多个渠道间切换）

## 8. 推荐方向

### 8.1 短期（Phase 4–5）：不引入虚拟渠道

理由：
1. **Phase 0–3 刚完成**，模型执行路由还需要在实际使用中验证稳定性。
2. **Phase 4 聚合渠道**（New API / Sub2API / OpenCode Go）的需求更明确，应优先实施。
3. **虚拟渠道的价值尚未被用户验证**：目前没有用户明确提出"需要跨渠道容灾"的需求。
4. **实施复杂度高**：健康检查、熔断、负载均衡都需要后台任务和状态管理，与当前架构耦合深。

### 8.2 中期（Phase 6）：实现最小主备故障转移

如果用户反馈确实需要容灾，可以先实现**方案 A**（现有渠道内增加 `fallbackProfiles`）：

1. 在 `LlmProfile` 增加可选的 `fallbackProfiles: string[]`。
2. 在 `useLlmRequest` 捕获失败后，自动尝试 fallback 渠道。
3. 不引入新的渠道类型，不聚合模型列表。
4. 在 Inspector 和日志中记录实际使用的渠道。

**完成标准**：
- 主渠道限速或网络错误时，自动切换到备用渠道
- 用户可以在渠道设置中配置备用渠道列表
- 失败重试有明确的超时和次数限制
- 不自动跨协议重试（Phase 4.4 的约束仍然成立）

### 8.3 长期（Phase 7+）：完整的虚拟渠道

如果主备故障转移被验证有价值，且用户提出更复杂的需求（负载均衡、成本优化），再考虑引入完整的虚拟渠道：

1. 新增 `ProviderType = "virtual"`。
2. 实现模型列表聚合和去重。
3. 实现多种路由策略（主备、轮询、加权）。
4. 实现健康检查和熔断。
5. 提供专门的虚拟渠道配置 UI。

**前置条件**：
- 至少有 3 个以上用户明确提出跨渠道容灾或负载均衡需求
- Phase 4 聚合渠道已稳定运行
- 有足够的开发资源投入（预计 2–3 周）

## 9. 决策建议

**不建议在 Phase 4 引入虚拟渠道概念**。理由：

1. **需求不明确**：当前没有用户提出跨渠道容灾的强需求。
2. **Phase 4 已有明确目标**：New API / Sub2API / OpenCode Go 的接入价值更直接。
3. **实施风险高**：虚拟渠道需要改造模型选择器、Inspector、导入导出等多个模块。
4. **可以渐进**：如果未来确实需要，可以先实现简单的 fallback，再逐步演进到完整虚拟渠道。

**如果用户明确提出容灾需求**，推荐先实现**方案 A**（渠道内 fallback）：
- 增加 `LlmProfile.fallbackProfiles?: string[]`
- 在请求失败时自动重试备用渠道
- 不引入新的渠道类型，不聚合模型列表
- 实施成本低，风险可控

**Phase 4 应专注于聚合渠道类型**：
- 实现 `new-api` / `sub2api` / `aggregate-compatible` 渠道类型
- 复用现有的 `resolveModelExecution()` 路由解析
- 提供 OpenCode Go 预设作为验收样例

## 10. 遗留问题

1. **是否需要在模型列表中显示渠道来源**？
   - 如果不显示，用户无法区分同名模型来自哪个渠道
   - 如果显示，模型名称会变长，UI 体验变差

2. **虚拟渠道的模型配置如何持久化**？
   - 虚拟渠道的模型列表是动态聚合的，无法直接存储在 `profile.models`
   - 可能需要单独的 `virtualChannelModels` 存储

3. **是否允许虚拟渠道嵌套**？
   - 如果允许，一个虚拟渠道的成员可以是另一个虚拟渠道
   - 这会大幅增加复杂度，首期不建议支持

4. **如何处理成员渠道的模型列表变化**？
   - 成员渠道刷新模型列表后，虚拟渠道的聚合列表需要自动更新
   - 需要订阅机制或定期重新聚合

## 11. 参考资料

- Phase 0–3 实施记录：`docs/architecture/llm-execution-routing.md`
- 聚合渠道调查：`docs/Plan/llm-aggregate-channel-routing-investigation.md`
- LangChain Fallback: https://python.langchain.com/docs/how_to/fallbacks/
- OpenRouter Auto-routing: https://openrouter.ai/docs/routing

---

**调查结论**：不建议在当前阶段引入虚拟渠道。Phase 4 应专注于聚合渠道类型（New API / Sub2API）。如果未来确实需要容灾，优先实现简单的渠道级 fallback，而非完整的虚拟渠道编排层。
