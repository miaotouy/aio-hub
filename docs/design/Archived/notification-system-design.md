# 消息通知系统设计文档

## 1. 概述

### 1.1 设计目标

构建一个类似 Windows 11 通知中心的消息系统，提供：

- **持久化消息存储**：消息默认永久保留，支持手动清理
- **全局通知面板**：侧边抽屉式设计，可随时唤出查看历史消息
- **已读/未读管理**：清晰的状态标识和一键操作
- **统一 API 接口**：供各工具模块便捷调用
- **可选系统集成**：支持推送到操作系统原生通知中心

### 1.2 核心特性

- ✅ 消息持久化（重启应用后保留）
- ✅ 已读/未读状态管理
- ✅ 消息分类（info/success/warning/error/system）
- ✅ 时间戳与相对时间显示
- ✅ 点击跳转（支持路由导航）
- ✅ 毛玻璃效果适配
- ✅ 主题自适应
- 🔄 系统通知推送（可选，后期实现）

---

## 2. 架构设计

### 2.1 技术栈

- **状态管理**: Pinia
- **持久化**: `tauri-plugin-store` (优先) / `localStorage` (降级)
- **UI 框架**: Element Plus + 自定义组件
- **主题系统**: 集成 `useThemeAppearance`

### 2.2 目录结构

```
src/
├── types/
│   └── notification.ts              # 类型定义
├── stores/
│   └── notification.ts              # 状态管理与持久化
├── composables/
│   └── useNotification.ts           # 便捷 API 封装
└── components/
    └── notification/
        ├── NotificationCenter.vue   # 消息中心主面板
        ├── NotificationItem.vue     # 单条消息卡片
        └── NotificationBell.vue     # 触发入口（铃铛图标）
```

---

## 3. 数据模型

### 3.1 Notification 接口

```typescript
interface Notification {
  id: string; // 唯一标识符 (nanoid)
  title: string; // 消息标题
  content: string; // 消息正文（支持简单文本）
  type: NotificationType; // 消息类型
  timestamp: number; // 发送时间戳
  read: boolean; // 已读状态
  source?: string; // 来源标识（如 'llm-chat', 'system'）
  metadata?: NotificationMetadata; // 附加数据
}

type NotificationType = "info" | "success" | "warning" | "error" | "system";

interface NotificationMetadata {
  path?: string; // 点击后跳转的路由路径
  action?: string; // 自定义操作标识
  data?: Record<string, any>; // 任意附加数据
}
```

### 3.2 存储键名

- **Store Key**: `app-notifications`
- **格式**: JSON 数组

---

## 4. Store 设计 (`notification.ts`)

### 4.1 State

```typescript
interface NotificationState {
  notifications: Notification[];
  centerVisible: boolean; // 消息中心面板显示状态
}
```

### 4.2 Getters

```typescript
// 未读消息数量
unreadCount: (state) => state.notifications.filter((n) => !n.read).length;

// 按时间倒序排列的消息列表
sortedNotifications: (state) => [...state.notifications].sort((a, b) => b.timestamp - a.timestamp);

// 未读消息列表
unreadNotifications: (state) => state.notifications.filter((n) => !n.read);
```

### 4.3 Actions

```typescript
// 添加新消息
push(payload: Omit<Notification, 'id' | 'timestamp' | 'read'>): void

// 标记单条已读
markRead(id: string): void

// 全部标记已读
markAllRead(): void

// 删除单条消息
remove(id: string): void

// 清空所有消息
clearAll(): void

// 切换面板显示状态
toggleCenter(): void

// 加载持久化数据
loadFromStorage(): Promise<void>

// 保存到持久化存储
saveToStorage(): Promise<void>
```

### 4.4 持久化策略

- **初始化**: 应用启动时从 `tauri-plugin-store` 加载
- **自动保存**: 每次状态变更后自动保存（使用 `watch` 或在 action 中调用）
- **降级方案**: 如果 Tauri Store 不可用，降级到 `localStorage`

---

## 5. Composable 设计 (`useNotification.ts`)

### 5.1 API 接口

```typescript
interface UseNotificationReturn {
  // 便捷方法
  info(title: string, content: string, options?: NotificationOptions): void;
  success(title: string, content: string, options?: NotificationOptions): void;
  warning(title: string, content: string, options?: NotificationOptions): void;
  error(title: string, content: string, options?: NotificationOptions): void;
  system(title: string, content: string, options?: NotificationOptions): void;

  // 通用方法
  send(notification: Omit<Notification, "id" | "timestamp" | "read">): void;

  // 状态访问
  unreadCount: ComputedRef<number>;
  centerVisible: ComputedRef<boolean>;

  // 操作方法
  toggleCenter(): void;
  markRead(id: string): void;
  markAllRead(): void;
  remove(id: string): void;
  clearAll(): void;
}

interface NotificationOptions {
  source?: string;
  metadata?: NotificationMetadata;
  pushToSystem?: boolean; // 是否同时推送到系统通知
}
```

### 5.2 使用示例

```typescript
// 在任意组件或工具中
import { useNotification } from "@/composables/useNotification";

const notify = useNotification();

// 发送信息类消息
notify.info("任务完成", "文件已成功导出到桌面");

// 发送错误消息并附带跳转
notify.error("API 请求失败", "无法连接到服务器", {
  source: "llm-chat",
  metadata: {
    path: "/settings",
    data: { section: "llm-api" },
  },
});

// 发送系统消息
notify.system("更新可用", "发现新版本 v0.5.0", {
  metadata: {
    action: "check-update",
  },
});
```

---

## 6. UI 组件设计

### 6.1 NotificationBell.vue（入口组件）

**位置**: [`TitleBar.vue`](../../src/components/TitleBar.vue) 右侧控制区，设置按钮左侧

**功能**:

- 显示铃铛图标（使用 `lucide-vue-next` 的 `Bell` 图标）
- 显示未读数 Badge（使用 `el-badge`）
- 点击切换消息中心面板显示状态
- 有新消息时播放抖动动画（可选）

**Props**: 无

**样式要点**:

```scss
.notification-bell {
  position: relative;

  // 未读时的视觉提示
  &.has-unread {
    .bell-icon {
      animation: ring 0.5s ease-in-out;
    }
  }
}

@keyframes ring {
  0%,
  100% {
    transform: rotate(0deg);
  }
  25% {
    transform: rotate(-15deg);
  }
  75% {
    transform: rotate(15deg);
  }
}
```

---

### 6.2 NotificationCenter.vue（主面板）

**位置**: [`GlobalProviders.vue`](../../src/components/GlobalProviders.vue) 中挂载

**布局**: 使用 `el-drawer`，从右侧滑出

**结构**:

```
┌─────────────────────────────┐
│  消息中心          [全部已读] │  ← 头部
├─────────────────────────────┤
│  ┌─────────────────────┐   │
│  │ NotificationItem    │   │  ← 消息列表
│  └─────────────────────┘   │
│  ┌─────────────────────┐   │
│  │ NotificationItem    │   │
│  └─────────────────────┘   │
│           ...               │
├─────────────────────────────┤
│  [清空所有消息]              │  ← 底部操作
└─────────────────────────────┘
```

**Props**:

```typescript
interface Props {
  modelValue: boolean; // 显示状态（v-model）
}
```

**功能**:

- 头部显示标题和"全部已读"按钮
- 中间区域滚动列表展示消息
- 空状态提示（无消息时）
- 底部"清空所有消息"按钮（带二次确认）
- 支持毛玻璃效果（`backdrop-filter: blur(var(--ui-blur))`）

**样式要点**:

```scss
.notification-center {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));

  .center-header {
    padding: 16px;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .notification-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .center-footer {
    padding: 12px;
    border-top: 1px solid var(--border-color);
  }
}
```

---

### 6.3 NotificationItem.vue（消息卡片）

**Props**:

```typescript
interface Props {
  notification: Notification;
}
```

**布局**:

```
┌────────────────────────────────┐
│ [图标] 标题            [×]      │  ← 头部（类型图标 + 标题 + 删除按钮）
│        内容文本...              │  ← 正文
│        3分钟前 · 来源: LLM Chat │  ← 底部（时间 + 来源）
└────────────────────────────────┘
```

**功能**:

- 根据 `type` 显示对应图标和颜色
  - `info`: 蓝色，`Info` 图标
  - `success`: 绿色，`CheckCircle` 图标
  - `warning`: 橙色，`AlertTriangle` 图标
  - `error`: 红色，`XCircle` 图标
  - `system`: 灰色，`Settings` 图标
- 未读消息有视觉高亮（左侧蓝色竖线或整体背景高亮）
- 点击卡片：
  - 标记为已读
  - 如果有 `metadata.path`，跳转到对应路由
- 悬停显示删除按钮
- 相对时间显示（使用 `date-fns` 的 `formatDistanceToNow`）

**样式要点**:

```scss
.notification-item {
  background-color: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  cursor: pointer;
  transition: all 0.2s;

  // 未读状态
  &.unread {
    border-left: 3px solid var(--el-color-primary);
    background-color: rgba(var(--el-color-primary-rgb), 0.05);
  }

  &:hover {
    box-shadow: var(--el-box-shadow-light);
    transform: translateY(-2px);
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 8px;

    .type-icon {
      flex-shrink: 0;
      font-size: 18px;
    }

    .title {
      flex: 1;
      font-weight: 500;
      font-size: 14px;
    }

    .delete-btn {
      opacity: 0;
      transition: opacity 0.2s;
    }
  }

  &:hover .delete-btn {
    opacity: 1;
  }

  .item-content {
    font-size: 13px;
    color: var(--text-color-secondary);
    margin-bottom: 8px;
    line-height: 1.5;
  }

  .item-footer {
    display: flex;
    gap: 8px;
    font-size: 12px;
    color: var(--text-color-placeholder);
  }
}
```

---

## 7. 集成方案

### 7.1 在 TitleBar 中添加入口

**文件**: [`src/components/TitleBar.vue`](../../src/components/TitleBar.vue:404-505)

**位置**: 在设置按钮之前插入

```vue
<script setup lang="ts">
import NotificationBell from "@/components/notification/NotificationBell.vue";
// ... 其他导入
</script>

<template>
  <div class="right-controls">
    <!-- ... 用户档案、主题切换 ... -->

    <!-- 消息通知入口（仅主窗口显示） -->
    <NotificationBell v-if="isMainWindow" />

    <!-- 设置按钮 -->
    <template v-if="isMainWindow">
      <!-- ... -->
    </template>

    <!-- ... 窗口控制按钮 ... -->
  </div>
</template>
```

### 7.2 在 GlobalProviders 中挂载面板

**文件**: [`src/components/GlobalProviders.vue`](../../src/components/GlobalProviders.vue:32-84)

```vue
<script setup lang="ts">
import NotificationCenter from "@/components/notification/NotificationCenter.vue";
import { useNotificationStore } from "@/stores/notification";

const notificationStore = useNotificationStore();
</script>

<template>
  <!-- ... 其他全局组件 ... -->

  <!-- 全局消息中心 -->
  <NotificationCenter v-model="notificationStore.centerVisible" />

  <slot></slot>
</template>
```

---

## 8. 使用场景示例

### 8.1 错误处理集成

在 [`errorHandler.ts`](../../src/utils/errorHandler.ts) 中集成：

```typescript
import { useNotification } from "@/composables/useNotification";

class ErrorHandler {
  private notify = useNotification();

  error(error: unknown, userMessage?: string, context?: any) {
    // ... 现有逻辑 ...

    // 对于严重错误，同时发送通知
    if (this.isCriticalError(error)) {
      this.notify.error("系统错误", userMessage || "发生了一个严重错误", {
        source: this.moduleName,
        metadata: { context },
      });
    }
  }
}
```

### 8.2 LLM Chat 工具集成

```typescript
// 在 llm-chat 工具中
import { useNotification } from "@/composables/useNotification";

const notify = useNotification();

// 对话完成时
notify.success("对话完成", `已生成 ${tokenCount} 个 token 的回复`, { source: "llm-chat" });

// API 配额不足时
notify.warning("API 配额不足", "当前渠道剩余配额较低，建议充值", {
  source: "llm-chat",
  metadata: {
    path: "/settings",
    data: { section: "llm-api" },
  },
});
```

### 8.3 系统更新通知

```typescript
// 在应用启动检查更新时
import { useNotification } from "@/composables/useNotification";

const notify = useNotification();

if (hasUpdate) {
  notify.system("发现新版本", `AIO Hub v${latestVersion} 已发布`, {
    metadata: {
      action: "open-release-page",
      data: { version: latestVersion, url: releaseUrl },
    },
  });
}
```

---

## 9. 后期扩展

### 9.1 系统通知集成

使用 Tauri 的 Notification API：

```typescript
import { sendNotification } from "@tauri-apps/plugin-notification";

async function pushToSystem(notification: Notification) {
  await sendNotification({
    title: notification.title,
    body: notification.content,
    icon: getIconPath(notification.type),
  });
}
```

### 9.2 消息分组

按来源或日期分组显示：

```typescript
interface NotificationGroup {
  key: string; // 分组键（如日期或来源）
  label: string; // 分组标签
  notifications: Notification[];
}
```

### 9.3 消息过滤

添加筛选器：

- 按类型筛选（info/error/warning 等）
- 按来源筛选（llm-chat/system 等）
- 按已读/未读筛选

### 9.4 消息搜索

在面板顶部添加搜索框，支持标题和内容的全文搜索。

### 9.5 自动清理配置

在设置页面添加配置项：

- 保留天数（如 30 天）
- 最大消息数（如 100 条）
- 自动清理已读消息

---

## 10. 性能考虑

### 10.1 虚拟滚动

当消息数量超过 100 条时，使用虚拟滚动优化渲染性能：

```vue
<template>
  <VirtualList :data="sortedNotifications" :item-height="80" :buffer="5">
    <template #default="{ item }">
      <NotificationItem :notification="item" />
    </template>
  </VirtualList>
</template>
```

### 10.2 防抖保存

持久化保存使用防抖，避免频繁写入：

```typescript
import { debounce } from "lodash-es";

const debouncedSave = debounce(() => {
  saveToStorage();
}, 500);
```

---

## 11. 测试计划

### 11.1 单元测试

- Store actions 测试
- Composable API 测试
- 持久化逻辑测试

### 11.2 集成测试

- 跨组件通信测试
- 路由跳转测试
- 主题适配测试

### 11.3 手动测试清单

- [ ] 发送各类型消息
- [ ] 标记已读/未读
- [ ] 删除单条消息
- [ ] 清空所有消息
- [ ] 点击跳转功能
- [ ] 应用重启后消息保留
- [ ] 主题切换适配
- [ ] 毛玻璃效果显示
- [ ] 大量消息性能测试（100+ 条）

---

## 12. 实施时间线

### Phase 1: 基础设施（1-2 天）

- [ ] 创建类型定义
- [ ] 实现 Store 逻辑
- [ ] 实现 Composable API
- [ ] 持久化集成

### Phase 2: UI 开发（2-3 天）

- [ ] NotificationItem 组件
- [ ] NotificationCenter 组件
- [ ] NotificationBell 组件
- [ ] 样式适配与主题集成

### Phase 3: 集成与测试（1-2 天）

- [ ] TitleBar 集成
- [ ] GlobalProviders 集成
- [ ] 各工具模块集成示例
- [ ] 测试与 Bug 修复

### Phase 4: 优化与文档（1 天）

- [ ] 性能优化
- [ ] 使用文档编写
- [ ] 代码注释完善

**预计总时长**: 5-8 天

---

## 13. 参考资料

- [Element Plus Drawer](https://element-plus.org/zh-CN/component/drawer.html)
- [Element Plus Badge](https://element-plus.org/zh-CN/component/badge.html)
- [Tauri Plugin Store](https://v2.tauri.app/plugin/store/)
- [Tauri Plugin Notification](https://v2.tauri.app/plugin/notification/)
- [date-fns formatDistanceToNow](https://date-fns.org/docs/formatDistanceToNow)
- [Windows 11 通知中心设计](https://learn.microsoft.com/en-us/windows/apps/design/shell/tiles-and-notifications/adaptive-interactive-toasts)

---

**文档版本**: v1.0  
**最后更新**: 2026-01-17  
**作者**: 咕咕 (Kilo 版)
