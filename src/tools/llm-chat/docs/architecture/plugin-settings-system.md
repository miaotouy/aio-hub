# 插件化设置系统 (Plugin Settings System)

为了保持核心逻辑的简洁并支持功能扩展，系统实现了一套声明式的设置注入机制。注册中心实现位于 [`usePluginSettings`](../../composables/settings/usePluginSettings.ts)。

## 1. 动态注册

外部模块（如转写工具、搜索增强、技能管理）可以通过 `usePluginSettings` 动态向聊天设置对话框中注入新的配置分区或配置项。

## 2. 注册中心的数据结构

模块级 `pluginSettingsSections = ref<SettingsSection[]>([])` 单例数组，**两级层级**：

- **分区 (`SettingsSection`)**: `{ title, icon, items[] }`，标题作为唯一键；调用 [`registerSettingsSection(section)`](../../composables/settings/usePluginSettings.ts:19) 时按 `title` 查重，已存在则**整体替换**（便于插件热更新配置）。
- **项 (`SettingItem`)**: 单条设置项，通过 [`registerSettingItem(sectionTitle, item)`](../../composables/settings/usePluginSettings.ts:38) 追加到指定分区，按 `id` 查重替换；目标分区不存在时会自动创建占位分区并打 warn 日志，提示插件应先注册分区。

## 3. 动态渲染入口

[`ChatSettingsDialog.vue`](../../components/settings/ChatSettingsDialog.vue:156) 通过 `mergedSettingsConfig` computed 把静态 `settingsConfig` 与插件注册的 `pluginSections` 拼接为单一 `SettingsSection[]` 数组，再交给 [`SettingListRenderer`](../../../../components/common/SettingListRenderer.vue) 统一渲染，**核心 UI 完全感知不到插件的存在**。

## 4. 排序规则

**没有 `priority` 字段**，按**注册顺序追加**——静态分区永远在前，插件分区按 `register*` 调用顺序排在后面；同分区内的项也按调用顺序追加；同名重复注册会**替换原位置**而非追加。

## 5. 反注册逻辑

**当前实现没有 `unregisterSettingsSection` / `unregisterSettingItem` 方法**——插件一旦注册便常驻整个应用生命周期。这是有意取舍：

1. 聊天设置对话框是低频开启的场景，常驻注册项无性能损耗；
2. 避免插件卸载/重载导致设置项闪烁丢失；
3. 重复注册同名分区会自动替换，等同于"更新"语义。

如需真正销毁分区，需直接操作模块级 `pluginSettingsSections.value` 数组。

## 6. 解耦交互

核心设置 UI 不需要预知所有可能的配置项，而是通过遍历注册中心自动渲染，实现了 UI 与业务插件的解耦。
