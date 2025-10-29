# 自定义窗口配置管理系统

本文档说明如何使用新的窗口配置管理系统，该系统完全取代了 `tauri-plugin-window-state` 插件。

## 概述

新系统是一个**手动、显式**的窗口配置管理工具，提供以下核心功能：

- ✅ 保存窗口的位置、尺寸和最大化状态
- ✅ 在窗口创建时自动恢复配置（如果存在）
- ✅ 在窗口关闭时自动保存配置
- ✅ 完全可控，无意外的自动恢复行为

## 核心设计

### 工作原理

1. **创建时恢复**：窗口创建后，系统会自动查找并应用保存的配置
2. **关闭时保存**：窗口关闭前，系统会自动保存当前状态
3. **配置存储**：所有配置保存在 `AppData/com.mty.aiohub/window-configs.json`
4. **智能保护**：系统会自动跳过保存以下异常状态的窗口：
   - 窗口被最小化
   - 窗口被隐藏
   - 窗口位置异常（如 Windows 的特殊隐藏坐标 < -10000）
   - 窗口尺寸过小（宽度 < 200px 或高度 < 100px）

### 配置文件格式

```json
{
  "main": {
    "x": 100,
    "y": 100,
    "width": 1280,
    "height": 768,
    "maximized": false
  },
  "detached-jsonFormatter": {
    "x": 500,
    "y": 300,
    "width": 900,
    "height": 700,
    "maximized": true
  }
}
```

## Tauri 命令 API

### `save_window_config`

手动保存指定窗口的配置。

```typescript
import { invoke } from '@tauri-apps/api/core';

await invoke('save_window_config', { label: 'main' });
```

### `apply_window_config`

手动应用保存的配置到当前窗口。

```typescript
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';

const window = getCurrentWebviewWindow();
const applied = await invoke('apply_window_config', { window });
// 返回 true 表示应用了配置，false 表示没有保存的配置
```

### `delete_window_config`

删除指定窗口的配置。

```typescript
await invoke('delete_window_config', { label: 'detached-jsonFormatter' });
```

### `clear_all_window_configs`

清除所有窗口配置。

```typescript
await invoke('clear_all_window_configs');
```

### `get_saved_window_labels`

获取所有已保存配置的窗口标签列表。

```typescript
const labels: string[] = await invoke('get_saved_window_labels');
console.log('已保存配置的窗口:', labels);
```

## 自动集成

系统已在以下位置自动集成：

### 1. 窗口创建时（自动恢复）

- **主窗口**：`src-tauri/src/lib.rs` 的 `setup` 函数中
- **分离窗口**：`src-tauri/src/commands/window_manager.rs` 的 `create_preview_window_internal` 函数中

### 2. 窗口关闭时（自动保存）

- **所有窗口**：`src-tauri/src/lib.rs` 的 `on_window_event` 中，监听 `CloseRequested` 事件

## 可选：前端实时保存

如果需要在用户移动或调整窗口尺寸时实时保存配置（而不仅在关闭时），可以在前端添加以下代码：

```typescript
import { getCurrentWebviewWindow } from '@tauri-apps/api/webviewWindow';
import { invoke } from '@tauri-apps/api/core';
import { debounce } from 'lodash-es';

const appWindow = getCurrentWebviewWindow();
const windowLabel = appWindow.label;

// 使用防抖函数，避免频繁保存
const debouncedSave = debounce(async () => {
  try {
    await invoke('save_window_config', { label: windowLabel });
    console.log(`[WINDOW_CONFIG] 已保存窗口配置: ${windowLabel}`);
  } catch (error) {
    console.error('[WINDOW_CONFIG] 保存配置失败:', error);
  }
}, 500); // 500ms 防抖

// 监听窗口事件
onMounted(() => {
  const unlistenMoved = appWindow.onMoved(() => {
    debouncedSave();
  });
  
  const unlistenResized = appWindow.onResized(() => {
    debouncedSave();
  });

  // 清理监听器
  onUnmounted(() => {
    unlistenMoved.then(fn => fn());
    unlistenResized.then(fn => fn());
  });
});
```

**建议的使用位置**：
- `src/components/TitleBar.vue`（如果所有窗口都有标题栏）
- 或在各个窗口组件中单独添加

## 与旧插件的对比

| 特性 | 旧插件 (tauri-plugin-window-state) | 新系统 (window_config) |
|------|-----------------------------------|----------------------|
| 自动保存 | ✅ 全局自动 | ✅ 关闭时自动 + 可选实时 |
| 自动恢复 | ✅ 全局自动 | ✅ 创建时自动 |
| 可控性 | ❌ 黑箱，无法干预 | ✅ 完全透明，可手动控制 |
| 意外恢复 | ❌ 存在意外恢复问题 | ✅ 无意外行为 |
| 排除窗口 | ❌ 不支持 | ✅ 可通过代码逻辑控制 |
| 调试友好 | ❌ 难以追踪 | ✅ 所有操作都有日志 |

## 故障排除

### 配置未生效

1. 检查配置文件是否存在：
   ```typescript
   const labels = await invoke('get_saved_window_labels');
   console.log('已保存的窗口:', labels);
   ```

2. 检查配置文件内容：打开 `AppData/com.mty.aiohub/window-configs.json`

3. 查看控制台日志：所有配置操作都会输出 `[WINDOW_CONFIG]` 前缀的日志

### 窗口位置异常

如果发现窗口位置出现异常（如超出屏幕范围或在屏幕外），可能是由于：

1. **配置文件被污染**：在窗口最小化或隐藏时错误地保存了配置
   - **解决方法**：清除所有配置并重新保存
   ```typescript
   await invoke('clear_all_window_configs');
   ```

2. **多显示器配置变化**：拔掉外接显示器后窗口位置失效
   - **系统会自动保护**：新版本会自动跳过保存异常位置（坐标 < -10000）

3. **窗口在托盘模式下隐藏时保存**
   - **系统会自动保护**：新版本会自动跳过保存隐藏或最小化的窗口

### 重置所有配置

方法一：使用托盘菜单
1. 右键点击系统托盘中的 AIO Hub 图标
2. 选择"清除窗口配置"

方法二：使用命令
```typescript
await invoke('clear_all_window_configs');
```

方法三：手动删除配置文件
- 路径：`%AppData%/com.mty.aiohub/window-configs.json`

## 迁移指南

从旧插件迁移到新系统：

1. ✅ **已完成**：移除 `tauri-plugin-window-state` 依赖
2. ✅ **已完成**：集成新的 `window_config` 模块
3. ✅ **已完成**：自动保存和恢复已配置
4. ⏳ **可选**：添加前端实时保存（根据需求）

## 总结

新系统提供了一个**简单、透明、可控**的窗口配置管理方案，彻底解决了旧插件的意外恢复问题，同时保留了便利的自动保存和恢复功能。