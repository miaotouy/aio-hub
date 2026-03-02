# 移动端规范 (Mobile Protocols)

移动端开发遵循**"独立重构，全量对齐，架构自治"**的原则。移动端位于 `mobile/` 目录，作为一个与桌面端对等的完整系统。

## 1. 移动端技术栈

- **核心框架**: Vue 3 + Vite
- **UI 框架**: `@varlet/ui` (Material Design 3 风格)
- **状态管理**: Pinia
- **路由管理**: Vue Router (支持工具路由自动扫描)
- **调试工具**: `vConsole`
- **核心工具**: `@vueuse/core`, `lodash-es`, `lucide-vue-next`
- **跨平台框架**: Tauri ^2.0 (Android / iOS)

## 2. 核心开发规范

### 2.1. 架构原则：逻辑函数式化 (Functional Core)

移动端减少使用过于扁平、零散的 Composables，采取以下准则：

- **纯函数逻辑 (Pure Functional Logic)**: 复杂业务逻辑应抽离为纯函数，放置在工具的 `core/` 或 `logic/` 目录下。逻辑函数应保持"无状态"，不依赖 Vue 的 `ref` 或生命周期。
- **状态与逻辑分离**: Store 仅作为数据仓库；Logic 模块负责计算与请求；Composables 仅作为 UI 与 Logic/Store 之间的"粘合剂"。
- **逻辑物理聚合**: 工具内部逻辑必须通过子目录隔离（如 `composables/`, `components/`, `types/`），严禁在工具根目录铺开大量文件。

### 2.2. 工具自治特区 (Tool Autonomy)

移动端工具位于 `mobile/src/tools/` 下，每个工具都是一个自治单元。

- **注册机制**: 每个工具必须包含 `*.registry.ts` 文件（如 `llm-api.registry.ts`），定义工具的元数据（ID、名称、图标、路由）。
- **自动路由**: `mobile/src/router/index.ts` 会自动扫描所有工具的 `*.registry.ts` 文件并注册路由。
- **基础设施平替**: 移动端使用 `mobile/src/utils/` 下的平替工具（如 `errorHandler`, `logger`），它们保持与桌面端一致的接口，但内部对接 Varlet UI。

### 2.3. 响应式与单位规范 (Responsive & Units)

为了适配移动端多变的屏幕尺寸及用户个性化的字体缩放需求，必须遵循以下单位规范：

- **字体大小 (Font Size)**: **严禁使用 `px`**，必须使用 `rem`。
  - **基准**: 系统默认 `1rem = 14px` (在缩放比例为 1.0 时)。
  - **动态缩放**: `App.vue` 会根据用户设置动态调整根元素的 `font-size`，从而影响全局 `rem` 表现。
- **Varlet 变量同步**: 系统会自动同步更新 Varlet 的基础字号变量（`--font-size-md`, `--font-size-sm` 等），确保 UI 组件库与应用整体步调一致。
- **间距与尺寸**:
  - 容器内边距、外边距建议使用 `px` (固定感) 或 `rem` (随字缩放感)，视 UI 意图而定。
  - 图标大小 (`size` 属性) 建议根据重要程度决定是否硬编码。

### 2.4. 多语言架构 (i18n Strategy)

移动端采用 **"中文作为 Key (Source Text as Key)"** 的方案，以提高开发直观度。

#### 2.4.1. 核心原则

- **直观开发**: 代码中直接书写中文 Key，无需在文件间频繁跳转。
- **强类型推导**: 利用 TypeScript 从 `zh-CN.json` 自动推导 Key 的联合类型，确保拼写检查与自动补全。
- **命名空间隔离**: 通过层级结构区分不同模块的文案，避免冲突。

#### 2.4.2. 命名空间结构

语言包采用层级命名空间，核心结构如下：

```json
{
  "common": { "确认": "...", "取消": "...", "保存": "..." },
  "nav": { "首页": "...", "工具": "...", "设置": "..." },
  "settings": { "标题": "...", "外观": "..." },
  "tools": {
    "llm-api": { "编辑渠道": "...", "渠道名称": "..." },
    "llm-chat": { "发送消息": "...", "清空对话": "..." }
  }
}
```

- **`common`**: 全局通用文案（按钮文字、状态提示等），所有模块均可复用。
- **`nav`**: 导航栏相关文案。
- **`settings`**: 设置页面文案。
- **`tools.{toolId}`**: 工具私有文案，使用工具 ID 作为子命名空间。

#### 2.4.3. 翻译函数：`t()` vs `tRaw()`

系统提供两种翻译函数，适用于不同场景：

| 函数     | 类型安全  | 适用场景                   | 示例                             |
| -------- | --------- | -------------------------- | -------------------------------- |
| `t()`    | ✅ 强类型 | 核心语言包中的预定义 Key   | `t('common.确认')`               |
| `tRaw()` | ❌ 宽松   | 工具私有 Key、动态拼接 Key | `tRaw('tools.llm-api.编辑渠道')` |

**使用原则**:

- **优先使用 `t()`**: 对于 `common`, `nav`, `settings` 等核心命名空间，使用 `t()` 以获得类型检查和自动补全。
- **工具私有使用 `tRaw()`**: 工具私有文案（`tools.xxx`）由于是动态注册的，必须使用 `tRaw()`。

```typescript
import { useI18n } from "@/i18n";

const { t, tRaw } = useI18n();

// 通用文案使用 t()
t("common.确认");
t("common.取消");

// 工具私有文案使用 tRaw()
tRaw("tools.llm-api.编辑渠道");
tRaw("tools.llm-api.渠道名称");
```

#### 2.4.4. 工具私有语言包

工具私有文案存放在工具目录内的 `locales/` 下，通过 `registerToolLocales` 注册。

**目录结构**:

```
mobile/src/tools/llm-api/
├── llm-api.registry.ts
├── locales/
│   ├── zh-CN.json
│   └── en-US.json
└── ...
```

**语言包格式** (无需包含 `tools.llm-api` 前缀):

```json
// locales/zh-CN.json
{
  "编辑渠道": "编辑渠道",
  "渠道名称": "渠道名称",
  "删除确认": "确定要删除渠道 \"{name}\" 吗？"
}

// locales/en-US.json
{
  "编辑渠道": "Edit Channel",
  "渠道名称": "Channel Name",
  "删除确认": "Are you sure you want to delete channel \"{name}\"?"
}
```

**注册方式** (在 `*.registry.ts` 文件中):

```typescript
import { registerToolLocales, useI18n } from "@/i18n";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";

// 提前注册语言包，确保路由 meta.title 等 getter 能正确获取翻译
registerToolLocales("llm-api", {
  "zh-CN": zhCN,
  "en-US": enUS,
});

export default {
  id: "llm-api",
  get name() {
    const { tRaw } = useI18n();
    return tRaw("tools.llm-api.LLM 服务");
  },
  // ...
};
```

#### 2.4.5. 复用 common 与语序处理

**复用 common 的最佳实践**:

- 通用按钮文字（确认、取消、保存、删除等）使用 `common` 命名空间。
- 工具私有文案中不要重复定义已存在于 `common` 中的文案。

**语序差异处理**:

不同语言的语序可能不同（如中文"成功添加 5 个模型" vs 英文"Successfully added 5 models"）。使用**参数插值**而非字符串拼接来处理：

**复杂语序示例**:

```typescript
// 删除确认对话框
tRaw("tools.llm-api.删除确认", { name: profile.name });

// zh-CN: "删除确认": "确定要删除渠道 \"{name}\" 吗？"
// en-US: "删除确认": "Are you sure you want to delete channel \"{name}\"?"
```

#### 2.4.6. 覆盖机制

优先级为 `外部自定义 JSON > 工具私有包 > 内置核心包`。

## 3. 移动端专用脚本

为了方便开发，根目录 `package.json` 中内置了移动端命令的快捷入口：

- **`mtad`** – `tauri android dev` (Android 开发模式)。
- **`mtab`** – `tauri android build` (Android 构建)。
- **`mtid`** – `tauri ios dev` (iOS 开发模式)。
- **`mtib`** – `tauri ios build` (iOS 构建)。
