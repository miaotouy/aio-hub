# AIO Hub 工具目录结构重构计划

本文档列出了当前 `src/tools` 目录下结构不符合“逻辑物理聚合”原则的工具，并提出了相应的重构建议。

## 1. 重构目标
- **提升辨识度**: 保持桌面端 `toolName.registry.ts` 的命名规范。
- **逻辑聚合**: 核心业务逻辑进入 `core/` 或 `logic/`。
- **职责清晰**: 子组件归于 `components/`，类型定义归于 `types.ts`，配置归于 `config/`。

## 2. 待处理工具清单

### 2.1. 正则批量替换 (`regex-applier`) - 完成
**现状**: 逻辑、配置、子组件全部平铺在根目录。`registry` 文件过于臃肿，包含大量接口定义和业务实现。
- [x] 移动 `PresetManager.vue` -> `components/`
- [x] 移动 `engine.ts`, `presets.ts` -> `core/`
- [x] 移动 `store.ts` -> `stores/`
- [x] 移动 `appConfig.ts` -> `config/`
- [x] 提取 `regexApplier.registry.ts` 中的类型定义到 `types.ts`
- [x] 将 `registry` 中的核心业务方法（如 `processText`, `processFiles`）抽离到 `core/engine.ts`

### 2.2. LLM 检查器 (`llm-inspector`) - 完成
**现状**: 核心逻辑类平铺在根目录，虽然有 `composables` 目录但 `core` 层缺失。
- [x] 移动 `configManager.ts`, `proxyService.ts`, `recordManager.ts`, `streamProcessor.ts`, `utils.ts` -> `core/`

### 2.3. 数据筛选工具 (`data-filter`) - 完成
**现状**: 结构极其扁平，逻辑文件在根目录。
- [x] 移动 `dataFilter.logic.ts` -> `logic/`

### 2.4. JSON 格式化 (`json-formatter`) - 完成
**现状**: 逻辑文件在根目录。
- [x] 移动 `jsonFormatter.logic.ts` -> `logic/`

### 2.5. 目录清理工 (`directory-janitor`) - 完成
**现状**: 部分逻辑和配置平铺。
- [x] 移动 `presets.ts` -> `config/` 或 `core/`
- [x] 移动 `store.ts` -> `stores/`
- [x] 移动 `utils.ts` -> `utils/`

### 2.6. Git 分析器 (`git-analyzer`) - 完成
**现状**: 结构基本合格，但 `config.ts` 仍在根目录。
- [x] 移动 `config.ts` -> `config/`

### 2.7. 代码格式化 (`code-formatter`) - 完成
**现状**: 已有 `logic/` 目录，但 `registry` 命名虽符合桌面规范，但内部逻辑可进一步精简。
- [x] 检查 `types` 是否需要独立。

### 2.8. 富文本渲染器 (`rich-text-renderer`)
**现状**: 核心工具，但根目录堆积了大量逻辑文件。
- [ ] 移动 `CustomParser.ts`, `StreamProcessor.ts`, `StreamProcessorV2.ts` -> `core/`
- [ ] 移动 `presets.ts` -> `config/`
- [ ] 移动 `store.ts` -> `stores/`
- [ ] 移动 `RichTextRendererTester.vue` -> `components/` 或 `tests/`

### 2.9. 智能 OCR (`smart-ocr`) - 完成
**现状**: 逻辑和配置混杂在根目录。
- [x] 移动 `config.ts`, `language-packs.ts` -> `config/`
- [x] 移动 `smartOcr.store.ts` -> `stores/`

### 2.10. 接口测试器 (`api-tester`) - 完成
**现状**: 根目录平铺了 store 和 presets。
- [x] 移动 `presets.ts` -> `config/`
- [x] 移动 `store.ts` -> `stores/`

## 3. 优先级建议
1. **P0**: `regex-applier`, `llm-inspector`, `rich-text-renderer` (核心逻辑重灾区)
2. **P1**: `data-filter`, `json-formatter`, `smart-ocr`, `api-tester`
3. **P2**: `directory-janitor`, `git-analyzer` 等工具的微调。

## 4. 执行规范
- 移动文件后，必须同步更新所有 `import` 引用。
- 确保 `registry.ts` 只负责工具注册、元数据声明和对核心逻辑的简单调用包装。