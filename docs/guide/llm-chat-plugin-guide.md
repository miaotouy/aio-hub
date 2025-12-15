# LLM Chat 插件开发指南

LLM Chat 是 AIO Hub 的核心模块之一，提供了强大的插件扩展能力。通过开发插件，你可以深度定制聊天体验，包括修改上下文、添加自定义设置、扩展 UI 等。

## 1. 聊天设置集成 (Chat Settings Integration)

插件可以将其配置项直接集成到 LLM Chat 的设置对话框中，无需让用户跳转到单独的插件设置页面。这提供了更一致的用户体验。

### 注册设置项

要在聊天设置对话框中添加你的插件配置，需要在插件的 `activate` 钩子或初始化逻辑中调用 `registerPluginSettings`。

```typescript
import { markRaw } from 'vue';
import { registerSettingsSection } from '@/tools/llm-chat/composables/usePluginSettings';
// 假设你有一个图标组件
import MyPluginIcon from './icons/MyPluginIcon.vue';

export function activate(context) {
  registerSettingsSection({
    title: '我的超级插件', // 设置分组的标题
    icon: markRaw(MyPluginIcon), // 设置分组的图标
    items: [
      {
        id: 'my-plugin.auto-translate', // 唯一 ID
        label: '自动翻译', // 显示名称
        type: 'switch', // 类型：switch, select, input, number, slider
        path: 'plugins.mySuperPlugin.autoTranslate', // 存储路径，建议使用 plugins.<插件ID>.<属性>
        default: false, // 默认值
        hint: '开启后，将自动翻译接收到的消息', // 提示信息
      },
      {
        id: 'my-plugin.language',
        label: '目标语言',
        type: 'select',
        path: 'plugins.mySuperPlugin.targetLanguage',
        default: 'en',
        options: [
          { label: '英语', value: 'en' },
          { label: '日语', value: 'ja' },
          { label: '法语', value: 'fr' },
        ],
        // 可选：控制显示条件
        visible: (settings) => settings.plugins?.mySuperPlugin?.autoTranslate === true,
      },
    ],
  });
}
```

### 支持的设置类型

目前支持以下设置项类型 (`type`)：

- **`switch`**: 开关按钮，对应 boolean 值。
- **`input`**: 文本输入框，对应 string 值。
- **`number`**: 数字输入框，对应 number 值。
- **`select`**: 下拉选择框，需要提供 `options` 数组。
- **`slider`**: 滑动条，需要提供 `min`, `max`, `step`。
- **`action`**: 按钮，点击触发 `action` 事件（需配合自定义逻辑）。

### 访问设置值

插件可以通过 `useChatSettings` composable 访问用户的设置值：

```typescript
import { useChatSettings } from '@/tools/llm-chat/composables/useChatSettings';

const { settings } = useChatSettings();

// 访问你的插件设置
const isAutoTranslateEnabled = settings.value.plugins?.mySuperPlugin?.autoTranslate;
```

## 2. 上下文管道 (Context Pipeline)

LLM Chat 使用 Context Pipeline 来处理消息和上下文。插件可以注册处理器来干预这个过程。

### 注册处理器

```typescript
export function activate(context) {
  context.chat.registerProcessor({
    id: 'my-plugin:add-footer',
    name: '添加页脚',
    description: '在消息末尾添加页脚',
    async execute(pipelineContext) {
      const lastMessage = pipelineContext.messages[pipelineContext.messages.length - 1];
      if (lastMessage) {
        lastMessage.content += '\n\n(Powered by My Plugin)';
      }
    },
  });
}
```

详细的 Context Pipeline 架构请参考 `docs/tools/llm-chat/design/context-pipeline-architecture.md`。

## 3. UI 组件扩展 (Coming Soon)

未来版本将支持插件注册自定义的消息渲染器、输入框扩展等 UI 组件。