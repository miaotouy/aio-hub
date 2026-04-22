# 计划：模型元数据全局状态重构

**状态**: `Completed`
**创建时间**: 2026-04-22
**背景**: AI 在多处核心模块直接引用了静态预设 `DEFAULT_METADATA_RULES`，完全绕开了用户在 `ModelMetadataSettings.vue` 中的自定义配置，导致用户设置在运行时失效。

---

## 一、问题诊断

### 根本原因

`src/config/model-metadata.ts` 中的 `getMatchedModelProperties()` 函数设有默认参数：

```typescript
// 危险：调用方如果不传 rules，会静默地使用出厂硬编码预设
export function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[] = DEFAULT_METADATA_RULES  // ← 这就是"影子配置"
)
```

调用方忽视了这个参数的存在，导致用户配置失效。

### 已确认的五处主线程绕路调用

| 文件 | 行号 | 影响 |
|------|------|------|
| `src/llm-apis/request-builder.ts` | L486 | 模型家族判断（Claude/Gemini/OpenAI 路由）使用硬编码 |
| `src/tools/llm-chat/core/context-utils/preview-builder.ts` | L35 | 聊天预览的 vision token 计算使用硬编码 |
| `src/tools/token-calculator/composables/useTokenCalculatorState.ts` | L186, L330 | Token 计算器分词器匹配使用硬编码 |
| `src/tools/token-calculator/tokenCalculator.registry.ts` | L112 | 跨模块 Token 服务使用硬编码 |
| `src/views/Settings/llm-service/components/ModelEditDialog.vue` | L145 | "应用预设"按钮使用硬编码 |

### Worker 线程（可接受的降级）

`src/tools/token-calculator/core/tokenCalculatorEngine.ts` 运行在 Web Worker 中：
- 直接 `import { DEFAULT_METADATA_RULES }` 并内部复制了一份 `getMatchedModelProperties`
- Worker 中此函数仅用于查找 `tokenizer` 名称（如 `gpt4o`, `claude`）
- 用户几乎不会修改分词器映射规则，保持静态预设是**可接受的降级**

---

## 二、架构设计

### 数据流向

```
model-metadata-presets.ts          （纯数据，出厂默认，只读）
        │
        │ 初始化/重置
        ▼
modelMetadataStore (Pinia)          ← 全局唯一真理源 ★
        │
        ├── Vue 组件 ──────────────► useModelMetadata()（薄包装 Composable）
        │                                   │
        │                             ModelMetadataSettings.vue
        │                             ModelEditDialog.vue
        │
        └── 非 Vue 代码 ───────────► getActiveModelProperties()（便捷访问器）
                                            │
                                      request-builder.ts
                                      preview-builder.ts
                                      tokenCalculator.registry.ts
                                      useTokenCalculatorState.ts

model-metadata-presets.ts ────────► tokenCalculatorEngine.ts（Worker，降级可接受）
```

---

## 三、执行计划（分 Phase）

### Phase 1：创建 Pinia Store

**新建文件**: `src/stores/modelMetadataStore.ts`

将 `src/composables/useModelMetadata.ts` 中的核心状态和逻辑迁移到 Pinia Store：
- `rules` ref
- `isLoaded` 状态
- 所有 CRUD 操作：`loadRules`, `addRule`, `updateRule`, `deleteRule`, `toggleRule`, `resetToDefaults`, `mergeWithDefaults`, `exportRules`, `importRules`
- 计算属性：`enabledCount`
- 辅助函数：`getMatchedRule`, `getDisplayIconPath`

同时暴露**非响应式访问器**供非 Vue 代码使用：

```typescript
// 模块级访问器（非 Vue 代码使用）
export function getActiveRules(): ModelMetadataRule[] {
  const store = useModelMetadataStore();
  return store.rules;
}
```

### Phase 2：改造 `src/config/model-metadata.ts`

**关键改动**：去掉默认参数值，强制调用方显式传入 rules：

```typescript
// 之后（安全）—— 不提供默认值，TypeScript 会在漏传时报错
export function getMatchedModelProperties(
  modelId: string,
  provider?: string,
  rules: ModelMetadataRule[]   // 必须显式传入
): ModelMetadataProperties | undefined
```

新增便捷函数，内部自动从 Store 读取：

```typescript
// 便捷函数（主线程非 Vue 代码使用）
export function getActiveModelProperties(
  modelId: string,
  provider?: string
): ModelMetadataProperties | undefined {
  const rules = getActiveRules();
  return getMatchedModelProperties(modelId, provider, rules);
}
```

### Phase 3：重构 `src/composables/useModelMetadata.ts`

改为 Pinia Store 的薄包装，**保持 API 向后兼容**（外部无需改动对此 composable 的引用）：

```typescript
export function useModelMetadata() {
  const store = useModelMetadataStore();

  return {
    rules: computed(() => store.rules),
    isLoaded: computed(() => store.isLoaded),
    enabledCount: computed(() => store.enabledCount),
    addRule: store.addRule,
    updateRule: store.updateRule,
    // ...其余方法直接透传 store
  };
}
```

### Phase 4：挂载到应用初始化流程

在 `src/stores/appInitStore.ts` 中添加初始化步骤，确保 Store 在所有组件使用前完成加载：

```typescript
// 在 "加载应用设置" 之后、"配置界面主题" 之前
setProgress(20, "加载模型元数据...");
const metadataStore = useModelMetadataStore();
await metadataStore.loadRules();
```

### Phase 5：修复所有主线程消费者

将所有绕路调用替换为新的便捷函数：

```typescript
// 之前（绕路）
import { getMatchedModelProperties } from "@/config/model-metadata";
const props = getMatchedModelProperties(modelId, provider);

// 之后（走 Store）
import { getActiveModelProperties } from "@/config/model-metadata";
const props = getActiveModelProperties(modelId, provider);
```

涉及文件：
1. `src/llm-apis/request-builder.ts`
2. `src/tools/llm-chat/core/context-utils/preview-builder.ts`
3. `src/tools/token-calculator/composables/useTokenCalculatorState.ts`
4. `src/tools/token-calculator/tokenCalculator.registry.ts`
5. `src/views/Settings/llm-service/components/ModelEditDialog.vue`

### Phase 6：Worker 线程（维持现状）

`src/tools/token-calculator/core/tokenCalculatorEngine.ts` **不做修改**：
- 继续使用 `DEFAULT_METADATA_RULES`
- 如未来需要严格同步，可通过 `postMessage` 将序列化的 rules 传入 Worker

---

## 四、文件变更清单

| 操作 | 文件 | 说明 |
|------|------|------|
| 新建 | `src/stores/modelMetadataStore.ts` | Pinia Store，唯一真理源 |
| 重构 | `src/composables/useModelMetadata.ts` | 改为 Store 的薄包装 |
| 修改 | `src/config/model-metadata.ts` | 去掉默认参数 + 新增 `getActiveModelProperties` |
| 修改 | `src/stores/appInitStore.ts` | 添加 Store 初始化步骤 |
| 修改 | `src/llm-apis/request-builder.ts` | 使用 `getActiveModelProperties` |
| 修改 | `src/tools/llm-chat/core/context-utils/preview-builder.ts` | 同上 |
| 修改 | `src/tools/token-calculator/composables/useTokenCalculatorState.ts` | 同上 |
| 修改 | `src/tools/token-calculator/tokenCalculator.registry.ts` | 同上 |
| 修改 | `src/views/Settings/llm-service/components/ModelEditDialog.vue` | 同上 |
| 不动 | `src/tools/token-calculator/core/tokenCalculatorEngine.ts` | Worker，保持降级 |
| 不动 | `src/config/model-metadata-presets.ts` | 纯数据文件 |
| 不动 | `src/types/model-metadata.ts` | 类型定义不变 |

---

## 五、风险与注意事项

1. **初始化时序**：`getActiveRules()` 在 Store 初始化完成前被调用时，会返回空数组或默认值——需确保 `appInitStore` 中的加载步骤在任何组件渲染前完成。

2. **`presetIcons` 计算属性**：目前 `useModelMetadata` 中有一个 `presetIcons` 计算属性用于读取所有图标路径，迁移时需确认 `ModelMetadataSettings.vue` 的引用路径不断链。

3. **去掉默认参数后的编译错误**：`tokenCalculatorEngine.ts`（Worker）中有自己本地实现的 `getMatchedModelProperties`，其签名带默认值，**与主线程版本完全独立**，不受影响，无需修改。

4. **`presetIcons` 来源**：Store 的 `presetIcons` 计算属性依赖 `rules`，应从 `model-metadata-presets.ts` 中单独维护一份图标列表，或在 Store 加载时从规则中提取——需在实施时确认当前逻辑。