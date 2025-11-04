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

### 重要约束

⚠️ **插件 UI 组件必须是编译后的 JavaScript 文件（.js 或 .mjs）**

不能直接使用 `.vue` 单文件组件，因为：
- 插件位于外部目录，Vite 无法处理
- 需要通过 `convertFileSrc` API 动态加载
- 浏览器不支持直接执行 `.vue` 文件

### 开发工具链

你需要一个构建流程将 `.vue` 文件编译为 ESM JS：

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

### 方式一：使用 h() 渲染函数（推荐用于简单组件）

这是最直接的方式，无需构建工具：

```javascript
// MyComponent.js
import { ref, h } from 'vue';

export default {
  name: 'MyComponent',
  setup() {
    const count = ref(0);
    const increment = () => count.value++;

    return () => h('div', { class: 'my-component' }, [
      h('h2', null, 'My Plugin'),
      h('p', null, `Count: ${count.value}`),
      h('button', { onClick: increment }, 'Increment')
    ]);
  }
};
```

### 方式二：编译 .vue 文件（推荐用于复杂组件）

#### 步骤 1: 创建 Vue 组件

```vue
<!-- src/MyComponent.vue -->
<template>
  <div class="my-component">
    <h2>My Plugin</h2>
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const count = ref(0);
const increment = () => count.value++;
</script>

<style scoped>
.my-component {
  padding: 20px;
}
</style>
```

#### 步骤 2: 创建 Vite 配置

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
      external: ['vue', '@tauri-apps/api/core'],
      output: {
        globals: {
          vue: 'Vue'
        }
      }
    }
  }
});
```

#### 步骤 3: 构建组件

```bash
npm install -D vite @vitejs/plugin-vue
npm run build
```

输出文件 `dist/MyComponent.js` 即可在插件中使用。

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

### 使用应用提供的 Composables

插件组件可以使用应用提供的所有 composables：

```javascript
import { useTheme } from '@/composables/useTheme';
import { useAssetManager } from '@/composables/useAssetManager';
import { customMessage } from '@/utils/customMessage';

export default {
  setup() {
    const { currentTheme } = useTheme();
    const assetManager = useAssetManager();
    
    // 使用主题
    console.log('Current theme:', currentTheme.value);
    
    // 显示消息
    customMessage.success('操作成功！');
    
    return () => h('div', null, 'Hello');
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

```
your-app/
└── plugins/
    └── hello-world/        # 你的插件
        ├── manifest.json   # 插件清单
        ├── index.ts        # 后端逻辑（TypeScript）
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

### Q: 为什么不支持 .vue 文件？

A: 插件位于外部目录，Vite 的构建系统无法处理。必须使用编译后的 JavaScript。

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

A: 修改组件文件后，重新加载应用即可。开发模式下支持热重载。

---

## 相关文档

- [插件系统设计文档](./plugin-system-design.md)
- [插件开发指南](./plugin-development-guide.md)
- [插件 UI 集成计划](./plugin-ui-integration-plan.md)
- [插件 UI 集成实施总结](./plugin-ui-integration-phase2-summary.md)

---

**反馈与建议**

如有问题或建议，请联系项目维护者。