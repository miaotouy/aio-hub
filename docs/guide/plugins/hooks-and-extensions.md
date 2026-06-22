# 钩子与扩展系统 (Hook & Patch System)

为了给开发者提供不同层级的扩展能力，AIO Hub 引入了**"结构化接口保底，动态 Patch 赋能"**的插件钩子与动态注入系统。

| 层级                 | 机制                     | 稳定性 | 灵活性 | 适用场景                     |
| :------------------- | :----------------------- | :----- | :----- | :--------------------------- |
| **L1: 结构化钩子**   | `hooks.tap()`            | 极高   | 低     | 核心数据加工、拦截关键逻辑   |
| **L2: UI 占位符**    | `registerSlot()`         | 高     | 中     | 在预留位置注入按钮、面板     |
| **L3: Service 代理** | `patch(service, method)` | 中     | 高     | 官方未预留钩子时的"魔改"拦截 |
| **L4: 自由注入**     | 全局 CSS / DOM Patch     | 低     | 极高   | 深度修改样式、强行注入 DOM   |

## 依赖管理与拓扑排序

为了解决"魔改"插件之间的冲突，并确保插件按正确顺序加载，你可以在 `manifest.json` 中声明依赖关系：

```json
{
  "id": "my-advanced-plugin",
  "dependencies": {
    "chat-core": ">=1.0.0"
  },
  "optionalDependencies": {
    "theme-manager": "*"
  },
  "incompatibleWith": ["old-chat-plugin"]
}
```

主应用的插件加载器在激活插件前会构建依赖图并执行**拓扑排序**，确保被依赖的插件先初始化，且其 API 已暴露。同时，系统会自动执行 **DAG 环路检测**，若存在循环依赖（如 `A -> B -> A`）将拒绝加载并记录错误。

## L1: 结构化钩子系统 (Hook System)

用于宿主主动预留的扩展点，支持三种类型的钩子：

- **Waterfall**: 数据加工（如：修改发送的消息文本）
- **Bail**: 逻辑拦截（如：前置权限检查，返回 `false` 则中断操作）
- **Sync**: 事件广播（如：应用启动完成）

### 注册钩子示例

```typescript
export default {
  activate(context: PluginContext) {
    // 注册一个消息发送前置处理器
    context.hooks.tap(
      "beforeSendMessage",
      async (message) => {
        // 加工数据并返回
        message.text = message.text.trim();
        return message;
      },
      { priority: 100 } // 支持设置优先级
    );
  },
};
```

## L2: UI 插槽系统 (UI Slot System)

允许插件在主应用预留的 `ExtensionPoint` 占位符处动态注入自定义的 Vue 组件。

```typescript
import MyButton from "./components/MyButton.vue";

export default {
  activate(context: PluginContext) {
    // 在聊天输入区工具栏注入一个自定义按钮
    context.ui.registerSlot("chat-input-toolbar", MyButton, {
      customProp: "value",
    });
  },
};
```

## L3: Service Patch (Monkey Patch API)

这是最强大的"魔改"能力。插件可以直接拦截并替换宿主内部 Service 的方法。

```typescript
export default {
  activate(context: PluginContext) {
    // 拦截 chatStore 的 sendMessage 方法
    context.patch("chatStore", "sendMessage", async (original, ...args) => {
      console.log("拦截到发送请求，参数为:", args);

      // 执行原逻辑（洋葱模型）
      const result = await original(...args);

      console.log("发送完成，结果为:", result);
      return result;
    });
  },
};
```

### 冲突处理与洋葱模型

当多个插件 Patch 同一个方法时，系统遵循**洋葱模型**：

1. **执行顺序**: 根据拓扑排序结果，依赖图顶层的插件（被依赖最少的）处于洋葱最外层。
2. **传递责任**: 每个 Patch 处理器接收 `original` 参数。插件**必须**决定是否调用 `await original(...args)`。
3. **隔离性**: 如果某个插件的 Patch 崩溃，内部的 `try...catch` 会自动回退到 `original` 逻辑，确保后续插件和宿主功能不受阻断。

## L4: 自由注入 (Oil Monkey Style)

### 全局 CSS 注入

在 `manifest.json` 中声明样式表，系统会在加载时自动注入：

```json
"contributes": {
  "stylesheets": ["style.css"]
}
```

### DOM Patch (MutationObserver 辅助)

插件可以使用宿主提供的工具函数，在特定 DOM 元素出现时挂载自定义组件或注入样式：

```typescript
import MyFloatingPanel from "./components/MyFloatingPanel.vue";

export default {
  activate(context: PluginContext) {
    // 注入全局样式
    context.ui.injectStyle(`
      .my-custom-highlight {
        border: 2px solid var(--el-color-primary);
      }
    `);

    // 监听特定 DOM 出现并挂载组件
    context.ui.observe(".chat-input-area", (el) => {
      const container = document.createElement("div");
      el.appendChild(container);

      // 手动挂载 Vue 组件
      context.ui.mount(MyFloatingPanel, container, {
        title: "快捷面板",
      });
    });
  },
};
```

## 自动清理与容错机制

为了防止插件卸载后留下"烂摊子"，系统提供了完善的自动清理机制：

- **自动撤销**: 插件注销（`deactivate`）时，系统会自动清理该插件关联的所有 `Proxy` 拦截器、`Hook` 监听器、注入的 `<style>` 标签以及挂载的 Vue 实例。
- **错误边界 (Error Boundary)**: 所有插件生命周期函数（`activate`）和回调（`tap`/`patch`/`observe`）均运行在宿主的错误边界内，单个插件崩溃绝不会导致主应用白屏。

## 下一步

- 想处理耗时任务并展示进度？请参阅 [异步任务与进度汇报](./async-tasks.md)
- 想了解 JS 插件的基础结构？请参阅 [JavaScript 插件开发](./js-plugin.md)
