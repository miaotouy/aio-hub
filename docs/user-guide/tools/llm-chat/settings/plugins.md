# 插件与扩展设置 (Plugins)

LLM Chat 采用了高度模块化的设计，第三方插件可以无缝集成到聊天设置中，提供额外的功能扩展。

## 1. 插件设置注入

当一个插件启用后，它可能会在聊天设置对话框中添加专属的配置分区。这通常包括：
- **API 密钥**: 插件所需的第三方服务授权。
- **自定义开关**: 开启或关闭插件的特定子功能。
- **参数微调**: 调整插件的运行时行为。

## 2. 插件与上下文管道

许多插件通过扩展[上下文管道处理器](../context-pipeline/processors)来发挥作用。例如：
- **翻译插件**: 注入一个翻译处理器，在消息渲染前自动调用 API。
- **搜索插件**: 扩展知识库处理器，支持实时网页搜索。

## 3. 开发者：如何注册插件设置？

如果你是开发者，可以通过 `registerSettingsSection` API 将你的设置项注入到聊天设置界面：

```typescript
import { registerSettingsSection } from "@/tools/llm-chat/composables/settings/usePluginSettings";

registerSettingsSection({
  title: "我的插件名称",
  icon: MyPluginIcon,
  items: [
    {
      id: "enableFeatureX",
      label: "启用功能 X",
      component: "ElSwitch", // 使用 Element Plus 组件
      modelPath: "plugins.myPlugin.featureX", // 绑定的数据路径
    },
  ],
});
```

注册后的设置项将自动出现在 **「聊天设置 -> 插件与扩展」** 分区中，并支持响应式更新。

---

### 相关阅读
- [上下文管道概览](../context-pipeline/index)
- [环境增强插件](../agents/editor-guide#3-环境增强-environment)