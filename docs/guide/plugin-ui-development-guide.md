# 插件 UI 开发指南

**版本:** 2.0  
**最后更新:** 2025-11-05

## 目录

1. [概述](#概述)
2. [前置要求](#前置要求)
3. [清单配置](#清单配置)
4. [UI 组件开发](#ui-组件开发)
5. [图标配置](#图标配置)
6. [完整示例](#完整示例)
7. [测试与调试](#测试与调试)
8. [最佳实践](#最佳实践)
9. [常见问题](#常见问题)

---

## 概述

从 2.0 版本开始，插件系统完全支持 UI 集成。插件可以拥有自己的用户界面，并像内置工具一样出现在应用的侧边栏、设置页和路由系统中。

### 核心特性

✅ **无缝集成** - 插件 UI 自动出现在侧边栏和设置页  
✅ **动态加载** - 运行时添加/移除插件无需重启  
✅ **窗口分离** - 插件工具支持窗口分离（与内置工具一致）  
✅ **图标支持** - 支持 Emoji、SVG 和图片格式图标  
✅ **配置驱动** - 通过 `manifest.json` 简单声明 UI

---

## 前置要求

### 技术栈

- **Vue 3** - 使用 Composition API (非必要但推荐)
- **ES Modules** - 组件必须是编译后的 ESM 格式
- **Tauri API** - 用于与后端通信

### 开发模式支持

✅ **开发模式现已支持直接使用 .vue 单文件组件！**

在开发模式下（`bun run dev`），插件可以：
- 直接使用 `.vue` 单文件组件，无需手动编译
- 享受 Vite 提供的 HMR（热模块替换）
- 使用完整的 Vue SFC 特性（`<template>`、`<script setup>`、`<style scoped>`）

### 生产模式约束

⚠️ **生产模式下插件 UI 组件仍需编译为 JavaScript 文件（.js 或 .mjs）**

原因：
- 生产环境的插件位于用户的 appData 目录
- 无法通过 Vite 动态编译
- 需要通过 `convertFileSrc` API 加载

### 开发工具链

**开发模式**：
- ✅ 直接使用 `.vue` 文件
- ✅ 无需构建工具
- ✅ 自动 HMR

**生产模式**：
- 需要构建流程将 `.vue` 编译为 `.js`
- **推荐方案**: 使用 `vite` + `@vitejs/plugin-vue`
- **备选方案**: 使用 Vue 3 的 `h()` 渲染函数手写组件

---

## 清单配置

在 `manifest.json` 中添加 `ui` 字段：

```json
{
  "id": "your-plugin-id",
  "name": "Your Plugin Name",
  "version": "1.0.0",
  "description": "Plugin description",
  "author": "Your Name",
  "host": {
    "appVersion": ">=0.1.0"
  },
  "type": "javascript",
  "main": "index.js",
  "methods": [...],
  
  "ui": {
    "displayName": "Display Name",
    "component": "YourComponent.js",
    "icon": "🎨"
  }
}
```

### UI 配置字段

| 字段 | 类型 | 必需 | 说明 |
|------|------|------|------|
| `displayName` | string | 否 | 显示名称（默认使用 `name`） |
| `component` | string | 是 | 组件文件路径（相对于插件根目录） |
| `icon` | string | 否 | 图标（Emoji、SVG 路径或图片路径） |

---

---

## UI 组件开发

无论插件的后端类型（JavaScript, Native, Sidecar）是什么，UI 的开发方式都是统一的。核心技术栈是 **Vue 3**，开发体验由主应用的 **Vite** 服务器驱动。

### 核心开发模式：使用 Vue 单文件组件

这是开发插件 UI 的 **唯一推荐方式**。

- **简单插件**: 可以只有一个入口 `.vue` 文件。
- **复杂插件**: 可以将 UI 拆分成多个组件，放在 `components/` 目录下，由一个主入口 `.vue` 文件导入和组织。

Vite 会自动处理组件之间的依赖关系，无论你的项目结构如何。

#### 示例：`HelloWorld.vue`

```vue
<template>
  <div class="container">
    <InfoCard title="🎉 Hello World 插件">
      <el-input v-model="name" placeholder="输入你的名字" />
      <el-button @click="doGreet" :loading="isLoading">打招呼</el-button>
      <p v-if="greeting" class="greeting">{{ greeting }}</p>
    </InfoCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElInput, ElButton } from 'element-plus';
import InfoCard from '@/components/common/InfoCard.vue'; // 主应用提供的封装组件
import { execute } from '@/services/executor';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const errorHandler = createModuleErrorHandler('HelloWorldPlugin');
const name = ref('');
const greeting = ref('');
const isLoading = ref(false);

async function doGreet() {
  if (!name.value) {
    customMessage.warning('请输入名字！');
    return;
  }
  isLoading.value = true;
  // 调用插件自身的 "greet" 方法
  const result = await execute({
    service: 'example-hello-world', // 插件自身 ID
    method: 'greet',
    params: { name: name.value },
  });
  isLoading.value = false;

  if (result.success) {
    greeting.value = result.data;
  } else {
    errorHandler.error(result.error, '调用失败');
  }
}
</script>

<style scoped>
/* ... 样式 ... */
</style>
```

#### `manifest.json` 配置

只需将 `component` 字段指向你的入口 Vue 组件即可。

```json
{
  "ui": {
    "displayName": "Hello World",
    "component": "HelloWorld.vue",
    "icon": "🎉"
  }
}
```

### 发布生产包：编译 UI

虽然开发时可以直接使用 `.vue` 文件，但在 **发布插件** 时，必须将 UI 编译成 `.js` 文件。

- **原因**: 生产环境下的插件位于用户数据目录，无法依赖主应用的 Vite 开发服务器进行实时编译。
- **工具**: 使用 Vite 进行库模式 (`lib mode`) 构建。

#### 独立构建流程

对于需要编译后端（如 Sidecar/Native 插件）或具有复杂前端资源的插件，推荐在插件目录内建立独立的构建流程。这确保了插件可以独立构建和分发。

1.  **添加 `package.json`**: 用于管理 `vite`, `@vitejs/plugin-vue` 等前端构建相关的开发依赖。
2.  **创建 `vite.config.js`**: 配置 Vite 的库模式 (`lib mode`) 构建。核心是 **外部化 (externalize)** 所有由主应用提供的依赖（如 `vue`, `element-plus`, 以及路径别名 `/@/`），这能极大减小打包体积，避免重复加载。
3.  **创建构建脚本 (可选)**: 使用 `build.js` 或 `build.bat` 等脚本，可以一键完成所有构建任务，例如：
    -   编译 Rust 后端 (对于 Sidecar/Native 插件)。
    -   编译 Vue 前端。
    -   将所有产物（后端可执行文件、前端 JS、`manifest.json` 等）整合到 `dist` 目录，方便打包和分发。

**最佳实践参考: `plugins/example-file-hasher/`**

`example-file-hasher` 是一个完美的 "Sidecar + Vue UI" 插件范例，它完整地展示了：
-   独立的 `package.json` 和 `vite.config.js`。
-   使用 `build.js` 统一构建 Rust 后端和 Vue 前端。
-   将复杂的 UI 拆分为多个子组件。
-   最终如何配置 `manifest.json` 以指向编译后的 `.js` 组件。
### 与插件后端及主应用交互

#### 调用插件自身方法

使用项目统一的 `execute` 函数，可以方便地调用插件在 `manifest.json` 中定义的任何方法。

```typescript
import { execute } from '@/services/executor';

// 假设 serviceId 是 'my-plugin', 方法是 'myMethod'
const result = await execute({
  service: 'my-plugin',
  method: 'myMethod',
  params: { /* ... */ }
});
```

#### 使用主应用的 Composables 和工具

插件 UI 可以无缝接入主应用提供的所有前端能力，就像内置工具一样。

```typescript
// ✅ 复用主应用的 Composables
import { useTheme } from '@/composables/useTheme';
// ✅ 复用主应用的工具函数
import { customMessage } from '@/utils/customMessage';
// ✅ 复用主应用的 UI 组件
import { ElButton } from 'element-plus';

const { currentTheme } = useTheme();

function showMessage() {
  customMessage.info(`当前主题是: ${currentTheme.value}`);
}
```
---

## 图标配置

插件支持三种图标格式：

### 1. Emoji 图标（推荐）

```json
{
  "ui": {
    "icon": "🎨"
  }
}
```

### 2. SVG 文件

```json
{
  "ui": {
    "icon": "icon.svg"
  }
}
```

SVG 文件应放在插件根目录，或使用相对路径：

```
your-plugin/
├── manifest.json
├── assets/
│   └── icon.svg
└── ...
```

```json
{
  "ui": {
    "icon": "assets/icon.svg"
  }
}
```

### 3. 图片文件

支持 PNG、JPG、WebP 等格式：

```json
{
  "ui": {
    "icon": "icon.png"
  }
}
```

---

## 完整示例

我们提供了多个开源的示例插件仓库，覆盖了从简单到复杂的不同场景。开发者可以克隆这些仓库来学习，或者将其作为自己插件的模板。

### 示例 1：`aiohub-plugin-example-hello-world` (入门)

**这是学习插件 UI 开发的起点，演示了最简单的纯前端插件。**

- **仓库地址**: [https://github.com/miaotouy/aiohub-plugin-example-hello-world](https://github.com/miaotouy/aiohub-plugin-example-hello-world)
- **类型**: JavaScript 插件 (纯前端)
- **特点**:
    - **极简配置**: `manifest.json` 直接指向 `.vue` 文件，无需构建流程。
    - **核心交互**: 演示了如何在 UI (`HelloWorld.vue`) 中调用插件自身的 `greet` 方法。
    - **快速上手**: 适合理解插件 UI 的基本工作流程。

#### `HelloWorld.vue` 示例代码
```vue
<template>
  <div class="container">
    <InfoCard title="🎉 Hello World 插件">
      <el-input v-model="name" placeholder="输入你的名字" />
      <el-button @click="doGreet" :loading="isLoading">打招呼</el-button>
      <p v-if="greeting" class="greeting">{{ greeting }}</p>
    </InfoCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElInput, ElButton } from 'element-plus';
import InfoCard from '@/components/common/InfoCard.vue'; // 主应用提供的封装组件
import { execute } from '@/services/executor';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const errorHandler = createModuleErrorHandler('HelloWorldPlugin');
const name = ref('');
const greeting = ref('');
const isLoading = ref(false);

async function doGreet() {
  if (!name.value) {
    customMessage.warning('请输入名字！');
    return;
  }
  isLoading.value = true;
  const result = await execute({
    service: 'example-hello-world', // 插件自身 ID
    method: 'greet',
    params: { name: name.value },
  });
  isLoading.value = false;

  if (result.success) {
    greeting.value = result.data;
  } else {
    errorHandler.error(result.error, '调用失败');
  }
}
</script>

<style scoped>
.container {
  padding: 20px;
}
.greeting {
  margin-top: 15px;
  font-weight: bold;
}
</style>
```

### 示例 2：`aiohub-plugin-example-file-hasher` (进阶)

**这是一个包含独立构建流程的最佳实践范例，展示了如何开发一个可供分发的生产级插件。**

- **仓库地址**: [https://github.com/miaotouy/aiohub-plugin-example-file-hasher](https://github.com/miaotouy/aiohub-plugin-example-file-hasher)
- **类型**: Sidecar 插件 (Rust 后端 + Vue 前端)
- **特点**:
    - **独立构建**: 包含 `package.json`, `vite.config.js` 和 `build.js`，演示了如何为生产环境编译 UI。
    - **复杂 UI**: 展示了如何将 UI 拆分为多个子组件 (`components/` 目录)。
    - **前后端协作**: 演示了 Vue UI 如何与 Rust Sidecar 后端进行交互。
    - **生产就绪**: 是发布独立插件的绝佳模板。

### 示例 3：`aiohub-plugin-example-native` (进阶)

**这是一个原生插件的示例，其 UI 部分与 File Hasher 类似，也使用了独立的构建流程。**

- **仓库地址**: [https://github.com/miaotouy/aiohub-plugin-example-native](https://github.com/miaotouy/aiohub-plugin-example-native)
- **类型**: 原生插件 (Rust 后端 + Vue 前端)
- **特点**:
    - **独立构建**: 同样包含 `package.json`, `vite.config.js` 和 `build.js`。
    - **原生后端**: 演示了 UI 如何与高性能的原生 Rust 模块进行交互。

### 本地开发与测试

要在本地开发和测试插件（无论是克隆的示例还是你自己创建的），流程很简单：

1.  将完整的插件项目文件夹（例如，从 GitHub 克隆下来的 `aiohub-plugin-example-hello-world`）放入主应用的 `/plugins/` 目录中。
2.  启动主应用 (`bun run dev`)。

AIO Hub 会自动检测并加载 `/plugins/` 目录下的所有插件，并提供热重载支持。这个目录是你的本地开发沙盒，它已被 `.gitignore` 忽略，不会影响主仓库。

---

## 测试与调试

### 开发模式测试

1. 将插件放在主应用的 `/plugins/` 目录
2. 启动应用（`bun run dev`）
3. 插件会自动加载并支持热重载
4. 在侧边栏查看插件工具
5. 点击进入测试功能

### 日志调试

插件加载过程会在控制台输出详细日志：

```
[services/plugin-manager] 加载插件组件 { pluginPath: '...', componentFile: '...' }
[services/plugin-manager] 插件组件 URL 已生成 { componentUrl: '...' }
[services/plugin-manager] 插件组件加载成功 { componentFile: '...' }
[services/plugin-manager] 插件UI已注册: hello-world
```

### 常见错误

**错误**: `插件组件 xxx 必须有默认导出`  
**解决**: 确保组件使用 `export default` 导出

**错误**: `加载插件组件失败: Failed to fetch`  
**解决**: 检查组件文件路径是否正确，文件是否存在

**错误**: `Cannot find module 'vue'`  
**解决**: Vue 应该由主应用提供，不要在插件中单独打包

---

## 最佳实践

### 1. 组件开发

- ✅ 优先使用 Composition API
- ✅ 使用 `h()` 函数或编译后的 ESM
- ✅ 避免在插件中打包大型依赖
- ✅ 复用主应用的 composables 和工具函数

### 2. 样式处理

- ✅ 使用内联样式或 CSS-in-JS
- ✅ 避免全局样式污染
- ✅ 使用 CSS 变量适配主题
- ⚠️ 编译后的组件可以包含 `<style scoped>`

### 3. 错误处理

- ✅ 始终使用 try-catch 包裹异步操作
- ✅ 向用户显示友好的错误消息
- ✅ 记录详细的错误日志

### 4. 性能优化

- ✅ 懒加载大型依赖
- ✅ 使用 `shallowRef` 优化响应性
- ✅ 避免不必要的重新渲染

---

## 常见问题

### Q: 开发模式和生产模式的区别？

A:
- **开发模式**：支持直接使用 `.vue` 文件，享受 Vite HMR，无需手动编译
- **生产模式**：需要预先将 `.vue` 编译为 `.js` 文件，因为生产环境无法动态编译

### Q: 如何访问主应用的功能？

A: 通过导入主应用的 composables、工具函数和组件：

```javascript
import { useTheme } from '@/composables/useTheme';
import { customMessage } from '@/utils/customMessage';
```

### Q: 可以使用第三方库吗？

A: 可以，但建议：
- 优先使用主应用已有的依赖
- 避免打包大型库（如 Vue、Element Plus）
- 使用 CDN 或动态导入减小体积

### Q: 插件 UI 支持窗口分离吗？

A: 是的，插件工具自动支持窗口分离，与内置工具行为一致。

### Q: 如何更新插件 UI？

A:
- **开发模式**：修改 `.vue` 文件后自动热重载（HMR），无需刷新
- **生产模式**：需要重新安装插件或重启应用

### Q: .vue 文件找不到模块怎么办？

A: 这是正常的 TypeScript 提示。在开发模式下，主应用会提供这些模块：
```vue
<script setup>
// 这些导入在运行时是有效的
import { execute } from '@/services/executor';  // ✅ 主应用提供
import { customMessage } from '@/utils/customMessage';  // ✅ 主应用提供
import { ElButton } from 'element-plus';  // ✅ 主应用提供
</script>
```

### Q: 推荐使用哪种开发方式？

A:
- **开发阶段**：优先使用 `.vue` 文件，开发体验最好
- **发布阶段**：编译为 `.js` 文件，确保跨环境兼容性
- **简单组件**：可以直接手写 `h()` 函数，无需编译

---

## 相关文档

- [插件开发指南](./plugin-development-guide.md)

---

**反馈与建议**

如有问题或建议，请联系项目维护者。