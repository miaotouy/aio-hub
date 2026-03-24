# RFC: 工具注册系统多实例支持 (Tool Registry Multi-Instance Support)

**状态**: `RFC`  
**创建日期**: 2026-03-25  
**作者**: 咕咕  
**相关模块**: `src/services/registry.ts`, `src/services/types.ts`, `src/tools/tool-calling/`

---

## 1. 背景与动机

### 1.1. 当前问题

现有的工具注册系统采用**"单例注册"**模式：一个 `ToolRegistry` 类实例对应一个 `toolId`，通过 `getMetadata()` 返回该工具的所有方法。这种模式存在以下局限：

| 问题             | 描述                                    | 影响                                                      |
| ---------------- | --------------------------------------- | --------------------------------------------------------- |
| **粒度粗糙**     | 一个工具模块只能作为一个整体被启用/禁用 | 无法给不同 Agent 分配不同子集（如知识库的"只读"vs"管理"） |
| **扩展性差**     | 桥接层无法动态注册大量外部工具          | 每个外部工具都需要手动创建一个独立的 Registry 类          |
| **权限控制困难** | 无法在工具内部进行细粒度的权限隔离      | 只能通过 `methodToggles` 逐个方法控制，配置繁琐           |

### 1.2. 目标需求

1. **功能分组披露**：支持将一个大型工具（如知识库）的方法按功能逻辑拆分为多个逻辑实例（如 `kb-basic` 基础读写和 `kb-admin` 高级管理），实现渐进式能力披露。
2. **桥接层扩展**：支持外部工具桥接层动态注册成百上千个子工具，像"扩展坞"一样即插即用。
3. **向后兼容**：不破坏现有工具的注册逻辑，支持渐进式迁移。

---

## 2. 设计方案

### 2.1. 核心原则

- **共存渐进**：新增的"多实例注册"功能与现有的"单例注册"并存，通过新的导出方式隔离。
- **ID 扁平化**：每个子工具都有独立的 `toolId`，在配置和 UI 中作为独立工具对待。
- **最小侵入**：不修改 `ToolRegistry` 接口本身，只在注册管理层增加多实例支持。

### 2.2. 类型定义扩展

在 `src/services/types.ts` 中新增 `ToolRegistryFactory` 接口：

```typescript
/**
 * 工具注册工厂接口
 * 用于动态生成多个 ToolRegistry 实例，适用于桥接层等场景
 */
export interface ToolRegistryFactory {
  /**
   * 工厂标识符
   */
  readonly factoryId: string;

  /**
   * 创建并返回多个 ToolRegistry 实例
   */
  createRegistries(): Promise<ToolRegistry[]> | ToolRegistry[];
}

/**
 * 联合类型：工具注册项（单例或工厂）
 */
export type ToolRegistryItem = ToolRegistry | ToolRegistryFactory;
```

### 2.3. 注册管理器改造

在 `src/services/registry.ts` 中增强 `register` 方法：

```typescript
class ToolRegistryManager {
  // 新增：注册工厂的追踪（用于热重载时清理）
  private factories = new Map<string, ToolRegistryFactory>();
  private factoryToolIds = new Map<string, string[]>(); // factoryId -> toolIds[]

  public async register(...tools: (ToolRegistry | ToolRegistryFactory)[]): Promise<void> {
    for (const tool of tools) {
      // 判断是否为工厂
      if (this.isFactory(tool)) {
        await this.registerFactory(tool);
      } else {
        await this.registerSingle(tool);
      }
    }
  }

  private isFactory(tool: ToolRegistry | ToolRegistryFactory): tool is ToolRegistryFactory {
    return "factoryId" in tool && typeof (tool as ToolRegistryFactory).createRegistries === "function";
  }

  private async registerSingle(tool: ToolRegistry): Promise<void> {
    // 原有单例注册逻辑
    if (tool.initialize) {
      await tool.initialize();
    }
    this.registries.set(tool.id, tool);
  }

  private async registerFactory(factory: ToolRegistryFactory): Promise<void> {
    // 工厂注册逻辑
    const registries = await factory.createRegistries();
    const toolIds: string[] = [];

    for (const registry of registries) {
      if (registry.initialize) {
        await registry.initialize();
      }
      this.registries.set(registry.id, registry);
      toolIds.push(registry.id);
    }

    this.factories.set(factory.factoryId, factory);
    this.factoryToolIds.set(factory.factoryId, toolIds);
  }
}
```

### 2.4. 导出方式规范

#### 方式一：单例导出（现有方式，保持不变）

```typescript
// knowledge-base.registry.ts
class KnowledgeBaseRegistry implements ToolRegistry {
  public readonly id = "knowledge-base";
  // ...
}

export default KnowledgeBaseRegistry; // 默认导出类
```

#### 方式二：数组导出（新增，用于静态多实例）

```typescript
// knowledge-base.registry.ts (重构后)
const kbBasic: ToolRegistry = {
  id: "kb-basic",
  name: "知识库",
  description: "知识库的日常读写操作",
  getMetadata: () => ({
    methods: [
      /* 搜索、写入、更新内容方法 */
    ],
  }),
};

const kbAdmin: ToolRegistry = {
  id: "kb-admin",
  name: "知识库 (管理)",
  description: "知识库的高级管理操作",
  getMetadata: () => ({
    methods: [
      /* 增删改方法 */
    ],
  }),
};

// 导出数组
export default [kbBasic, kbAdmin];
```

#### 方式三：工厂导出（新增，用于动态桥接）

```typescript
// external-bridge/bridge.registry.ts
export default class ExternalBridgeFactory implements ToolRegistryFactory {
  public readonly factoryId = "external-bridge";

  async createRegistries(): Promise<ToolRegistry[]> {
    const externalTools = await this.fetchExternalTools();
    return externalTools.map((tool) => ({
      id: `ext-${tool.id}`,
      name: tool.name,
      description: tool.description,
      getMetadata: () => ({ methods: tool.methods }),
      // 统一转发执行逻辑
      [tool.methodName]: async (args: Record<string, unknown>) => {
        return this.forwardToExternal(tool.id, tool.methodName, args);
      },
    }));
  }

  private async fetchExternalTools(): Promise<ExternalTool[]> {
    // 从配置文件、API 或插件目录加载
    return [];
  }

  private async forwardToExternal(toolId: string, methodName: string, args: Record<string, unknown>): Promise<unknown> {
    // 转发到外部工具
    return {};
  }
}
```

### 2.5. 主注册流程改造

在 `src/main.ts` 或工具注册入口处，需要适配新的导出格式：

```typescript
// 假设 tools 是通过 Vite.glob 导入的所有 registry 文件
for (const [path, module] of Object.entries(tools)) {
  const exported = module.default;

  if (Array.isArray(exported)) {
    // 数组导出：直接注册
    await toolRegistryManager.register(...exported);
  } else if (typeof exported === "function") {
    // 可能是类构造函数或工厂类
    const instance = new exported();
    await toolRegistryManager.register(instance);
  } else if (exported && typeof exported === "object") {
    // 直接导出的对象实例
    await toolRegistryManager.register(exported);
  }
}
```

---

## 3. 使用示例

### 3.1. 知识库分组示例 (功能分组披露)

**改造前**：

```typescript
// 一个工具，所有方法混在一起，难以按需分配
toolToggles: { "knowledge-base": true }
```

**改造后**：

```typescript
// 两个逻辑工具，按功能组分配给不同 Agent
toolToggles: {
  "kb-basic": true,  // 基础读写，常驻 Agent 使用
  "kb-admin": false   // 高级管理，仅管理员 Agent 开启
}
```

### 3.2. 桥接层示例

假设我们要对接外部工具平台（如 Zapier、n8n 等）：

```typescript
// src/tools/zapier-bridge/zapier-bridge.registry.ts
export default class ZapierBridgeFactory implements ToolRegistryFactory {
  public readonly factoryId = "zapier-bridge";

  async createRegistries(): Promise<ToolRegistry[]> {
    // 从 Zapier API 拉取已配置的 Zaps
    const zaps = await fetchZaps();

    return zaps.map((zap) => ({
      id: `zapier-${zap.id}`,
      name: zap.name,
      description: `Zapier 自动化：${zap.description}`,
      getMetadata: () => ({
        methods: [
          {
            name: "execute",
            displayName: "执行",
            description: "触发此 Zap",
            parameters: zap.inputFields.map((f) => ({
              name: f.key,
              type: f.type,
              required: f.required,
            })),
            agentCallable: true,
          },
        ],
      }),
      execute: async (args: Record<string, unknown>) => {
        return triggerZap(zap.id, args);
      },
    }));
  }
}
```

---

## 4. 迁移计划

### 4.1. 阶段一：基础设施改造（本次 RFC 范围）

- [x] 修改 `src/services/types.ts`，新增 `ToolRegistryFactory` 接口
- [x] 修改 `src/services/registry.ts`：
  - [x] 增强 `register` 方法支持多实例与工厂注册
  - [x] **[优化]** 增加 ID 冲突检查，防止静默覆盖
  - [x] **[优化]** 增加 `unregisterFactory(factoryId)`，支持按工厂批量注销（优化热重载）
- [x] 修改主注册流程（如 `src/services/auto-register.ts`），适配数组/工厂等多种导出格式
- [x] 重构 `knowledge-base.registry.ts` 作为示范

### 4.2. 阶段二：工具调用系统适配

- [ ] 更新 `ToolCallConfig` 的文档注释，说明支持多实例工具
- [ ] 在 `ToolCallingTester` 中展示工厂注册的工具
- [ ] 验证 `discovery.ts` 能正确发现多实例工具（应该无需修改，因为是基于 `getAllTools()` 扫描）

### 4.3. 阶段三：桥接层实现（后续 RFC）

- [ ] 设计外部工具配置格式（YAML/JSON）
- [ ] 实现通用桥接层框架
- [ ] 实现第一个桥接器（如 Zapier/n8n）

---

## 5. 风险与缓解

| 风险             | 影响 | 缓解措施                                                                         |
| ---------------- | ---- | -------------------------------------------------------------------------------- |
| 现有工具不兼容   | 低   | 保持向后兼容，单例导出方式不变                                                   |
| 工厂动态注册失败 | 中   | 在 `registerFactory` 中添加错误处理，失败时回滚已注册的子工具                    |
| 工具 ID 冲突     | 高   | **强制检查**：在 `register` 过程中若发现 ID 已存在且非热重载覆盖，则抛出异常中断 |
| 热重载资源泄漏   | 中   | 实现 `unregisterFactory` 确保工厂产出的所有子工具实例都被正确 `dispose`          |

---

## 6. 验收标准

1. **知识库分组**：`kb-reader` 和 `kb-admin` 作为两个独立工具出现在工具列表中，可独立启用/禁用。
2. **向后兼容**：现有单例导出的工具（如 `directory-tree`）仍能正常注册和运行。
3. **工厂注册**：创建一个测试工厂，验证能动态注册多个子工具。
4. **工具调用**：LLM 能正确发现和调用多实例工具的方法。

---

## 7. 附录：相关文件清单

| 文件                                                  | 变更类型 | 说明                            |
| ----------------------------------------------------- | -------- | ------------------------------- |
| `src/services/types.ts`                               | 修改     | 新增 `ToolRegistryFactory` 接口 |
| `src/services/registry.ts`                            | 修改     | 增强 `register` 方法，支持工厂  |
| `src/main.ts` (或注册入口)                            | 修改     | 适配数组/工厂导出               |
| `src/tools/knowledge-base/knowledge-base.registry.ts` | 重构     | 实现功能分组披露 (Basic/Admin)  |
| `src/tools/tool-calling/core/discovery.ts`            | 无需修改 | 基于 `getAllTools()` 自动兼容   |
| `src/tools/tool-calling/core/executor.ts`             | 无需修改 | 路由逻辑不变                    |

---

**审批记录**:

- [x] 方案讨论完成 (2026-03-25)
- [x] 架构审批通过
- [x] 实施完成
