# 插件 UI 集成 - 第一阶段实施总结

**实施日期:** 2025-11-03  
**实施人:** 咕咕  
**状态:** ✅ 完成

## 实施内容

### 1. 创建动态工具配置中心 (`useToolsStore`)

**文件:** `src/stores/tools.ts`

- 使用 Pinia 创建了全局响应式的工具配置存储
- 初始状态从静态 `toolsConfig` 深拷贝而来
- 提供 `addTool` 和 `removeTool` 方法用于运行时动态管理工具

**核心特性:**
```typescript
interface ToolsStore {
  tools: ToolConfig[];           // 所有工具（内置 + 插件）
  addTool(tool: ToolConfig): void;    // 添加新工具
  removeTool(toolPath: string): void;  // 移除工具
}
```

### 2. 扩展插件类型定义

**文件:** `src/services/plugin-types.ts`

新增 `PluginUiConfig` 接口：
```typescript
interface PluginUiConfig {
  displayName?: string;  // 显示名称
  component: string;     // UI 组件入口文件路径
  icon?: string;        // 图标（未来支持）
}
```

在 `PluginManifest` 中添加可选的 `ui` 字段。

### 3. 改造路由系统

**文件:** `src/router/index.ts`

**主要改动:**
- 移除了基于静态 `toolsConfig` 的路由生成逻辑
- 引入 `useToolsStore` 作为路由数据源
- 实现动态路由管理：
  - 应用启动时为所有现有工具添加路由
  - 使用 `watch` 监听 `tools` 变化
  - 工具添加时自动调用 `router.addRoute()`
  - 工具移除时自动调用 `router.removeRoute()`

**辅助函数:**
- `pathToRouteName()`: 将路径转换为路由名称
- `createToolRoute()`: 为工具创建路由配置
- `addToolRoute()`: 添加工具路由
- `removeToolRoute()`: 移除工具路由

### 4. 改造 UI 组件

#### 4.1 主侧边栏 (`src/components/MainSidebar.vue`)

**改动:**
- 移除对静态 `toolsConfig` 的导入
- 引入 `useToolsStore`
- 将 `visibleTools` 的数据源从 `toolsConfig` 切换到 `toolsStore.tools`

#### 4.2 工具设置页 (`src/views/components/ToolsSettings.vue`)

**改动:**
- 移除对静态 `toolsConfig` 的导入
- 引入 `useToolsStore`
- `initializeTools()` 和 `resetOrder()` 从 store 获取工具列表

### 5. 改造插件管理器

**文件:** `src/services/plugin-manager.ts`

**新增功能:**

1. **`registerPluginUi(plugin: PluginProxy)`**
   - 检查插件是否有 `ui` 配置
   - 构造 `ToolConfig` 对象
   - 调用 `toolsStore.addTool()` 注册UI

2. **`unregisterPluginUi(pluginId: string)`**
   - 从 `toolsStore` 移除插件工具

3. **`createPluginComponentLoader(pluginPath, componentFile)`**
   - 占位函数，用于未来实现外部组件动态加载
   - 当前返回错误提示（第二阶段实现）

**集成点:**
- `loadAllPlugins()`: 加载插件后自动注册UI
- `uninstallPlugin()`: 卸载前先移除UI
- `installPluginFromZip()`: 安装新插件后注册UI

## 技术实现要点

### 响应式设计
- 使用 Pinia 的响应式 state
- Vue 的 `watch` API 监听变化
- 确保 UI 与数据源自动同步

### 路由管理
- 动态添加/移除路由而无需重启应用
- 路由名称基于工具路径自动生成
- 避免路由重复添加

### 插件路径规范
- 插件工具路径格式: `/plugin-{pluginId}`
- 与内置工具路径区分开

## 已知限制

### 1. 组件动态加载未实现
`createPluginComponentLoader` 目前只是占位函数，实际的外部组件加载需要：
- 使用 Tauri 的 `convertFileSrc` API
- 实现动态 Vue 组件加载机制
- 这是第二阶段的工作

### 2. 插件图标支持有限
当前使用固定的占位SVG图标，未来需要支持：
- Emoji
- 自定义 SVG 路径
- `appdata://` 协议的图片

## 测试建议

### 单元测试
1. 测试 `useToolsStore` 的 `addTool` 和 `removeTool`
2. 验证路由动态添加/移除逻辑
3. 测试插件UI注册/注销流程

### 集成测试
1. 创建测试插件（带 `ui` 配置）
2. 验证插件加载后UI是否出现在侧边栏
3. 验证路由是否正确注册
4. 验证插件卸载后UI是否消失

### 手动测试
1. 启动应用，确认现有工具正常显示
2. 在 `/plugins` 目录创建测试插件
3. 重载应用，检查插件是否出现在侧边栏和设置页
4. 尝试导航到插件路由（会看到"未实现"错误，符合预期）

## 下一步工作（第二阶段）

1. **实现外部组件动态加载**
   - 研究 Tauri 的 `convertFileSrc` API
   - 创建 Vue 组件包装器支持远程加载
   - 处理组件加载错误

2. **支持插件图标**
   - 实现图标资源加载
   - 支持多种图标格式

3. **窗口分离集成**
   - 改造 `DetachedWindowContainer.vue`
   - 支持插件工具的窗口分离

## 结论

第一阶段已成功实现核心基础设施：

✅ 动态工具配置中心  
✅ 插件类型扩展  
✅ 动态路由管理  
✅ UI组件改造  
✅ 插件管理器集成  

虽然外部组件加载尚未实现，但架构已完整搭建，为后续开发奠定了坚实基础。