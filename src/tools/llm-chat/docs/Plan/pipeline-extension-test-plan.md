# 上下文管道扩展与 UI 动态注入测试计划

> 创建时间：2026-07-11
> 状态：Implementing (实施中)

本计划旨在测试和验证 `llm-chat` 的上下文管道（Context Pipeline）扩展能力，以及聊天设置（Chat Settings）的 UI 动态注入能力。通过实现一个“句式改写测试插件”，打通插件系统与聊天核心模块的深度交互。

## 1. 目标与研究方向

- **上下文管道扩展**：验证外部插件是否能动态注册自定义的 `ContextProcessor`，并在消息发送给 LLM 之前对上下文进行拦截、修改和日志记录。
- **UI 动态注入**：激活并测试 `llm-chat` 尘封已久的 `usePluginSettings` 动态设置注入系统，允许插件直接将自己的配置项注入到“聊天设置”对话框中，实现无缝的 UI 扩充。
- **配置闭环**：验证插件在运行时能否正确读取用户在聊天设置中配置的最新值，并实时应用到管道处理器中。

## 2. 架构设计与修改点

### 2.1. 宿主应用插件系统扩展

目前 `PluginContext` 尚未暴露设置注入 API。我们需要在 `PluginContext` 中暴露 `registerSettingsSection` 和 `registerSettingItem`。

#### 修改文件 1：[`src/services/plugin-types.ts`](src/services/plugin-types.ts)

在 `PluginContext` 的 `chat` 属性中增加 API 声明：

```typescript
export interface PluginContext {
  // ...
  chat: {
    registerProcessor: (processor: any) => void;
    unregisterProcessor: (processorId: string) => void;
    /**
     * 动态注册聊天设置分区
     */
    registerSettingsSection: (section: any) => void;
    /**
     * 动态注册聊天设置项
     */
    registerSettingItem: (sectionTitle: string, item: any) => void;
  };
}
```

#### 修改文件 2：[`src/services/plugin-manager.ts`](src/services/plugin-manager.ts)

在 `createPluginContext` 中实现这两个方法，桥接到 `llm-chat` 的 `usePluginSettings`：

```typescript
import {
  registerSettingsSection,
  registerSettingItem,
} from "@/tools/llm-chat/composables/settings/usePluginSettings";

// 在 createPluginContext(pluginId) 内部：
chat: {
  registerProcessor: (processor: any) => {
    contextPipelineStore.registerProcessor(processor);
  },
  unregisterProcessor: (processorId: string) => {
    contextPipelineStore.unregisterProcessor(processorId);
  },
  registerSettingsSection: (section: any) => {
    logger.info(`插件正在注册聊天设置分区: ${section.title} (Plugin: ${pluginId})`);
    registerSettingsSection(section);
  },
  registerSettingItem: (sectionTitle: string, item: any) => {
    logger.info(`插件正在向分区 "${sectionTitle}" 注册设置项: ${item.id} (Plugin: ${pluginId})`);
    registerSettingItem(sectionTitle, item);
  }
}
```

### 2.2. 测试插件设计 (`example-pipeline-extension`)

在 `plugins/` 目录下创建测试插件 `example-pipeline-extension`：

#### 1. 清单文件 `manifest.json`

```json
{
  "id": "example-pipeline-extension",
  "name": "句式改写测试插件",
  "version": "1.0.0",
  "description": "测试上下文管道扩展与聊天设置 UI 动态注入能力的示例插件",
  "author": "Gugu_Kilo",
  "icon": "🔄",
  "tags": ["测试", "管道扩展", "UI注入"],
  "host": {
    "appVersion": ">=0.5.1",
    "apiVersion": 2
  },
  "type": "javascript",
  "main": "index.ts",
  "permissions": []
}
```

#### 2. 插件实现 `index.ts`

在 `activate` 时动态注入设置项和管道处理器：

```typescript
import { type PluginContext } from "aiohub-sdk";
import { markRaw } from "vue";
import { RefreshCw } from "lucide-vue-next"; // 导入图标

const PROCESSOR_ID = "plugin:example-pipeline-extension:sentence-rewriter";

export async function activate(context: PluginContext) {
  console.log("句式改写测试插件已激活");

  // 1. 动态注入聊天设置分区
  context.chat.registerSettingsSection({
    title: "句式改写测试",
    icon: markRaw(RefreshCw),
    items: [
      {
        id: "sentence-rewriter-enabled",
        label: "启用句式改写",
        component: "ElSwitch",
        modelPath: "plugins.sentenceRewriter.enabled",
        hint: "是否启用特定句式的自动改写",
        defaultValue: true,
        layout: "inline",
        keywords: "sentence rewriter enabled 句式改写 启用",
      },
      {
        id: "sentence-rewriter-pattern",
        label: "匹配正则表达式",
        component: "ElInput",
        modelPath: "plugins.sentenceRewriter.pattern",
        hint: "用于匹配消息的正则表达式（支持捕获组）",
        defaultValue: "不是(.*?)，而是(.*?)",
        layout: "block",
        props: {
          placeholder: "请输入正则表达式",
        },
        keywords: "sentence rewriter pattern 正则 匹配",
      },
      {
        id: "sentence-rewriter-replacement",
        label: "替换句式模板",
        component: "ElInput",
        modelPath: "plugins.sentenceRewriter.replacement",
        hint: "替换后的句式模板（支持 $1, $2 引用捕获组）",
        defaultValue: "与其说是$1，毋宁说是$2",
        layout: "block",
        props: {
          placeholder: "请输入替换模板",
        },
        keywords: "sentence rewriter replacement 替换 模板",
      },
      {
        id: "sentence-rewriter-roles",
        label: "作用消息角色",
        component: "ElSelect",
        modelPath: "plugins.sentenceRewriter.targetRoles",
        hint: "该改写规则作用于哪些角色的消息",
        defaultValue: ["user"],
        layout: "block",
        props: {
          multiple: true,
          placeholder: "请选择作用角色",
        },
        options: [
          { label: "用户 (user)", value: "user" },
          { label: "助手 (assistant)", value: "assistant" },
          { label: "系统 (system)", value: "system" },
        ],
        keywords: "sentence rewriter roles 角色 作用",
      },
    ],
  });

  // 2. 注册上下文管道处理器
  context.chat.registerProcessor({
    id: PROCESSOR_ID,
    name: "句式改写处理器",
    description: "检测消息中的特定句式并进行改写替换。",
    priority: 210, // 紧跟在系统正则处理器 (200) 之后
    execute: async (pipelineContext: any) => {
      // 从聊天设置中读取插件配置
      const config = pipelineContext.settings.plugins?.sentenceRewriter || {};
      const enabled = config.enabled !== false; // 默认为 true
      const patternStr = config.pattern || "不是(.*?)，而是(.*?)";
      const replacement = config.replacement || "与其说是$1，毋宁说是$2";
      const targetRoles = config.targetRoles || ["user"];

      if (!enabled) {
        return;
      }

      const messages = pipelineContext.messages;
      if (!messages || messages.length === 0) return;

      let replacementsCount = 0;

      for (const message of messages) {
        if (!targetRoles.includes(message.role)) {
          continue;
        }

        let originalContent = "";
        if (typeof message.content === "string") {
          originalContent = message.content;
        } else if (Array.isArray(message.content)) {
          const textPart = message.content.find((p: any) => p.type === "text");
          if (textPart && typeof textPart.text === "string") {
            originalContent = textPart.text;
          }
        }

        if (!originalContent) continue;

        try {
          const regex = new RegExp(patternStr, "g");
          if (regex.test(originalContent)) {
            const newContent = originalContent.replace(regex, replacement);

            if (newContent !== originalContent) {
              replacementsCount++;

              // 写回内容
              if (typeof message.content === "string") {
                message.content = newContent;
              } else if (Array.isArray(message.content)) {
                const textPart = message.content.find(
                  (p: any) => p.type === "text"
                );
                if (textPart) textPart.text = newContent;
              }

              // 记录精美的对比日志到上下文分析器中
              pipelineContext.logs.push({
                processorId: PROCESSOR_ID,
                level: "info",
                message: `成功改写 [${message.role}] 消息句式`,
                details: {
                  original: originalContent,
                  modified: newContent,
                  pattern: patternStr,
                  replacement: replacement,
                },
              });
            }
          }
        } catch (e) {
          pipelineContext.logs.push({
            processorId: PROCESSOR_ID,
            level: "error",
            message: `执行句式改写失败: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      }

      if (replacementsCount > 0) {
        console.log(`[句式改写] 共改写了 ${replacementsCount} 处句式`);
      }
    },
  });
}

export async function deactivate() {
  console.log("句式改写测试插件已停用");
}
```

## 3. 验证与测试方法

1. **启用插件**：在“插件管理器”中启用 `example-pipeline-extension` 插件。
2. **验证 UI 注入**：打开聊天窗口，点击右上角“聊天设置”，验证是否在最下方（或标签页中）成功渲染了“句式改写测试”分区，且包含 4 个配置项。
3. **修改配置**：在聊天设置中，修改匹配正则或替换模板，验证自动保存是否生效。
4. **发送测试消息**：
   - 发送一条消息：“我今天吃的不是苹果，而是香蕉。”
   - 验证 LLM 接收到的上下文是否已被改写为：“我今天吃的与其说是苹果，毋宁说是香蕉。”
5. **验证日志**：打开“上下文分析器”，查看 `句式改写处理器` 输出的对比日志，确保改写过程透明、可追溯。
