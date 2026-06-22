# 插件 UI 开发指南

**版本:** 2.0  
**最后更新:** 2026-06-23

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

- **无缝集成**：插件 UI 自动出现在侧边栏和设置页。
- **动态加载**：运行时添加/移除插件无需重启。
- **窗口分离**：插件工具支持窗口分离（与内置工具一致）。
- **图标支持**：支持 Emoji、SVG 和图片格式图标。
- **配置驱动**：通过 `manifest.json` 简单声明 UI。

---

## 前置要求

### 运行时约束

插件 UI 的**唯一硬性约束**是：最终产物必须是一个 **ESM 格式的 JavaScript 文件**，且 `export default` 导出一个 **Vue 组件对象**。

这是因为主应用使用 Vue 3 作为渲染引擎，插件组件最终会被 Vue 的路由和渲染系统消费。但这并不意味着你必须使用 Vue 框架来编写 UI——你只需要确保导出的对象符合 Vue 组件的接口即可。

**满足约束的方式有很多**：

- **Vue SFC**（推荐，开发体验最好）：使用 `.vue` 单文件组件，开发模式下享受 HMR。
- **纯 JavaScript**：直接手写一个带 `setup()` 或 `render()` 函数的对象，用 `h()` 构建 DOM——这不需要任何构建工具。
- **原生 DOM**：在组件的 `onMounted` 生命周期中使用原生 DOM API 操控容器元素，适合不想学 Vue 模板语法的开发者。
- **iframe 嵌入**：渲染一个 `<iframe>` 加载你自己的 HTML 页面，内部用任何技术栈（React、Svelte、纯 HTML/CSS/JS 皆可）。
- **其他框架编译产物**：用 React/Preact/Solid 等框架开发，最终在 Vue 组件的 `setup` 中将其挂载到容器 DOM 节点上。

### 开发模式支持

- **Vue 插件（一等支持）**：当主应用以开发模式运行（`bun run dev`）时，Vite 开发服务器会自动接管 `/plugins/` 目录。Vue 插件可以直接使用 `.vue` 单文件组件，无需手动编译，并享受 HMR（热模块替换）和完整的 SFC 特性（`<template>`、`<script setup>`、`<style scoped>`）。
- **纯 JS 插件**：直接在插件目录放一个 `.js` 或 `.mjs` 文件，导出 Vue 组件对象即可。Vite 同样会自动发现并加载。
- **非 Vue 技术栈/独立开发服务器**：如果插件使用非 Vue 技术栈（如 React、Preact、纯 HTML 等），开发者可以在插件目录内自行开启独立的开发服务器。在开发时，可以通过配置将主应用指向该本地开发服务器的 URL（例如 `http://localhost:6173/`），从而实现跨框架的开发与调试。

### 生产模式约束

生产模式下，插件 UI 必须是已经就绪的 JavaScript 文件（`.js` 或 `.mjs`）。

- 如果你使用 Vue SFC 开发，需要通过构建工具（如 Vite）将 `.vue` 编译为 `.js`。
- 如果你直接用纯 JS 编写组件，**无需任何编译步骤**，直接提供 `.js` 文件即可。
- 如果你用其他框架开发，需要将其构建为 ESM 格式的 JS 文件，并在其中导出一个 Vue 组件包装器。

原因：

- 生产环境的插件位于用户的 appData 目录。
- 无法通过 Vite 动态编译 `.vue` 文件。
- 通过 `convertFileSrc` API 加载本地文件。

### 开发工具链

- **纯 JS 方案（零构建）**：直接编写 `.js` 文件，导出 Vue 组件对象。开发和生产都不需要构建步骤。
- **Vue SFC 方案（推荐）**：
  - 开发模式：直接使用 `.vue` 文件，自动 HMR，无需构建。
  - 生产模式：使用 `vite` + `@vitejs/plugin-vue` 编译为 `.js`。
- **其他框架方案**：自行搭建构建流程，最终产出 ESM 格式的 JS 文件。

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

| 字段          | 类型   | 必需 | 说明                              |
| ------------- | ------ | ---- | --------------------------------- |
| `displayName` | string | 否   | 显示名称（默认使用 `name`）       |
| `component`   | string | 是   | 组件文件路径（相对于插件根目录）  |
| `icon`        | string | 否   | 图标（Emoji、SVG 路径或图片路径） |

---

## UI 组件开发

无论插件的后端类型（JavaScript, Native, Sidecar）是什么，UI 的开发方式都是统一的：导出一个 Vue 组件对象。开发体验由主应用的 **Vite** 服务器驱动。

### 方式一：纯 JavaScript（零依赖，零构建）

对于不想引入任何框架和构建工具的开发者，直接手写一个 JS 文件是最轻量的方案：

```javascript
// MyPlugin.js
import { ref, h, onMounted, onUnmounted } from "vue";
import { execute } from "aiohub-sdk";

export default {
  setup() {
    const container = ref(null);
    const result = ref("");

    async function doSomething() {
      const res = await execute({
        service: "my-plugin",
        method: "process",
        params: {},
      });
      result.value = res.success ? res.data : "失败";
    }

    return () =>
      h("div", { style: "padding: 20px;" }, [
        h("h2", "我的插件"),
        h("button", { onClick: doSomething }, "执行"),
        h("p", result.value),
      ]);
  },
};
```

对应的 `manifest.json`：

```json
{
  "ui": {
    "displayName": "My Plugin",
    "component": "MyPlugin.js",
    "icon": "🔧"
  }
}
```

这种方式开发和发布都不需要任何编译步骤。

#### 原生 DOM 方案

如果你更习惯操作原生 DOM（比如从纯 HTML/JS 背景来的开发者），可以在 Vue 组件的生命周期中接管容器：

```javascript
// MyNativePlugin.js
import { ref, h, onMounted, onUnmounted } from "vue";

export default {
  setup() {
    const containerRef = ref(null);

    onMounted(() => {
      const el = containerRef.value;
      // 从这里开始，你可以完全用原生 DOM API
      el.innerHTML = `
        <h2>原生 DOM 插件</h2>
        <input id="my-input" placeholder="输入内容..." />
        <button id="my-btn">提交</button>
        <div id="my-output"></div>
      `;

      el.querySelector("#my-btn").addEventListener("click", () => {
        const value = el.querySelector("#my-input").value;
        el.querySelector("#my-output").textContent = `你输入了: ${value}`;
      });
    });

    onUnmounted(() => {
      // 清理资源（如果有）
    });

    return () => h("div", { ref: containerRef, style: "padding: 20px;" });
  },
};
```

#### iframe 方案

如果你有现成的 HTML 页面，或者想使用完全独立的技术栈（React、Svelte 等），可以通过 iframe 嵌入：

```javascript
// MyIframePlugin.js
import { h } from "vue";

export default {
  setup() {
    // 指向你自己的 HTML 文件（放在插件目录中）
    // 注意：生产模式下需要用 convertFileSrc 处理路径
    return () =>
      h("iframe", {
        src: "./my-app.html", // 相对于插件目录
        style: "width: 100%; height: 100%; border: none;",
      });
  },
};
```

### 方式二：Vue 单文件组件（推荐）

这是开发体验最好的方式，尤其适合使用主应用提供的 UI 组件库和 SDK。

> 💡 **澄清误区：支持完整的组件化开发**
>
> 这里的"单文件组件（SFC）"指的是 Vue 的开发格式，**绝不意味着**你必须把成百上千行的 UI 代码全部塞进一个单一的 `.vue` 文件中。
>
> 插件完全支持标准的模块化与组件化开发：
>
> - **简单插件**：可以只有一个入口 `.vue` 文件。
> - **复杂插件**：你可以在插件目录中自由创建子目录和子组件（例如 `components/SubCard.vue`、`utils/helper.ts`），并在主入口 `.vue` 文件中通过相对路径直接导入（如 `import SubCard from './components/SubCard.vue'`）。
> - **自动解析与 HMR**：在开发模式下，主应用的 Vite 服务器会自动递归解析这些相对导入，并为所有子组件、子模块提供同样丝滑的 HMR（热重载）支持。

Vite 会自动处理组件之间的依赖关系，无论你的项目结构如何。

#### 示例：`HelloWorld.vue`

```vue
<template>
  <div class="container">
    <InfoCard title="🎉 Hello World 插件">
      <el-input v-model="name" placeholder="输入你的名字" />
      <el-button @click="doGreet" :loading="isLoading" type="primary"
        >打招呼</el-button
      >
      <p v-if="greeting" class="greeting">{{ greeting }}</p>
    </InfoCard>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
// 导入 UI 组件库（插件需自行安装并打包这些依赖）
import { ElInput, ElButton } from "element-plus";
// 从 aiohub-ui 导入主应用封装的通用组件（由主应用通过 importmap 提供，无需打包）
import { InfoCard } from "aiohub-ui";
// 从 aiohub-sdk 导入工具函数（由主应用通过 importmap 提供，无需打包）
import { execute, customMessage, createModuleErrorHandler } from "aiohub-sdk";

const errorHandler = createModuleErrorHandler("HelloWorldPlugin");
const name = ref("");
const greeting = ref("");
const isLoading = ref(false);

async function doGreet() {
  if (!name.value) {
    customMessage.warning("请输入名字！");
    return;
  }
  isLoading.value = true;
  // 调用插件自身的 "greet" 方法
  const result = await execute({
    service: "example-hello-world", // 插件自身 ID
    method: "greet",
    params: { name: name.value },
  });
  isLoading.value = false;

  if (result.success) {
    greeting.value = result.data;
  } else {
    errorHandler.error(result.error, "调用失败");
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

- **原因**：生产环境下的插件位于用户数据目录，无法依赖主应用的 Vite 开发服务器进行实时编译。
- **工具**：使用 Vite 进行库模式 (`lib mode`) 构建。

#### 独立构建流程

对于具有 UI 的插件，推荐在插件目录内建立独立的构建流程。

1. **添加 `package.json`**：
   ```json
   {
     "devDependencies": {
       "@vitejs/plugin-vue": "^5.x",
       "vite": "^5.x",
       "vue": "^3.x"
     }
   }
   ```
2. **创建 `vite.config.ts`**：
   配置的核心是 **外部化 (externalize)** 所有由主应用通过 `importmap` 提供的依赖。

   ```typescript
   import { defineConfig } from "vite";
   import vue from "@vitejs/plugin-vue";
   import { resolve } from "path";

   export default defineConfig({
     plugins: [vue()],
     build: {
       lib: {
         // 入口文件可以是一个或多个
         entry: {
           index: resolve(__dirname, "index.ts"),
           VcpForum: resolve(__dirname, "VcpForum.vue"),
         },
         formats: ["es"],
         fileName: (format, entryName) => `${entryName}.js`,
       },
       rollupOptions: {
         // 必须排除这些由主应用共享的核心模块
         // 注意：element-plus 和图标库不在共享之列，插件应自行打包以保证兼容性
         external: ["vue", "aiohub-sdk", "aiohub-ui"],
       },
     },
   });
   ```

3. **创建构建脚本 (可选)**：使用 `build.js` 或 `build.bat` 等脚本，可以一键完成所有构建任务，例如：
   - 编译 Rust 后端 (对于 Sidecar/Native 插件)。
   - 编译 Vue 前端。
   - 将所有产物（后端可执行文件、前端 JS、`manifest.json` 等）整合到 `dist` 目录，方便打包和分发。

**最佳实践参考: `plugins/example-file-hasher/`**

`example-file-hasher` 是一个完美的 "Sidecar + Vue UI" 插件范例，它完整地展示了：

- 独立的 `package.json` 和 `vite.config.js`。
- 使用 `build.js` 统一构建 Rust 后端和 Vue 前端。
- 将复杂的 UI 拆分为多个子组件。
- 最终如何配置 `manifest.json` 以指向编译后的 `.js` 组件。

### 与插件后端及主应用交互

#### 调用插件自身方法

使用项目统一的 `execute` 函数，可以方便地调用插件在 `manifest.json` 中定义的任何方法。

```typescript
import { execute } from "aiohub-sdk";

// 假设 serviceId 是 'my-plugin', 方法是 'myMethod'
const result = await execute({
  service: "my-plugin",
  method: "myMethod",
  params: {
    /* ... */
  },
});
```

#### 使用主应用的 Composables 和工具

插件 UI 可以通过 `aiohub-sdk` 无缝接入主应用提供的所有前端能力。

```typescript
// 从 SDK 导入 Composables 和工具 (主应用共享)
import { useTheme, customMessage } from "aiohub-sdk";
// 从 aiohub-ui 导入组件 (主应用共享)
import { Avatar } from "aiohub-ui";
// 插件自备的依赖 (需自行打包)
import { ElButton } from "element-plus";

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
  - **极简配置**：`manifest.json` 直接指向 `.vue` 文件，无需构建流程。
  - **核心交互**：演示了如何在 UI (`HelloWorld.vue`) 中调用插件自身的 `greet` 方法。
  - **快速上手**：适合理解插件 UI 的基本工作流程。

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
import { ref } from "vue";
import { ElInput, ElButton } from "element-plus";
import { InfoCard } from "aiohub-ui"; // 从 aiohub-ui 导入主应用封装的通用组件
import { execute, customMessage, createModuleErrorHandler } from "aiohub-sdk"; // 从 aiohub-sdk 导入工具函数

const errorHandler = createModuleErrorHandler("HelloWorldPlugin");
const name = ref("");
const greeting = ref("");
const isLoading = ref(false);

async function doGreet() {
  if (!name.value) {
    customMessage.warning("请输入名字！");
    return;
  }
  isLoading.value = true;
  const result = await execute({
    service: "example-hello-world", // 插件自身 ID
    method: "greet",
    params: { name: name.value },
  });
  isLoading.value = false;

  if (result.success) {
    greeting.value = result.data;
  } else {
    errorHandler.error(result.error, "调用失败");
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
  - **独立构建**：包含 `package.json`, `vite.config.js` 和 `build.js`，演示了如何为生产环境编译 UI。
  - **复杂 UI**：展示了如何将 UI 拆分为多个子组件 (`components/` 目录)。
  - **前后端协作**：演示了 Vue UI 如何与 Rust Sidecar 后端进行交互。
  - **生产就绪**：是发布独立插件的绝佳模板。

### 示例 3：`aiohub-plugin-example-native` (进阶)

**这是一个原生插件的示例，其 UI 部分与 File Hasher 类似，也使用了独立的构建流程。**

- **仓库地址**: [https://github.com/miaotouy/aiohub-plugin-example-native](https://github.com/miaotouy/aiohub-plugin-example-native)
- **类型**: 原生插件 (Rust 后端 + Vue 前端)
- **特点**:
  - **独立构建**：同样包含 `package.json`, `vite.config.js` 和 `build.js`。
  - **原生后端**：演示了 UI 如何与高性能的原生 Rust 模块进行交互。

### 本地开发与测试

要在本地开发和测试插件（无论是克隆的示例还是你自己创建的），流程很简单：

1. 将完整的插件项目文件夹（例如，从 GitHub 克隆下来的 `aiohub-plugin-example-hello-world`）放入主应用的 `/plugins/` 目录中。
2. 启动主应用 (`bun run dev`)。

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

- 优先使用 Composition API。
- 使用 `h()` 函数或编译后的 ESM。
- 避免在插件中打包大型依赖。
- 复用主应用的 composables 和工具函数。

### 2. 样式处理

- 推荐使用 `<style scoped>` 进行样式隔离，避免全局样式污染。
- 生产环境下，Vite 构建时会将样式提取到独立的 `style.css` 文件中，主应用会自动加载同目录下的 `style.css`，无需手动在 JS 中引入样式。
- 使用 CSS 变量适配主题（如 `var(--card-bg)`、`var(--text-color)` 等）。

### 3. 错误处理

- 始终使用 try-catch 包裹异步操作。
- 向用户显示友好的错误消息。
- 记录详细的错误日志。

### 4. 性能优化

- 懒加载大型依赖。
- 使用 `shallowRef` 优化响应性。
- 避免不必要的重新渲染。

---

## 常见问题

### Q: 开发模式和生产模式的区别？

A:

- **开发模式**：支持直接使用 `.vue` 文件，享受 Vite HMR，无需手动编译。
- **生产模式**：需要预先将 `.vue` 编译为 `.js` 文件，因为生产环境无法动态编译。

### Q: 必须把所有 UI 代码写在一个 `.vue` 文件里吗？

A: 完全不需要！你可以像开发普通 Vue 项目一样，将 UI 拆分为任意多个子组件（如 `components/Header.vue`、`components/List.vue` 等），并在入口 `.vue` 文件中通过相对路径导入。主应用的 Vite 开发服务器会自动解析并热重载所有关联的子组件。

### Q: 如果我想用 React 或其他非 Vue 框架开发插件 UI 可以吗？

A: 可以。虽然主应用默认对 Vue `.vue` 文件提供了开箱即用的免编译 HMR 支持，但对于非 Vue 框架，你可以：

1. **开发阶段**：在插件目录内自行初始化一个前端项目，启动你自己的本地开发服务器（如 `localhost:3000`），并在开发配置中让主应用加载该本地服务地址。
2. **生产阶段**：使用你自己的构建工具（如 Vite、Webpack）将项目打包编译为单体 JavaScript 文件（ESM 格式），并在 `manifest.json` 的 `component` 字段中指向该编译产物。

### Q: 如何访问主应用的功能？

A: 通过导入主应用的 composables、工具函数和组件：

```javascript
import { useTheme, customMessage } from "aiohub-sdk";
```

### Q: 可以使用第三方库吗？

A: 可以，但建议：

- 优先使用主应用已有的依赖。
- 避免打包大型库（如 Vue、Element Plus）。
- 使用动态导入或本地按需打包减小体积，避免依赖联网 CDN，以提高离线可用性。

### Q: 插件 UI 支持窗口分离吗？

A: 是的，插件工具自动支持窗口分离，与内置工具行为一致。

### Q: 如何更新插件 UI？

A:

- **开发模式**：修改 `.vue` 文件后自动热重载（HMR），无需刷新。
- **生产模式**：需要重新安装插件或重启应用。

### Q: .vue 文件找不到模块怎么办？

A: 这是正常的 TypeScript 提示。在开发模式下，主应用会提供这些模块：

```vue
<script setup>
// 这些导入在运行时是有效的，由主应用通过 importmap 提供
import { execute, customMessage } from "aiohub-sdk";
import { ElButton } from "element-plus";
</script>
```

### Q: 必须使用 Vue 框架吗？

A: 不是。你只需要导出一个符合 Vue 组件接口的对象（最简单的形式就是一个带 `setup()` 函数的对象）。组件内部你可以用原生 DOM API、iframe 嵌入其他框架的页面，或者在 `onMounted` 中挂载 React/Preact 等其他框架的组件树。Vue 只是宿主环境的渲染引擎，不是插件开发的强制依赖。

### Q: 推荐使用哪种开发方式？

A:

- **想要最好的开发体验**：使用 `.vue` 文件，享受 HMR 和 scoped CSS。
- **想要零构建零依赖**：直接写 `.js` 文件，用 `h()` 或原生 DOM，开发和发布都不需要编译。
- **想用其他框架**：用 iframe 嵌入，或者在 Vue 组件的 `onMounted` 中挂载你的框架。
- **发布阶段**：确保最终产物是 `.js` 文件（纯 JS 方案无需额外步骤）。

---

## 相关文档

- [插件开发总览](./index.md)
- [JavaScript 插件开发](./js-plugin.md)
- [Sidecar 插件开发](./sidecar-plugin.md)
- [原生插件开发](./native-plugin.md)
