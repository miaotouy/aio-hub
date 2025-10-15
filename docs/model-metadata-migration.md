# 模型元数据系统

## 概述

模型元数据管理系统是一个通用的属性匹配与合并引擎，用于为 AI 模型预设各种元数据属性。系统不仅支持图标和分组，还可以为模型预设任意属性（如能力、价格、上下文长度等）。

## 核心概念

### ModelMetadataRule

核心数据结构，用于定义模型的匹配规则和元数据属性：

```typescript
interface ModelMetadataRule {
  id: string;                    // 规则唯一标识
  matchType: MetadataMatchType;  // 匹配类型
  matchValue: string;            // 匹配值（支持正则）
  properties: {                  // 灵活的属性对象
    icon?: string;               // 图标路径
    group?: string;              // 分组名称
    capabilities?: string[];     // 能力标签
    contextLength?: number;      // 上下文长度
    pricing?: { ... };           // 价格信息
    // ... 任意其他自定义属性
  };
  priority?: number;             // 优先级（越大越优先）
  enabled?: boolean;             // 是否启用
  useRegex?: boolean;            // 是否使用正则表达式
  description?: string;          // 规则描述
}
```

### 匹配类型

```typescript
type MetadataMatchType = 
  | 'provider'      // 按提供商匹配
  | 'model'         // 按精确模型 ID 匹配
  | 'modelPrefix'   // 按模型 ID 前缀匹配
  | 'modelGroup';   // 按模型分组匹配（已废弃）
```

### 元数据属性

`properties` 字段是一个开放的对象，可以包含任意属性：

```typescript
interface ModelMetadataProperties {
  icon?: string;           // 图标路径
  group?: string;          // 分组名称
  capabilities?: string[]; // 能力标签
  contextLength?: number;  // 上下文长度
  pricing?: {              // 价格信息
    input: number;
    output: number;
    unit: string;
    note?: string;
  };
  [key: string]: unknown;  // 允许动态扩展
}
```

## 使用指南

### 基础使用

```typescript
import { useModelMetadata } from '@/composables/useModelMetadata';

const {
  rules,              // 规则列表
  getModelIcon,       // 获取模型图标
  getModelGroup,      // 获取模型分组
  getModelProperty,   // 获取任意元数据属性
} = useModelMetadata();
```

### 获取模型元数据

```typescript
// 获取图标
const iconUrl = getModelIcon(model);

// 获取分组
const groupName = getModelGroup(model);

// 获取上下文长度
const contextLength = getModelProperty(model, 'contextLength');

// 获取能力标签
const capabilities = getModelProperty(model, 'capabilities', []);

// 获取价格信息
const pricing = getModelProperty(model, 'pricing');
```

### 管理规则

```typescript
const {
  addRule,
  updateRule,
  deleteRule,
  toggleRule,
  resetToDefaults,
  exportRules,
  importRules,
} = useModelMetadata();

// 添加新规则
await addRule({
  id: 'custom-gpt4',
  matchType: 'modelPrefix',
  matchValue: 'gpt-4',
  properties: {
    icon: '/model-icons/openai.svg',
    group: 'OpenAI',
    capabilities: ['视觉', '代码生成', '长文本'],
    contextLength: 128000,
  },
  priority: 20,
  enabled: true,
  description: 'GPT-4 系列模型',
});

// 更新规则
await updateRule('custom-gpt4', {
  properties: {
    ...existingProperties,
    pricing: {
      input: 2.5,
      output: 10,
      unit: 'USD',
      note: '每百万 token',
    },
  },
});

// 删除规则
await deleteRule('custom-gpt4');

// 切换规则启用状态
await toggleRule('custom-gpt4');
```

## 扩展示例

### 添加模型能力标签

```typescript
await addRule({
  matchType: 'modelPrefix',
  matchValue: 'claude-',
  properties: {
    icon: '/model-icons/claude-color.svg',
    group: 'Claude',
    capabilities: ['思维链', '代码生成', '多语言'],
    contextLength: 200000,
  },
  priority: 20,
  enabled: true,
  description: 'Claude 系列模型',
});
```

### 添加价格信息

```typescript
await addRule({
  matchType: 'model',
  matchValue: 'gpt-4o',
  properties: {
    icon: '/model-icons/openai.svg',
    group: 'OpenAI',
    pricing: {
      input: 2.5,
      output: 10,
      unit: 'USD',
      note: '每百万 token',
    },
  },
  priority: 30,
  enabled: true,
});
```

### 在组件中使用元数据

```vue
<script setup lang="ts">
import { useModelMetadata } from '@/composables/useModelMetadata';
import type { LlmModelInfo } from '@/types/llm-profiles';

const { getModelProperty, getModelIcon } = useModelMetadata();

const props = defineProps<{
  model: LlmModelInfo;
}>();

// 获取各种元数据
const iconUrl = getModelIcon(props.model);
const capabilities = getModelProperty(props.model, 'capabilities', []);
const contextLength = getModelProperty(props.model, 'contextLength');
const pricing = getModelProperty(props.model, 'pricing');
</script>

<template>
  <div class="model-card">
    <img v-if="iconUrl" :src="iconUrl" alt="模型图标" />
    
    <div v-if="contextLength" class="context">
      {{ contextLength.toLocaleString() }} tokens
    </div>
    
    <div v-if="capabilities.length" class="capabilities">
      <span v-for="cap in capabilities" :key="cap">{{ cap }}</span>
    </div>
    
    <div v-if="pricing" class="pricing">
      ${{ pricing.input }}/M in, ${{ pricing.output }}/M out
    </div>
  </div>
</template>
```

## 优先级规则

匹配规则按优先级排序，优先级高的规则会覆盖优先级低的规则：

1. **优先级 30+**: 特定模型的精确匹配（如 `sora`, `midjourney`）
2. **优先级 20**: 模型前缀匹配（如 `gpt-`, `claude-`）
3. **优先级 10**: 提供商级别匹配（如 `openai`, `anthropic`）

建议的优先级分配：
- 提供商匹配：10
- 模型系列匹配：20
- 特定模型匹配：30+

## 正则表达式支持

可以使用正则表达式进行更灵活的匹配：

```typescript
await addRule({
  matchType: 'modelPrefix',
  matchValue: '(?<!o)llama[1-9-]',  // 匹配 llama 但不匹配 ollama
  useRegex: true,
  properties: {
    icon: '/model-icons/meta-color.svg',
    group: 'Meta',
  },
  priority: 20,
});
```

## 数据存储

- **存储位置**: 使用 Tauri 的应用数据目录
- **配置文件**: `model-metadata-rules.json`
- **自动保存**: 所有修改操作自动保存
- **导入导出**: 支持 JSON 格式的配置导入导出

## 最佳实践

1. **规则命名**: 使用清晰的 ID 命名规则，如 `provider-{name}`, `model-prefix-{name}`
2. **优先级管理**: 保持优先级的合理分层，避免规则冲突
3. **属性精简**: 只为需要的模型添加元数据，保持配置清晰
4. **正则谨慎**: 复杂正则可能影响性能，优先使用简单匹配
5. **测试验证**: 添加规则后测试匹配结果，确保符合预期

## 预设图标

系统内置了 130+ 个 AI 服务商和模型的图标，存放在 `public/model-icons/` 目录：

- 主流 AI 服务商（OpenAI、Anthropic、Google 等）
- 国内 AI 服务商（DeepSeek、智谱、月之暗面等）
- 云服务商（AWS、Azure、阿里云等）
- API 服务（OpenRouter、SiliconFlow 等）
- 开源工具（Ollama、HuggingFace 等）

## 常见问题

### Q: 如何为模型添加自定义属性？

A: 在 `properties` 对象中直接添加即可，系统支持任意属性扩展。

### Q: 多个规则匹配同一个模型时如何处理？

A: 按优先级排序，优先级高的规则会覆盖优先级低的规则。同优先级时，后添加的规则优先。

### Q: 如何批量导入规则？

A: 使用 `importRules()` 方法导入 JSON 格式的规则数组。

### Q: 正则表达式匹配的性能如何？

A: 正则匹配会略慢于字符串匹配，但对于大多数场景影响可忽略。建议优先使用简单匹配。

## API 参考

### useModelMetadata()

返回模型元数据管理接口：

#### 状态
- `rules: Ref<ModelMetadataRule[]>` - 规则列表

#### 管理方法
- `loadRules()` - 加载规则
- `saveRules()` - 保存规则
- `addRule(rule)` - 添加规则
- `updateRule(id, updates)` - 更新规则
- `deleteRule(id)` - 删除规则
- `toggleRule(id)` - 切换规则启用状态
- `resetToDefaults()` - 重置为默认规则
- `exportRules()` - 导出规则
- `importRules(rules)` - 导入规则

#### 查询方法
- `getMatchedRule(model, provider?)` - 获取匹配的规则
- `getMatchedProperties(model, provider?)` - 获取匹配的属性
- `getModelProperty(model, key, defaultValue?)` - 获取模型属性
- `getModelGroup(model)` - 获取模型分组
- `getModelIcon(model)` - 获取模型图标
- `getIconPath(path)` - 转换图标路径为可访问 URL

#### 工具方法
- `sortByPriority()` - 按优先级排序规则
- `getRulesByType(type)` - 获取指定类型的规则
- `getPresetIconPath(filename)` - 获取预设图标路径
- `getDisplayIconPath(path)` - 获取显示用图标路径
- `validateIconPath(path)` - 验证图标路径

## 总结

模型元数据系统提供了灵活、可扩展的模型属性管理能力。通过规则匹配机制，可以为不同的模型预设各种元数据，提升应用的用户体验和功能完整性。