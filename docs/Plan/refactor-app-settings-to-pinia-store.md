# RFC: 全局设置迁移至 Pinia Store

**状态**: Draft  
**目标**: 将 `appSettings.ts` 的状态管理迁移到 Pinia Store，实现真正的响应式全局设置，消除所有 workaround，最终不保留兼容层。

---

## 一、问题根因

[`src/utils/appSettings.ts`](../../src/utils/appSettings.ts:366) 的核心是一个模块级普通变量 `cachedSettings`，完全没有 Vue 响应式追踪。所有读写都是对这个普通对象的快照操作。

这导致各模块为了感知设置变化，各自实现了不可靠的 workaround：

- [`src/App.vue`](../../src/App.vue:186) — 监听 `app-settings-changed` 自定义事件，在离开设置页时重新加载
- [`src/views/Settings.vue`](../../src/views/Settings.vue:391) — 每次保存后手动 `dispatchEvent` 通知其他组件
- [`src/views/HomePage.vue`](../../src/views/HomePage.vue:228) — 监听 `window.storage` 事件（Tauri 中不可靠）+ 监听路由变化重新加载
- [`src/stores/tools.ts`](../../src/stores/tools.ts:26) — `initializeOrder()` 只在初始化时读取一次，之后手动同步
- [`src/composables/useThemeAppearance.ts`](../../src/composables/useThemeAppearance.ts:204) — 保存时需要先 `load()` 再 `save()`，因为没有全局状态可以 spread

---

## 二、目标架构

```
┌─────────────────────────────────────────────────────────┐
│              useAppSettingsStore (Pinia)                 │
│  settings: ref<AppSettings>  ← 单一响应式真相来源        │
│  load() / update() / reset()                            │
│  computed: appearance / theme / toolsVisible / ...      │
└──────────────┬──────────────────────────────────────────┘
               │ 响应式（直接 watch / computed）
    ┌──────────┼──────────────────────────────────────┐
    ▼          ▼                                      ▼
Settings.vue  App.vue / HomePage.vue    useThemeAppearance
(v-model 绑定 store.settings)  (直接读 store)  (watch store.appearance)
```

**移除的机制**：

- `app-settings-changed` 自定义事件及其所有监听器
- `window.storage` 监听
- 路由变化时重新加载设置的逻辑
- `cachedSettings` 模块级变量
- `loadAppSettings()` / `saveAppSettings()` / `updateAppSettings()` 等同步包装函数

---

## 三、新 Store 设计

**文件**: [`src/stores/appSettingsStore.ts`](../../src/stores/appSettingsStore.ts)（新建）

```typescript
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import debounce from "lodash-es/debounce";
import {
  appSettingsManager,
  defaultAppSettings,
  defaultAppearanceSettings,
  type AppSettings,
} from "@/utils/appSettings";

export const useAppSettingsStore = defineStore("appSettings", () => {
  const settings = ref<AppSettings>({ ...defaultAppSettings });
  const isLoaded = ref(false);

  // 防抖保存（300ms）
  const _debouncedSave = debounce(async (s: AppSettings) => {
    await appSettingsManager.save(s);
  }, 300);

  /** 初始化时调用一次，从磁盘加载 */
  async function load(): Promise<AppSettings> {
    const loaded = await appSettingsManager.load();
    settings.value = loaded;
    isLoaded.value = true;
    return loaded;
  }

  /** 更新部分设置，自动防抖保存 */
  function update(updates: Partial<AppSettings>): void {
    settings.value = { ...settings.value, ...updates };
    _debouncedSave(settings.value);
  }

  /** 重置为默认值 */
  async function reset(): Promise<AppSettings> {
    settings.value = { ...defaultAppSettings };
    await appSettingsManager.save(defaultAppSettings);
    return defaultAppSettings;
  }

  // 常用 computed getters（避免组件直接深访问 settings.value.xxx）
  const appearance = computed(() => settings.value.appearance ?? defaultAppearanceSettings);
  const theme = computed(() => settings.value.theme ?? "auto");
  const toolsVisible = computed(() => settings.value.toolsVisible ?? {});
  const toolsOrder = computed(() => settings.value.toolsOrder ?? []);
  const sidebarMode = computed(() => settings.value.sidebarMode ?? "sidebar");

  return {
    settings,
    isLoaded,
    load,
    update,
    reset,
    appearance,
    theme,
    toolsVisible,
    toolsOrder,
    sidebarMode,
  };
});
```

**`appSettings.ts` 的保留内容**：仅保留类型定义（`AppSettings`、`AppearanceSettings` 等）、常量（`defaultAppSettings`、`defaultAppearanceSettings`、`BUILTIN_WALLPAPERS` 等）和 `appSettingsManager` 实例。删除所有函数（`loadAppSettings`、`saveAppSettings`、`updateAppSettings`、`loadAppSettingsAsync` 等）和 `cachedSettings` 变量。

---

## 四、分提交执行计划

### Commit 1 — 建立 Store 基础设施

**目标**：Store 可用，`main.ts` 使用 Store 初始化，`appSettings.ts` 清理完毕。

**变更文件**：

1. **新建** [`src/stores/appSettingsStore.ts`](../../src/stores/appSettingsStore.ts)
   - 实现上述 Store 设计

2. **修改** [`src/utils/appSettings.ts`](../../src/utils/appSettings.ts)
   - 删除：`cachedSettings` 变量
   - 删除：`loadAppSettingsAsync` / `saveAppSettingsAsync` / `updateAppSettingsAsync` / `resetAppSettingsAsync`
   - 删除：`saveAppSettingsDebounced`
   - 删除：`loadAppSettings` / `saveAppSettings` / `resetAppSettings` / `updateAppSettings`
   - 保留：所有类型定义、常量、`appSettingsManager`

3. **修改** [`src/main.ts`](../../src/main.ts)
   - 将 `loadAppSettingsAsync()` 替换为 `useAppSettingsStore().load()`
   - 注意：Store 必须在 `app.use(pinia)` 之后才能使用，当前 `pinia` 在 `app.use(pinia)` 之前创建，需要用 `pinia` 实例直接调用 Store

   ```typescript
   // main.ts 中的初始化方式
   const pinia = createPinia();
   app.use(pinia);

   // 在 initializeApp 中：
   const appSettingsStore = useAppSettingsStore();
   const settings = await appSettingsStore.load();
   ```

---

### Commit 2 — 迁移核心视图层

**目标**：消除 `app-settings-changed` 事件机制，视图层全部使用 Store。

**变更文件**：

1. **修改** [`src/App.vue`](../../src/App.vue)
   - 删除：`appSettings` ref（改用 `store.settings`）
   - 删除：`loadSettings()` 函数
   - 删除：`handleSettingsChange` 事件监听器及 `window.addEventListener("app-settings-changed", ...)`
   - 删除：路由变化时 `oldPath === "/settings"` 的重新加载逻辑
   - 保留：`isCollapsed` ref（侧边栏状态，仍需本地管理）
   - 修改：`watch(isCollapsed, ...)` 改为 `store.update({ sidebarCollapsed: newVal })`
   - 修改：`watch(isDark, ...)` 中的 `appSettings.value.themeColor` 改为 `store.settings.themeColor`
   - 修改：模板中 `appSettings.sidebarMode` 改为 `store.sidebarMode`，`appSettings.toolsVisible` 改为 `store.toolsVisible`

2. **修改** [`src/views/Settings.vue`](../../src/views/Settings.vue)
   - 删除：`settings` ref（改用 `store.settings`）
   - 删除：`loadAppSettingsAsync` 调用（改用 `store.load()`）
   - 删除：`saveAppSettingsDebounced` 调用（Store 自动防抖保存）
   - 删除：`window.dispatchEvent(new CustomEvent("app-settings-changed", ...))` 所有调用
   - 删除：`handleSettingsChange` 事件监听器
   - 修改：`handleReset` 改为调用 `store.reset()`
   - 修改：`onConfigImported` 改为调用 `store.load()`
   - 修改：所有 `watch(() => settings.value.xxx, ...)` 改为 `watch(() => store.settings.xxx, ...)`
   - 修改：模板中所有 `v-model:xxx="settings.xxx"` 改为直接操作 `store.settings.xxx`
   - 注意：`isLoadingFromFile` 标志仍需保留，用于防止 watch 在加载时触发副作用

3. **修改** [`src/views/HomePage.vue`](../../src/views/HomePage.vue)
   - 删除：`settings` ref
   - 删除：`handleStorageChange` 函数及 `window.addEventListener("storage", ...)`
   - 删除：路由变化时重新加载设置的 `watch`
   - 修改：`visibleTools` computed 中的 `settings.value.toolsVisible` 改为 `store.toolsVisible`

4. **修改** [`src/components/TitleBar.vue`](../../src/components/TitleBar.vue)
   - 删除：`settings` ref 及 `loadAppSettingsAsync` 调用
   - 修改：使用 `store.settings.theme` 替代本地 settings

5. **修改** [`src/stores/tools.ts`](../../src/stores/tools.ts)
   - 修改：`initializeOrder()` 改为从 `useAppSettingsStore().toolsOrder` 读取
   - 修改：`updateOrder()` 同时调用 `appSettingsStore.update({ toolsOrder: newOrder })`

---

### Commit 3 — 迁移 Composables 和工具层

**目标**：清理所有剩余的直接调用点，`appSettings.ts` 中的函数全部删除完毕。

**变更文件**：

1. **修改** [`src/composables/useThemeAppearance.ts`](../../src/composables/useThemeAppearance.ts)
   - 修改：`debouncedSave` 改为调用 `useAppSettingsStore().update({ appearance: settingsToSave })`
   - 删除：`appSettingsManager.load()` 再 `save()` 的模式
   - 修改：`initThemeAppearance` 中的加载改为 `useAppSettingsStore().load()`（或直接读 `store.settings`，因为 App.vue 已经加载过了）

2. **修改** [`src/composables/useTheme.ts`](../../src/composables/useTheme.ts)
   - 修改：`updateAppSettings({ theme })` 改为 `useAppSettingsStore().update({ theme })`
   - 修改：`loadAppSettingsAsync()` 改为 `useAppSettingsStore().settings`

3. **修改** [`src/composables/useCssOverrides.ts`](../../src/composables/useCssOverrides.ts)
   - 修改：`loadAppSettings()` 改为 `useAppSettingsStore().settings`
   - 修改：`updateAppSettings({ cssOverride: ... })` 改为 `store.update({ cssOverride: ... })`

4. **修改** [`src/composables/useDetachedManager.ts`](../../src/composables/useDetachedManager.ts)
   - 修改：`loadAppSettings()` 改为 `useAppSettingsStore().settings`

5. **修改** [`src/composables/useLogConfig.ts`](../../src/composables/useLogConfig.ts)
   - 修复 bug：`await loadAppSettings()` 中 `loadAppSettings` 是同步函数，`await` 无意义
   - 修改：改为 `useAppSettingsStore().settings`

6. **修改** [`src/llm-apis/common.ts`](../../src/llm-apis/common.ts)
   - 修改：`loadAppSettings()` 改为 `useAppSettingsStore().settings`

7. **修改** [`src/utils/time.ts`](../../src/utils/time.ts)
   - 修改：`loadAppSettings()` 改为 `useAppSettingsStore().settings`

8. **修改** [`src/services/startup-manager.ts`](../../src/services/startup-manager.ts)
   - 修改：`loadAppSettings()` 改为 `useAppSettingsStore().settings`
   - 修改：`updateAppSettings({ startupTasks: ... })` 改为 `store.update({ startupTasks: ... })`

9. **修改** [`src/views/PluginManager/PluginManager.vue`](../../src/views/PluginManager/PluginManager.vue)
   - 修改：`loadAppSettings()` 改为 `store.settings`
   - 修改：`watch(panelWidthPercent, ...)` 中的 `updateAppSettings` 改为 `store.update`

10. **修改** [`src/views/Settings/general/AssetSettings.vue`](../../src/views/Settings/general/AssetSettings.vue)
    - 修改：`loadAppSettings()` 改为 `store.settings`
    - 修改：`updateAppSettings` 改为 `store.update`

11. **修改** [`src/views/Settings/general/ToolsSettings.vue`](../../src/views/Settings/general/ToolsSettings.vue)
    - 修改：`updateAppSettings` 改为 `store.update`

---

## 五、关键注意事项

### Pinia 初始化时序

`main.ts` 中 `app.use(pinia)` 必须在 `useAppSettingsStore()` 之前执行。当前代码已满足此条件（`pinia` 在 `app.use(pinia)` 之前创建，但 Store 的使用在 `initializeApp()` 内部，此时 `app.use(pinia)` 已执行）。

### Settings.vue 的 v-model 绑定

Settings.vue 通过 `v-model:xxx="settings.xxx"` 将设置传递给子组件。迁移后，子组件修改 prop 时会触发 `update:xxx` 事件，Settings.vue 需要将这些事件转发为 `store.update({ xxx: newVal })`。

可以使用 `computed` 的 getter/setter 模式简化：

```typescript
const themeColor = computed({
  get: () => store.settings.themeColor,
  set: (val) => store.update({ themeColor: val }),
});
```

### useThemeAppearance 的初始化

`initThemeAppearance()` 在 `App.vue` 的 `onMounted` 中调用，此时 Store 已经通过 `loadSettings()` 加载完毕。因此 `initThemeAppearance` 内部可以直接读取 `store.settings.appearance`，不需要再次调用 `appSettingsManager.load()`。

### startup-manager.ts 的 Pinia 使用

`startup-manager.ts` 是一个普通 TypeScript 模块（非 Vue 组件），在其中使用 `useAppSettingsStore()` 需要确保 Pinia 已经初始化。由于 `startupManager.run()` 在 `main.ts` 的 `initializeApp()` 中调用（此时 `app.use(pinia)` 已执行），可以安全使用。

---

## 六、受影响文件汇总

| 文件                                           | 操作 | 核心变化                               |
| ---------------------------------------------- | ---- | -------------------------------------- |
| `src/stores/appSettingsStore.ts`               | 新建 | 全新 Pinia Store                       |
| `src/utils/appSettings.ts`                     | 删减 | 仅保留类型、常量、`appSettingsManager` |
| `src/main.ts`                                  | 小改 | 改用 `store.load()`                    |
| `src/App.vue`                                  | 中改 | 移除事件机制，改用 Store               |
| `src/views/Settings.vue`                       | 中改 | 移除事件派发，改用 Store               |
| `src/views/HomePage.vue`                       | 中改 | 移除 workaround，改用 Store            |
| `src/components/TitleBar.vue`                  | 小改 | 改用 Store                             |
| `src/stores/tools.ts`                          | 小改 | 改用 Store 的 toolsOrder               |
| `src/composables/useThemeAppearance.ts`        | 小改 | 保存时改用 Store                       |
| `src/composables/useTheme.ts`                  | 小改 | 改用 Store                             |
| `src/composables/useCssOverrides.ts`           | 小改 | 改用 Store                             |
| `src/composables/useDetachedManager.ts`        | 小改 | 改用 Store                             |
| `src/composables/useLogConfig.ts`              | 小改 | 修复 bug + 改用 Store                  |
| `src/llm-apis/common.ts`                       | 小改 | 改用 Store                             |
| `src/utils/time.ts`                            | 小改 | 改用 Store                             |
| `src/services/startup-manager.ts`              | 小改 | 改用 Store                             |
| `src/views/PluginManager/PluginManager.vue`    | 小改 | 改用 Store                             |
| `src/views/Settings/general/AssetSettings.vue` | 小改 | 改用 Store                             |
| `src/views/Settings/general/ToolsSettings.vue` | 小改 | 改用 Store                             |
