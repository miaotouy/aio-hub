# SettingItemRenderer 全局化重构计划

## 1. 背景与动机

### 1.1 现状分析

当前 `SettingItemRenderer.vue` 位于 `src/tools/llm-chat/components/settings/` 目录下，是一个**声明式配置驱动的表单渲染器**。它通过 `SettingItem` schema 定义来动态生成配置界面，具备以下核心能力：

- **多组件支持**：Switch, Slider, Select, Radio, Input, InputNumber 等
- **复合组件**：`SliderWithInput`（滑块+数字输入联动）
- **布局控制**：Inline（行内）/ Block（块级）两种布局模式
- **懒加载折叠**：大型编辑器组件的按需加载
- **模板字符串**：支持 `{{ localSettings.xxx }}` 动态标签
- **高亮定位**：配合搜索功能的设置项高亮

### 1.2 问题

1. **耦合性**：类型定义 `SettingItem` 强依赖 `ChatSettings` 类型
2. **复用受限**：其他工具（如 `TranscriptionSettings.vue`）无法直接使用
3. **重复代码**：`TranscriptionSettings.vue` 等文件存在大量手写的重复配置 UI

### 1.3 收益

- **代码复用**：所有工具共享统一的配置渲染逻辑
- **UI 一致性**：统一的间距、Hint 样式、高亮逻辑
- **维护成本降低**：修改一处，全局生效

---

## 2. 重构目标

将 `SettingItemRenderer` 及相关组件提升为全局通用组件，实现：

1. **类型解耦**：移除对 `ChatSettings` 的强依赖
2. **组件映射可扩展**：支持外部注入自定义组件
3. **向后兼容**：不破坏现有 `llm-chat` 功能

---

## 3. 文件迁移计划

### 3.1 迁移清单

| 原路径                                                           | 目标路径                                        | 说明               |
| ---------------------------------------------------------------- | ----------------------------------------------- | ------------------ |
| `src/tools/llm-chat/components/settings/settings-types.ts`       | `src/types/settings-renderer.ts`                | 类型定义           |
| `src/tools/llm-chat/components/settings/SettingItemRenderer.vue` | `src/components/common/SettingItemRenderer.vue` | 核心渲染器         |
| `src/tools/llm-chat/components/settings/PromptEditor.vue`        | `src/components/common/PromptEditor.vue`        | 通用 Prompt 编辑器 |

### 3.2 保留原位置的文件

以下文件保持在 `llm-chat` 工具内，因为它们是业务特定的：

- `settingsConfig.ts` - llm-chat 专用的配置定义
- `PipelineConfig.vue` - 上下文管道配置（业务组件）
- `ChatRegexEditor.vue` - 正则编辑器（业务组件）

---

## 4. 类型重构

### 4.1 当前类型定义

```typescript
// settings-types.ts (当前)
import type { ChatSettings } from "../../types/settings";

export interface SettingItem {
  // ...
  props?: Record<string, any> | ((settings: ChatSettings) => Record<string, any>);
  options?: OptionDef[] | ((settings: ChatSettings) => OptionDef[]);
  visible?: (settings: ChatSettings) => boolean;
}
```

### 4.2 重构后类型定义

```typescript
// src/types/settings-renderer.ts (重构后)
import type { Component } from "vue";

/**
 * 内置组件类型枚举
 * 大型业务组件应通过 defineAsyncComponent 异步加载后直接作为 Component 对象传入
 */
export type BuiltinSettingComponent =
  | "ElSwitch"
  | "ElSlider"
  | "ElRadioGroup"
  | "ElSelect"
  | "ElInputNumber"
  | "ElInput"
  | "SliderWithInput"
  | "PromptEditor"
  | "FileSelector";

/**
 * 选项定义
 */
export interface SettingOption {
  label: string;
  value: string | number | boolean;
  tags?: string[];
  description?: string;
}

/**
 * 设置项定义 - 泛型版本
 * @template T 设置对象的类型，默认为 Record<string, any>
 */
export interface SettingItem<T = Record<string, any>> {
  /** 设置项唯一标识符 */
  id: string;
  /** 显示标签，支持模板字符串 {{ localSettings.xxx }} */
  label: string;
  /** 布局类型 */
  layout?: "inline" | "block";
  /** 渲染组件 */
  component: BuiltinSettingComponent | Component;
  /** 组件 props，支持静态对象或动态函数 */
  props?: Record<string, any> | ((settings: T) => Record<string, any>);
  /** 选项列表（用于 Select/RadioGroup） */
  options?: SettingOption[] | ((settings: T) => SettingOption[]);
  /** 提示文字，支持 HTML */
  hint: string;
  /** 值在设置对象中的路径，如 'uiPreferences.fontSize' */
  modelPath: string;
  /** 搜索关键词 */
  keywords: string;
  /** 默认值 */
  defaultValue?: any;
  /** 可见性条件 */
  visible?: (settings: T) => boolean;
  /** 插槽配置 */
  slots?: {
    default?: () => Component;
    append?: () => Component;
  };
  /** 动作名称 */
  action?: string;
  /** 折叠面板配置 */
  collapsible?: {
    title: string;
    name: string;
    style?: Record<string, string>;
    defaultValue?: any;
    useLoading?: boolean;
  };
  /** 组内折叠配置 */
  groupCollapsible?: {
    name: string;
    title: string;
  };
}

/**
 * 设置分组定义
 */
export interface SettingsSection<T = Record<string, any>> {
  title: string;
  icon: Component;
  items: SettingItem<T>[];
}
```

---

## 5. 组件重构

### 5.1 SettingItemRenderer.vue 修改点

1. **移除硬编码的 ChatSettings 类型**

   ```typescript
   // Before
   import type { ChatSettings } from "../../types/settings";
   const props = defineProps<{
     item: SettingItem;
     settings: ChatSettings;
   }>();

   // After
   import type { SettingItem } from "@/types/settings-renderer";
   const props = defineProps<{
     item: SettingItem;
     settings: Record<string, any>;
   }>();
   ```

2. **组件映射支持外部扩展**

   ```typescript
   // 新增 prop
   const props = defineProps<{
     item: SettingItem;
     settings: Record<string, any>;
     isHighlighted?: boolean;
     customComponents?: Record<string, Component>; // 新增
   }>();

   // 合并组件映射
   const resolvedComponent = computed(() => {
     const comp = props.item.component;
     if (typeof comp === "string") {
       return props.customComponents?.[comp] ?? baseComponentMap[comp] ?? comp;
     }
     return comp;
   });
   ```

3. **移除 PromptEditor 硬编码导入**

   ```typescript
   // Before
   import PromptEditor from "./PromptEditor.vue";
   const baseComponentMap = {
     // ...
     PromptEditor,
   };

   // After - PromptEditor 通过 customComponents 注入或使用全局路径
   import PromptEditor from "@/components/common/PromptEditor.vue";
   ```

### 5.2 PromptEditor.vue 修改点

无需修改，仅迁移位置。该组件已经是通用的，不依赖任何业务类型。

---

## 6. 使用方适配

### 6.1 llm-chat 适配

```typescript
// settingsConfig.ts
import type { SettingsSection } from "@/types/settings-renderer";
import type { ChatSettings } from "../types/settings";

// 使用泛型指定具体类型
export const settingsConfig: SettingsSection<ChatSettings>[] = [
  // ...
];
```

```vue
<!-- ChatSettingsPanel.vue -->
<script setup lang="ts">
import SettingItemRenderer from "@/components/common/SettingItemRenderer.vue";
import type { ChatSettings } from "../types/settings";

// 类型断言确保类型安全
const settings = ref<ChatSettings>({ ... });
</script>

<template>
  <SettingItemRenderer :item="item" :settings="settings" @update:settings="handleUpdate" />
</template>
```

### 6.2 TranscriptionSettings 适配示例

重构后，`TranscriptionSettings.vue` 可以从 300+ 行简化为约 50 行：

```typescript
// transcription/config/settingsConfig.ts
import type { SettingsSection } from "@/types/settings-renderer";
import type { TranscriptionConfig } from "../types";
import LlmModelSelector from "@/components/common/LlmModelSelector.vue";

export const transcriptionSettingsConfig: SettingsSection<TranscriptionConfig>[] = [
  {
    title: "基础服务配置",
    icon: Settings2,
    items: [
      {
        id: "modelIdentifier",
        label: "兜底转写模型",
        component: LlmModelSelector,
        props: { filterCapabilities: ["vision", "audio"] },
        modelPath: "modelIdentifier",
        hint: "当具体分类未配置独立模型时，将使用此模型作为保底",
        keywords: "model 模型",
      },
      {
        id: "autoStartOnImport",
        label: "自动开始转写",
        layout: "inline",
        component: "ElSwitch",
        modelPath: "autoStartOnImport",
        hint: "文件导入资产库后立即加入转写队列",
        keywords: "auto start 自动",
      },
      // ... 更多配置项
    ],
  },
];
```

```vue
<!-- TranscriptionSettings.vue (重构后) -->
<template>
  <div class="transcription-settings">
    <el-form label-position="top">
      <el-collapse v-model="activeCollapse">
        <el-collapse-item
          v-for="section in transcriptionSettingsConfig"
          :key="section.title"
          :name="section.title"
        >
          <template #title>
            <div class="collapse-title">
              <component :is="section.icon" />
              <span>{{ section.title }}</span>
            </div>
          </template>
          <SettingItemRenderer
            v-for="item in section.items"
            :key="item.id"
            :item="item"
            :settings="store.config"
            @update:settings="handleUpdate"
            @action="handleAction"
          />
        </el-collapse-item>
      </el-collapse>
    </el-form>
  </div>
</template>
```

---

## 7. 执行步骤

### Phase 1: 类型迁移（无破坏性）

1. [ ] 创建 `src/types/settings-renderer.ts`，定义泛型版本的类型
2. [ ] 在原 `settings-types.ts` 中重新导出新类型（保持兼容）

### Phase 2: 组件迁移

3. [ ] 迁移 `PromptEditor.vue` 到 `src/components/common/`
4. [ ] 迁移 `SettingItemRenderer.vue` 到 `src/components/common/`
5. [ ] 更新组件内部导入路径

### Phase 3: 适配现有使用

6. [ ] 更新 `llm-chat` 中的导入路径
7. [ ] 更新 `settingsConfig.ts` 使用新类型
8. [ ] 验证 llm-chat 设置面板功能正常

### Phase 4: 文档更新

9. [ ] 更新 `src/components/common/README.md`
10. [ ] 添加使用示例

---

## 8. 风险评估

| 风险         | 影响       | 缓解措施                           |
| ------------ | ---------- | ---------------------------------- |
| 类型不兼容   | 编译错误   | 使用泛型保持灵活性，原类型重新导出 |
| 导入路径变更 | 运行时错误 | 全局搜索替换，IDE 辅助重构         |
| 样式丢失     | UI 异常    | 样式随组件迁移，使用 scoped CSS    |

---

## 9. 后续优化（可选）

1. **SettingsSectionRenderer**：封装整个分组的渲染逻辑
2. **useSettingsRenderer** Composable：提供搜索、高亮、导航等功能
3. **移动端适配**：为 mobile 端创建对应的 Varlet UI 版本

---

## 10. 参考

- 现有实现：[`SettingItemRenderer.vue`](../../src/tools/llm-chat/components/settings/SettingItemRenderer.vue)
- 类似模式：[`AstNodeRenderer.tsx`](../../src/tools/rich-text-renderer/components/AstNodeRenderer.tsx)
- 潜在使用者：[`TranscriptionSettings.vue`](../../src/tools/transcription/components/TranscriptionSettings.vue)
