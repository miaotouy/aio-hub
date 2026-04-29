# ST 世界书编辑器架构文档

## 概述

ST 世界书编辑器是 SillyTavern 格式世界书的编辑工具入口，本质上是 `LLM Chat` 模块中 `WorldbookFullManager` 组件的一个包装入口，提供可分离窗口访问世界书编辑能力。

## 目录结构

```
st-worldbook-editor/
├── StWorldbookEditor.vue           # 主入口组件（极薄包装层）
├── stWorldbookEditor.registry.ts   # 工具注册文件
└── ARCHITECTURE.md                 # 本文件
```

## 设计原理

该工具是**轻量包装器模式**的典型应用：

```
StWorldbookEditor.vue
  └─ 渲染 → WorldbookFullManager (来自 llm-chat 模块)
        └─ 使用 → useWorldbookStore (来自 llm-chat stores)
```

- **不包含任何私有组件或逻辑**：所有 UI 和业务逻辑均委托给 LLM Chat 模块
- **状态同步**：`onMounted` 时调用 `worldbookStore.initializeSync()` 确保独立窗口能与主窗口的状态同步
- **样式适配**：通过 `:deep()` 穿透修改 WorldbookFullManager 的样式，消除嵌套容器带来的额外边框和背景

## 依赖

- **`@/tools/llm-chat/components/worldbook/WorldbookFullManager`**: 世界书完整管理组件
- **`@/tools/llm-chat/stores/worldbookStore`**: 世界书状态管理（含跨窗口同步能力）

## 使用场景

**可分离窗口**：将世界书编辑分离为独立窗口，与 LLM Chat 主界面并行使用
