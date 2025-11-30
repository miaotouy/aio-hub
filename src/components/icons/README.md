# 图标系统指南

AIO Hub 使用混合图标策略，结合了自定义 SVG 图标和成熟的开源图标库。

## 1. 图标来源

### 1.1 自定义图标 (`src/components/icons/`)

存放项目特有的、无法在通用图标库中找到的图标。这些图标通常是 SVG 格式的 Vue 组件。

- **用途**: 工具 Logo、特定业务功能的图标。
- **示例**: `DirectoryJanitorIcon.vue`, `OcrIcon.vue`。

### 1.2 Element Plus Icons

项目集成了 `@element-plus/icons-vue`。

- **用途**: 通用 UI 交互图标（如关闭、设置、编辑、删除）。
- **使用**: 直接从 `@element-plus/icons-vue` 导入。

```vue
<script setup>
import { Edit, Delete } from '@element-plus/icons-vue'
</script>

<template>
  <el-icon><Edit /></el-icon>
</template>
```

### 1.3 Lucide Icons

项目广泛使用 [lucide-vue-next](https://lucide.dev/) 作为主要的现代化、风格一致的图标库。

- **用途**: 补充 Element Plus Icons，用于需要更清晰、更现代线条风格的场景。
- **使用**: 直接从 `lucide-vue-next` 导入。

```vue
<script setup>
import { Anchor, Bot } from 'lucide-vue-next';
</script>

<template>
  <Anchor :size="16" />
  <Bot />
</template>
```

### 1.4 Vicons (Ionicons 5)

项目还引入了 `@vicons/ionicons5`，提供了另一套丰富的图标选择。

- **用途**: 在特定场景下补充其他图标库。
- **使用**: 直接从 `@vicons/ionicons5` 导入。

```vue
<script setup>
import { LogoNodejs } from '@vicons/ionicons5';
</script>

<template>
  <LogoNodejs />
</template>
```

### 1.5 Lobe Icons

项目使用了 `@lobehub/icons-static-svg` (或其他形式集成) 用于 AI 模型和服务商的 Logo。

- **用途**: LLM 服务商 Logo (OpenAI, Claude, Gemini 等)。
- **优势**: 高质量、风格统一的 AI 相关图标。

## 2. 添加新图标

### 2.1 添加自定义 SVG 图标

1.  **准备 SVG**: 确保 SVG 代码简洁，移除无用的 `fill` 属性（如果希望通过 CSS 控制颜色）或保留硬编码颜色（如果是多色 Logo）。
2.  **创建组件**: 在 `src/components/icons/` 下创建 `.vue` 文件。
3.  **模板结构**:

```vue
<template>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="currentColor" <!-- 使用 currentColor 以便随文字颜色变化 -->
  >
    <!-- SVG Path -->
  </svg>
</template>
```

### 2.2 使用 `useThemeAwareIcon`

对于需要在深色/浅色模式下显示不同颜色的复杂图标，可以使用 `useThemeAwareIcon` Composable。

## 3. 最佳实践

- **大小控制**: 尽量使用 `1em` 作为宽高，以便通过父级的 `font-size` 控制图标大小。
- **颜色控制**: 优先使用 `currentColor` 作为填充色，使图标颜色自动跟随文本颜色。
- **按需引入**: 避免全量引入图标库，始终按需导入使用的图标组件。
