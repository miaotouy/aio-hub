# 移动端多语言 (i18n) 架构方案 (JSON 驱动版)

## 1. 设计背景

在传统的 i18n 实践中，通常使用英文作为 Key（如 `common.confirm`）。随着项目规模扩大，维护庞大的 Key 映射表会变得繁琐，且在开发时无法直观看到文案内容。
本项目移动端采用 **“中文作为 Key (Source Text as Key)”** 的方案，旨在提高开发效率和代码可读性。

主要目标：

- **直观开发**：代码中直接书写 `t('确认')`，无需在文件间频繁跳转查找 Key。
- **零编译成本**：语言包采用 **JSON** 格式，无需构建脚本转换，运行时直接加载。
- **强类型支持**：利用 TypeScript 的 `resolveJsonModule` 特性，从 JSON 直接推导中文 Key 的自动补全。
- **工具自治**：工具可以携带并注册私有 JSON 语言包。
- **外部扩展**：支持从移动端文件系统加载自定义 JSON 语言包，优先级最高。
- **IDE 视觉增强**：配合 **i18n Ally** 插件，实现代码中 Key 的实时翻译预览。

## 2. 核心架构设计

### 2.1 内部开发 (Compile-time)

采用 **JSON 存储 + 原生 TS 推导** 方案，以中文 JSON 包作为类型基准。

- **目录结构**:

  ```text
  mobile/src/i18n/
  ├── index.ts                # 核心逻辑：实例创建、动态合并、外部加载
  ├── schema.ts               # 类型定义：基于 zh-CN.json 推导全局中文 Key 类型
  └── locales/
      ├── zh-CN.json          # 源语言定义（中文）
      ├── en-US.json          # 翻译包（英文）
      └── ...
  ```

- **类型推导机制**:
  通过 `tsconfig.json` 开启 `resolveJsonModule`，TS 可以直接理解 JSON 文件的结构。
  `schema.ts` 会递归解析 `zh-CN.json` 的嵌套 Key，生成如 `"common.确认" | "settings.保存"` 的联合类型。

- **关于中文 Key 的选择**:
  使用中文作为 Key 可以确保 LLM 在处理文案时保持地道的中文逻辑，避免先写英文再翻译导致的语感生硬。

### 2.2 工具自治 (Tool Autonomy)

工具私有的文案存放在工具目录内，使用工具 ID 作为命名空间。

- **工具目录**: `mobile/src/tools/[tool-id]/locales/[lang].json`
- **注册机制**: 工具初始化时异步加载 JSON 并调用 `i18n.mergeLocaleMessage`。
- **访问路径**: `t('tools.[tool-id].工具内中文')`。

### 2.3 外部自定义 (Runtime)

支持用户通过修改 JSON 文件来覆盖或扩展翻译。

- **加载路径**: `AppData/locales/[lang].json`
- **覆盖优先级**: `外部自定义 JSON > 工具私有包 > 内置核心包`

## 3. 技术实现细节

### 3.1 TypeScript 配置 (`tsconfig.json`)

必须开启以下选项以支持 JSON 导入和推导：

```json
{
  "compilerOptions": {
    "resolveJsonModule": true,
    "allowSyntheticDefaultImports": true
  }
}
```

### 3.2 强类型约束 (`schema.ts`)

```typescript
import zhCN from "./locales/zh-CN.json";

type NestedKeyOf<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends object
    ? `${Prefix}${K}` | NestedKeyOf<T[K], `${Prefix}${K}.`>
    : `${Prefix}${K}`;
}[keyof T & string];

export type I18nKey = NestedKeyOf<typeof zhCN>;
```

### 3.3 语言包定义示例 (`zh-CN.json`)

```json
{
  "common": {
    "确认": "确认",
    "取消": "取消"
  },
  "settings": {
    "主题": "主题设置"
  }
}
```

### 3.4 IDE 支持 (i18n Ally)

在 `.vscode/settings.json` 中配置插件，使其识别 JSON 路径和中文 Key：

```json
{
  "i18n-ally.localesPaths": ["mobile/src/i18n/locales"],
  "i18n-ally.sourceLanguage": "zh-CN",
  "i18n-ally.displayLanguage": "zh-CN",
  "i18n-ally.enabledParsers": ["json"]
}
```

## 4. 实施清单 (Roadmap)

1. **基础配置**:
   - [x] 修改 `mobile/tsconfig.json` 开启 JSON 支持。
   - [x] 安装 `vue-i18n@9`。
2. **核心定义**:
   - [x] 创建 `src/i18n/locales/zh-CN.json` 作为基准。
   - [x] 编写 `src/i18n/schema.ts` 实现类型推导。
3. **逻辑实现**:
   - [x] 编写 `src/i18n/index.ts` 初始化实例。
   - [x] 实现 `registerToolLocales` 动态合并逻辑。
   - [x] 在 `main.ts` 中挂载 i18n 实例。
4. **插件适配**:
   - [x] 配置项目级 `.vscode/settings.json`。
