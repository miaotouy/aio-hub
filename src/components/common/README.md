# 通用组件

## IconPresetSelector - 图标预设选择器

一个可复用的图标预设选择器组件，用于在多个场景中选择预设图标。

### 功能特性

- 📦 支持网格展示预设图标
- 🔍 可选的搜索功能
- 🏷️ 可选的分类过滤
- 🎨 显示图标标签/建议用途
- 📱 响应式设计
- ♿ 空状态提示

### Props

| 属性 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `icons` | `PresetIconInfo[]` | **必需** | 预设图标列表 |
| `getIconPath` | `(path: string) => string` | **必需** | 获取图标完整路径的函数 |
| `showSearch` | `boolean` | `false` | 是否显示搜索框 |
| `showCategories` | `boolean` | `false` | 是否显示分类标签 |
| `showTags` | `boolean` | `true` | 是否显示建议标签 |
| `gridClass` | `string` | `''` | 自定义网格类名 |

### Events

| 事件名 | 参数 | 说明 |
|--------|------|------|
| `select` | `icon: PresetIconInfo` | 当用户选择图标时触发 |

### 使用示例

#### 基础用法

```vue
<template>
  <el-dialog v-model="showDialog" title="选择图标">
    <IconPresetSelector
      :icons="PRESET_ICONS"
      :get-icon-path="(path) => `/model-icons/${path}`"
      @select="handleSelect"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import IconPresetSelector from '@/components/common/IconPresetSelector.vue';
import { PRESET_ICONS } from '@/config/model-metadata';

const showDialog = ref(false);

function handleSelect(icon) {
  console.log('选择的图标:', icon);
  showDialog.value = false;
}
</script>
```

#### 完整功能

```vue
<template>
  <el-dialog v-model="showDialog" title="选择预设图标" width="80%" top="5vh">
    <IconPresetSelector
      :icons="PRESET_ICONS"
      :get-icon-path="getPresetIconPath"
      show-search
      show-categories
      @select="handleIconSelect"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import IconPresetSelector from '@/components/common/IconPresetSelector.vue';
import { PRESET_ICONS } from '@/config/model-metadata';
import { useModelIcons } from '@/composables/useModelMetadata';

const { getPresetIconPath } = useModelIcons();
const showDialog = ref(false);

function handleIconSelect(icon) {
  // 处理图标选择
  console.log('选中:', icon.name, icon.path);
  showDialog.value = false;
}
</script>
```

### 已使用该组件的位置

1. **LlmServiceSettings.vue** - LLM 服务配置的供应商图标选择
2. **ModelIconSettings.vue** - 模型图标配置管理的预设图标浏览

### 样式定制

组件使用 CSS 变量，可以通过覆盖以下变量来定制样式：

- `--input-bg` - 输入框/卡片背景色
- `--text-color` - 文本颜色
- `--border-color` - 边框颜色
- `--primary-color` - 主题色
- `--text-color-secondary` - 次要文本颜色

### 类型定义

```typescript
interface PresetIconInfo {
  name: string;           // 图标名称
  path: string;           // 图标路径
  suggestedFor?: string[]; // 建议用途标签
  category?: string;      // 分类
}