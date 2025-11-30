# 添加新工具指南

本指南将引导你完成向 AIO Hub 添加新工具的全过程。

## 1. 准备工作

在开始之前，请确定你的工具类型：
- **纯前端工具**: 仅包含 UI 和前端逻辑（如 JSON 格式化）。
- **需要后端支持的工具**: 需要 Rust 后端命令支持（如文件操作、系统调用）。
- **Agent 工具**: 需要暴露给 LLM 使用的能力。

## 2. 创建目录结构

在 `src/tools/` 下创建一个新目录，建议结构如下：

```
src/tools/my-new-tool/
├── MyNewTool.vue      # 主 UI 组件（入口）
├── icon.vue           # (可选) 自定义图标
├── types.ts           # 类型定义
└── utils.ts           # 工具函数
```

> **注意**: 请使用具有辨识度的文件名（如 `MyNewTool.vue`）作为主组件，**不要使用 `index.vue`**，以便在编辑器标签页中快速区分不同工具。

## 3. 实现核心逻辑

### 3.1 编写 UI 组件 (`MyNewTool.vue`)

```vue
<script setup lang="ts">
import { ref } from 'vue';
// ...
</script>

<template>
  <div class="my-new-tool">
    <!-- 工具界面 -->
  </div>
</template>
```

### 3.2 定义工具类型 (`types.ts`) (可选)

如果你的工具有复杂的内部状态或 props，建议在 `types.ts` 中定义相关类型。

## 4. 注册工具

打开 `src/stores/tools.ts`，将你的工具配置直接添加到文件顶部的 `initialTools` 数组中。

**重要提示**:
- 为了优化应用启动性能，组件必须使用**动态导入** (`() => import(...)`)。
- 图标需要使用 `markRaw()` 包裹，以避免被 Vue 转换为响应式对象。

```typescript
// src/stores/tools.ts
import { markRaw } from 'vue';
import type { ToolConfig } from '@/services/types'; // 注意正确的类型路径
import { Braces } from 'lucide-vue-next';

// ...

// 找到 initialTools 数组
const initialTools: ToolConfig[] = [
  // ... 其他工具
  
  // 在合适的分类下添加你的工具配置
  {
    name: '我的新工具',
    path: '/my-new-tool',
    icon: markRaw(Braces), // 确保用 markRaw 包裹
    // 注意：直接导入 .vue 组件文件
    component: () => import('../tools/my-new-tool/MyNewTool.vue'),
    description: '这是一个很棒的新工具',
    category: '开发工具', // 现有分类：AI 工具, 文本处理, 文件管理, 开发工具
  },
];
```

## 5. (进阶) 注册为服务

如果你的工具需要暴露功能给 Agent 或其他工具调用，你需要将其注册为服务。项目采用**自动发现**机制来注册服务。

**核心约定**：
1.  在你的工具目录（例如 `src/tools/my-new-tool/`）下，创建一个名为 `my-new-tool.registry.ts` 的文件（文件名可自定义，但必须以 `.registry.ts` 结尾）。
2.  该文件必须 **默认导出 (export default)** 一个实现了 `ToolRegistry` 接口的 **类 (class)**。

系统会在启动时自动扫描并实例化这个类，完成注册。

下面是一个完整的示例：

```typescript
// src/tools/my-new-tool/my-new-tool.registry.ts

import type { ToolRegistry } from '@/services/types';

/**
 * 我的新工具服务类
 *
 * 这个类实现了 ToolRegistry 接口，使其能被系统自动发现和注册。
 * 它作为一个服务外壳，将工具的核心逻辑暴露给外部。
 */
class MyNewToolRegistry implements ToolRegistry {
  // 服务唯一标识符 (必填)
  public readonly id = 'my-new-tool-service';
  // 服务名称 (必填)
  public readonly name = '我的新工具';
  // 服务描述 (必填)
  public readonly description = '这是一个很棒的新工具的服务';

  /**
   * 一个示例服务方法
   * @param text 输入的文本
   * @returns 处理后的文本
   */
  public async doSomething(text: string): Promise<string> {
    // 在这里实现你的核心逻辑
    const processedText = `处理完成: ${text.toUpperCase()}`;
    console.log(`[${this.id}] 方法 'doSomething' 被调用`);
    return processedText;
  }

  /**
   * (推荐) 提供元数据供“服务注册表浏览器”展示
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'doSomething',
          description: '一个示例方法，将输入文本转换为大写',
          parameters: [
            {
              name: 'text',
              type: 'string',
              description: '要处理的输入文本',
              required: true,
            },
          ],
          returnType: 'Promise<string>',
          example: `
const result = await services['my-new-tool-service'].doSomething('hello');
console.log(result); // "处理完成: HELLO"
`,
        },
      ],
    };
  }
}

// 必须默认导出这个类
export default MyNewToolRegistry;

// (可选) 同时导出一个单例，方便在项目内其他模块直接、类型安全地调用
export const myNewToolService = new MyNewToolRegistry();

```

完成以上步骤后，你可以在“服务注册表浏览器”工具中验证你的服务是否已成功注册。

## 6. (进阶) 添加 Rust 后端命令

1.  在 `src-tauri/src/commands/` 下创建新的模块。
2.  在 `src-tauri/src/lib.rs` 中注册命令。
3.  在前端使用 `invoke` 调用。

## 7. 测试

1.  运行 `bun run dev`。
2.  在侧边栏找到你的工具。
3.  验证功能是否正常。
