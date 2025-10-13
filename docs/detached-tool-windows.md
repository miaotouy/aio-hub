# 工具窗口分离功能

## 功能概述

本功能允许用户将工具从主窗口中拖拽出来，创建独立的工具窗口。类似于浏览器的标签页拖拽功能，为多任务工作提供更灵活的布局方式。

## 主要特性

### 1. 拖拽分离
- 在侧边栏中长按并拖拽工具菜单项
- 当拖拽超出主窗口边界一定距离（100像素）时，松开鼠标即可创建独立窗口
- 分离的工具会在主窗口的侧边栏中隐藏，避免重复显示

### 2. 独立窗口
- 每个分离的工具都有自己的独立窗口
- 窗口默认大小为 900x700 像素
- 窗口采用无边框设计，与主窗口风格一致
- 支持最小化、最大化、拖动等标准窗口操作

### 3. 智能聚焦
- 在主页点击已分离的工具卡片，会自动聚焦到对应的窗口
- 已分离的工具卡片会显示特殊的视觉效果（渐变背景和边框）
- 卡片右上角会显示"已分离"徽章

### 4. 窗口位置管理
- 系统每30秒自动检查所有工具窗口的位置
- 如果窗口移到屏幕外（例如断开外接显示器），会自动将其拉回可见区域
- 确保窗口始终可访问

### 5. 状态同步
- 主窗口和工具窗口之间通过 Tauri 事件系统实时同步状态
- 关闭工具窗口后，它会自动重新出现在主窗口的侧边栏中
- 所有窗口共享同一个状态管理器

## 技术实现

### 后端（Rust）

#### 新增命令

1. **create_tool_window**: 创建工具窗口
   - 参数：`WindowConfig { label, title, url, width, height }`
   - 返回：创建结果消息

2. **focus_window**: 聚焦指定窗口
   - 参数：窗口标签（label）
   - 功能：将窗口带到前台并设置焦点

3. **get_window_position**: 获取窗口位置
   - 参数：窗口标签
   - 返回：窗口的 x, y 坐标

4. **set_window_position**: 设置窗口位置
   - 参数：窗口标签和目标坐标
   - 功能：移动窗口到指定位置

5. **ensure_window_visible**: 确保窗口在可见区域
   - 参数：窗口标签
   - 返回：是否进行了位置调整

6. **get_all_tool_windows**: 获取所有工具窗口列表
   - 返回：所有非主窗口的标签列表

#### 事件系统

- **tool-detached**: 工具被分离时触发，携带工具ID
- **tool-attached**: 工具窗口关闭时触发，通知主窗口恢复显示

### 前端（Vue + TypeScript）

#### 独立窗口容器 (DetachedWindowContainer.vue)

专门为独立工具窗口设计的简洁容器组件：

- 只包含标题栏和内容区域，不包含侧边栏等主窗口 UI 元素
- 使用 `router-view` 渲染工具组件，保持与主窗口相同的路由系统
- 通过 URL 查询参数接收工具信息：
  - `toolPath`: 工具的路由路径
  - `title`: 窗口标题

#### Composable: useDetachedTools

全局状态管理器，提供以下功能：

- `initializeListeners()`: 初始化事件监听器
- `createToolWindow(config)`: 创建工具窗口
- `focusWindow(label)`: 聚焦窗口
- `ensureWindowVisible(label)`: 确保窗口可见
- `isToolDetached(toolId)`: 检查工具是否已分离
- `getDetachedTools`: 获取所有已分离工具的列表

#### UI 更新

1. **App.vue**
   - 添加拖拽事件处理（dragstart, dragend）
   - 过滤已分离的工具，不在侧边栏显示
   - 检测独立窗口模式（URL 参数 `?detached=true`）
   - 在独立模式下隐藏侧边栏

2. **HomePage.vue**
   - 已分离工具显示特殊样式
   - 点击已分离工具时聚焦其窗口，而非导航
   - 显示"已分离"徽章

## 使用说明

### 如何分离工具

1. 在主窗口侧边栏找到要分离的工具
2. 按住鼠标左键并开始拖拽
3. 将鼠标拖出主窗口边界
4. 松开鼠标，工具窗口将自动创建

### 如何重新附着工具

只需关闭独立的工具窗口，它会自动回到主窗口的侧边栏中。

### 如何聚焦已分离的工具

在主窗口的主页中，点击已分离工具的卡片（带有"已分离"徽章），系统会自动聚焦到对应窗口。

## 注意事项

1. **拖拽阈值**: 拖拽距离必须超过100像素才会创建窗口，避免误操作
2. **边界检测**: 拖拽必须超出窗口边界至少50像素
3. **窗口唯一性**: 每个工具只能有一个独立窗口，重复创建会直接聚焦现有窗口
4. **自动恢复**: 窗口位置检查每30秒运行一次，确保窗口不会丢失

## 未来改进方向

1. 支持自定义窗口大小和位置
2. 记忆窗口的位置和大小设置
3. 支持窗口分组和排列
4. 添加窗口缩略图预览
5. 支持拖拽标签栏项目（类似 Chrome）
6. 支持快捷键切换窗口

## 文件结构

```
src/
├── composables/
│   └── useDetachedTools.ts          # 全局状态管理
├── App.vue                           # 主应用（拖拽处理）
├── HomePage.vue                      # 主页（已分离工具显示）
└── src-tauri/
    └── src/
        └── commands/
            └── window_manager.rs     # 窗口管理命令
```

## API 参考

### WindowConfig 接口

```typescript
interface WindowConfig {
  label: string;      // 窗口唯一标识符
  title: string;      // 窗口标题
  url: string;        // 窗口 URL（相对路径）
  width?: number;     // 窗口宽度（默认900）
  height?: number;    // 窗口高度（默认700）
}
```

### 使用示例

```typescript
import { useDetachedTools } from '@/composables/useDetachedTools';

const { createToolWindow, isToolDetached, focusWindow } = useDetachedTools();

// 创建工具窗口
await createToolWindow({
  label: 'jsonFormatter',
  title: 'JSON 格式化',
  url: '/json-formatter?detached=true',
  width: 900,
  height: 700
});

// 检查工具是否已分离
if (isToolDetached('jsonFormatter')) {
  // 聚焦窗口
  await focusWindow('jsonFormatter');
}