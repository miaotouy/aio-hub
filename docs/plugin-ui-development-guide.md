# 插件 UI 开发指南

**版本:** 2.0  
**最后更新:** 2025-11-03  
**作者:** 咕咕

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

- **Vue 3** - 使用 Composition API
- **ES Modules** - 组件必须是编译后的 ESM 格式
- **Tauri API** - 用于与后端通信

### 开发模式支持

✅ **开发模式现已支持直接使用 .vue 单文件组件！**

在开发模式下（`npm run dev`），插件可以：
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

## UI 组件开发

### 🎯 方式一：Vue 单文件组件（推荐，仅开发模式）

**适用场景**：开发模式下快速开发和调试

```vue
<!-- MyComponent.vue -->
<template>
  <div class="my-component">
    <el-card shadow="never">
      <h2>My Plugin</h2>
      <p>Count: {{ count }}</p>
      <el-button @click="increment">Increment</el-button>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { ElCard, ElButton } from 'element-plus';
import { execute } from '@/services/executor';
import { customMessage } from '@/utils/customMessage';

const count = ref(0);
const increment = () => {
  count.value++;
  customMessage.success('计数增加！');
};
</script>

<style scoped>
.my-component {
  padding: 20px;
}
</style>
```

**manifest.json 配置**：
```json
{
  "ui": {
    "displayName": "My Plugin",
    "component": "MyComponent.vue",
    "icon": "🎨"
  }
}
```

**优势**：
- ✅ 直接使用 `<template>` 语法，开发体验好
- ✅ 支持 `<script setup>` 和 TypeScript
- ✅ 支持 `<style scoped>` 样式隔离
- ✅ 享受 Vite HMR，修改即时生效
- ✅ 可使用 Element Plus、VueUse 等库
- ✅ 可导入主应用的 composables 和工具函数

### 方式二：手写 h() 渲染函数（跨模式兼容）

**适用场景**：需要同时支持开发和生产模式，或组件逻辑简单

```javascript
// MyComponent.js
import { ref, h } from 'vue';
import { ElCard, ElButton } from 'element-plus';

export default {
  name: 'MyComponent',
  setup() {
    const count = ref(0);
    const increment = () => count.value++;

    return () => h(ElCard, { shadow: 'never' }, () => [
      h('h2', null, 'My Plugin'),
      h('p', null, `Count: ${count.value}`),
      h(ElButton, { onClick: increment }, () => 'Increment')
    ]);
  }
};
```

### 方式三：编译 .vue 为 .js（生产环境）

**适用场景**：准备发布生产环境插件

#### 步骤 1: 创建 Vite 配置

```javascript
// vite.config.js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: './src/MyComponent.vue',
      name: 'MyComponent',
      fileName: 'MyComponent',
      formats: ['es']
    },
    rollupOptions: {
      external: ['vue', 'element-plus', '@tauri-apps/api/core'],
      output: {
        globals: {
          vue: 'Vue',
          'element-plus': 'ElementPlus'
        }
      }
    }
  }
});
```

#### 步骤 2: 构建组件

```bash
npm install -D vite @vitejs/plugin-vue
npm run build
```

输出文件 `dist/MyComponent.js` 可在生产环境使用。

### 与后端交互

使用 Tauri 的 `invoke` API 调用插件方法：

```javascript
import { invoke } from '@tauri-apps/api/core';

// 调用插件方法
const result = await invoke('call_service_method', {
  serviceId: 'your-plugin-id',
  methodName: 'yourMethod',
  args: [arg1, arg2]
});
```

### 使用应用提供的 Composables 和组件

插件可以直接导入使用主应用的资源：

**Vue SFC 方式**：
```vue
<template>
  <div>
    <el-button @click="handleClick">点击</el-button>
  </div>
</template>

<script setup>
import { ElButton } from 'element-plus';
import { useTheme } from '@/composables/useTheme';
import { useAssetManager } from '@/composables/useAssetManager';
import { customMessage } from '@/utils/customMessage';
import { execute } from '@/services/executor';

const { currentTheme } = useTheme();
const assetManager = useAssetManager();

const handleClick = async () => {
  customMessage.success('操作成功！');
  console.log('Current theme:', currentTheme.value);
};
</script>
```

**h() 函数方式**：
```javascript
import { h } from 'vue';
import { ElButton } from 'element-plus';
import { useTheme } from '@/composables/useTheme';
import { customMessage } from '@/utils/customMessage';

export default {
  setup() {
    const { currentTheme } = useTheme();
    
    const handleClick = () => {
      customMessage.success('操作成功！');
      console.log('Current theme:', currentTheme.value);
    };
    
    return () => h('div', null, [
      h(ElButton, { onClick: handleClick }, () => '点击')
    ]);
  }
};
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

### 官方示例插件仓库

我们提供了一个独立的示例插件仓库供参考：

**仓库地址**: [待创建 - aio-hub-plugin-hello-world]

开发者可以：
1. Clone 该仓库作为插件开发模板
2. 参考其中的完整实现
3. 根据需求修改和扩展

### 本地开发测试

开发时，将插件放入主应用的 `/plugins/` 目录：

**使用 .vue 文件（开发模式）**：
```
your-app/
└── plugins/
    └── example-hello-world/    # 你的插件
        ├── manifest.json       # 插件清单
        ├── index.ts            # 后端逻辑（TypeScript）
        ├── HelloWorld.vue      # UI 组件（.vue 文件）
        └── README.md           # 说明文档
```

**使用 .js 文件（生产/兼容模式）**：
```
your-app/
└── plugins/
    └── hello-world/        # 你的插件
        ├── manifest.json   # 插件清单
        ├── index.js        # 后端逻辑（编译后）
        ├── HelloWorld.js   # UI 组件（编译后）
        └── README.md       # 说明文档
```

**注意**: `/plugins/` 目录已在 `.gitignore` 中，不会提交到主仓库。

### manifest.json

```json
{
  "id": "hello-world",
  "name": "Hello World 插件",
  "version": "1.0.0",
  "description": "示例插件",
  "author": "咕咕",
  "host": {
    "appVersion": ">=0.1.0"
  },
  "type": "javascript",
  "main": "index.js",
  "methods": [
    {
      "name": "greet",
      "displayName": "打招呼",
      "description": "返回问候消息",
      "parameters": [
        {
          "name": "name",
          "type": "string",
          "description": "名字"
        }
      ],
      "returnType": "string"
    }
  ],
  "ui": {
    "displayName": "Hello World",
    "component": "HelloWorld.js",
    "icon": "🎉"
  }
}
```

### index.js

```javascript
export default {
  greet(name) {
    return `你好，${name}！欢迎使用插件系统 🎉`;
  }
};
```

### HelloWorld.js

```javascript
import { ref, h } from 'vue';

export default {
  setup() {
    const name = ref('');
    const greeting = ref('');

    const greet = async () => {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke('call_service_method', {
        serviceId: 'hello-world',
        methodName: 'greet',
        args: [name.value]
      });
      greeting.value = result;
    };

    return () => h('div', { style: { padding: '20px' } }, [
      h('h2', null, '🎉 Hello World'),
      h('input', {
        value: name.value,
        onInput: (e) => { name.value = e.target.value; },
        placeholder: '输入名字'
      }),
      h('button', { onClick: greet }, '打招呼'),
      greeting.value ? h('p', null, greeting.value) : null
    ]);
  }
};
```

---

## 测试与调试

### 开发模式测试

1. 将插件放在主应用的 `/plugins/` 目录
2. 启动应用（`npm run dev`）
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

- [插件系统设计文档](./plugin-system-design.md)
- [插件开发指南](./plugin-development-guide.md)
- [插件 UI 集成计划](./plugin-ui-integration-plan.md)
- [插件 UI 集成实施总结](./plugin-ui-integration-phase2-summary.md)

---

**反馈与建议**

如有问题或建议，请联系项目维护者。