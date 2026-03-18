# 插件系统升级设计：结构化钩子、动态注入与依赖管理

## 1. 设计哲学

本项目插件系统遵循 **"结构化接口保底，动态 Patch 赋能"** 的原则。
借鉴油猴 (Tampermonkey) 的灵活性与 Minecraft Forge 的有序性，为开发者提供不同层级的扩展能力。

| 层级                 | 机制                     | 稳定性 | 灵活性 | 适用场景                   |
| -------------------- | ------------------------ | ------ | ------ | -------------------------- |
| **L1: 结构化钩子**   | `hooks.tap()`            | 极高   | 低     | 核心数据加工、拦截关键逻辑 |
| **L2: UI 占位符**    | `<ExtensionPoint />`     | 高     | 中     | 在预留位置注入按钮、面板   |
| **L3: Service 代理** | `patch(service, method)` | 中     | 高     | 官方未预留钩子时的"魔改"   |
| **L4: 自由注入**     | 全局 CSS / DOM Patch     | 低     | 极高   | 深度修改样式、强行注入 DOM |

## 2. 依赖管理 (Dependency Management)

确保插件按正确顺序加载，解决"魔改"插件之间的冲突。

### 2.1 Manifest 扩展

```json
{
  "dependencies": { "chat-core": ">=1.0.0" },
  "optionalDependencies": { "theme-manager": "*" },
  "incompatibleWith": ["old-chat-plugin"]
}
```

### 2.2 拓扑排序加载

修改 `PluginLoader`，在 `activate` 前构建依赖图并执行拓扑排序。确保被依赖的插件先初始化，且其 API 已暴露。

## 3. 核心扩展机制

### 3.1 L1: 结构化钩子系统 (Hook System)

用于宿主主动预留的扩展点。

- **Waterfall**: 数据加工（如：修改发送的消息文本）。
- **Bail**: 逻辑拦截（如：前置权限检查，返回 false 则中断操作）。
- **Sync**: 事件广播（如：应用启动完成）。

### 3.2 L3: Service Patch (Monkey Patch API)

这是本次升级的重点。插件可以直接拦截宿主内部 Service 的方法。

```typescript
// 插件代码示例
export function activate(context) {
  // 拦截 chatStore 的 sendMessage 方法
  context.patch("chatStore", "sendMessage", async (original, ...args) => {
    console.log("拦截到发送请求:", args);
    // 执行原逻辑
    return await original(...args);
  });
}
```

**实现原理**：宿主 Service 在注入插件上下文前，通过 `Proxy` 包装。

### 3.3 L4: 自由注入 (Oil Monkey Style)

#### 全局 CSS 注入

在 `manifest.json` 中声明：

```json
"contributes": {
  "stylesheets": ["style.css"]
}
```

#### DOM Patch (MutationObserver 辅助)

插件可以使用宿主提供的工具函数，在特定 DOM 出现时挂载组件。

```typescript
context.ui.observe(".chat-input-area", (el) => {
  const div = document.createElement("div");
  el.appendChild(div);
  context.ui.mount(MyPluginComponent, div);
});
```

## 4. PluginContext API 预览

```typescript
interface PluginContext {
  // --- L1: 钩子 ---
  hooks: {
    tap: (name: string, handler: Function, options?: { priority: number }) => void;
  };

  // --- L3: 魔改 ---
  /** 拦截并替换宿主 Service 的方法 */
  patch: (serviceName: string, methodName: string, handler: PatchHandler) => void;
  /** 获取宿主 Service 实例 (只读或 Proxy) */
  host: {
    getService: <T>(name: string) => T;
  };

  // --- L2: UI 插槽 ---
  ui: {
    /** 在预留的 ExtensionPoint 注入组件 */
    registerSlot: (slotId: string, component: any, props?: any) => void;
    /** 注入全局样式 */
    injectStyle: (css: string) => void;
    /** 在指定选择器出现时执行回调 */
    observe: (selector: string, callback: (el: HTMLElement) => void) => void;
    /** 手动挂载 Vue 组件 */
    mount: (component: any, container: HTMLElement, props?: any) => void;
  };
}

/**
 * 类型扩展示例 (Declaration Merging)
 * 允许核心模块定义 Service 类型，提供插件开发提示
 */
declare global {
  interface HostServices {
    // 由各核心模块扩展，如：
    // chatStore: ChatStoreInstance;
  }
}
```

## 5. 冲突处理与洋葱模型 (Conflict Resolution)

当多个插件 Patch 同一个方法时，系统遵循**洋葱模型**：

1. **执行顺序**：根据拓扑排序结果，依赖图顶层的插件（被依赖最少的）处于洋葱最外层。
2. **传递责任**：每个 Patch 处理器接收 `original` 参数。插件**必须**决定是否调用 `await original(...args)`。
3. **隔离性**：如果插件 A 崩溃，`Proxy` 内部的 `try...catch` 会自动回退到 `original` 逻辑，确保后续插件和宿主功能不受阻断。

## 6. 自动清理与容错 (Safety & Fault Tolerance)

为了防止插件卸载后留下"烂摊子"以及单个插件崩溃导致系统白屏：

1. **Hook/Patch 自动撤销**：插件注销时，`PluginManager` 自动清理该插件关联的 `Proxy` 拦截器和 `Hook` 监听器。
2. **Error Boundary**：所有插件生命周期函数（`activate`）和回调（`tap`/`patch`/`observe`）均运行在宿主的错误边界内。
3. **循环依赖检测**：`PluginLoader` 在加载前执行 DAG 环路检测。若存在 `A -> B -> A` 的依赖，将拒绝加载相关插件并记录错误堆栈。
4. **DOM/样式清理**：注入的 `<style>` 标签和挂载的 Vue 实例在 `deactivate` 时自动销毁。

## 7. 实施路线图

1. **Phase 1 (地基)**: 实现 `PluginLoader` 的拓扑排序。
2. **Phase 2 (魔改)**: 实现 `context.patch` 和 `context.host` 的 Service 代理机制。
3. **Phase 3 (钩子)**: 引入轻量级 `HookRegistry`。
4. **Phase 4 (油猴)**: 提供 `context.ui.observe` 等 DOM 辅助工具。
5. **Phase 5 (适配)**: 改造 `llm-chat` 等核心模块，暴露关键 Service。
