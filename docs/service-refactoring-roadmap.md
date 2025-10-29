# 工具服务化改造路线图

## 当前进度

### ✅ 已完成（9/15）

1. **基础架构** - 服务化核心框架
   - `src/services/types.ts` - 服务接口定义
   - `src/services/registry.ts` - 服务注册表
   - `src/services/auto-register.ts` - 自动注册机制
   - `src/services/index.ts` - 统一导出

2. **DirectoryTree** - 试点工具（完成）
   - ✅ 创建 `directoryTree.service.ts`
   - ✅ 重构 `DirectoryTree.vue`
   - ✅ 实现完整的元数据（getMetadata）
   - ✅ 业务逻辑完全从组件剥离

3. **JsonFormatter** - 简单级工具（完成）
   - ✅ 创建 `jsonFormatter.service.ts`
   - ✅ 重构 `JsonFormatter.vue`
   - ✅ 实现 JSON 解析、格式化、文件读取功能
   - ✅ 完整的元数据和类型定义

4. **CodeFormatter** - 简单级工具（完成）
   - ✅ 创建 `codeFormatter.service.ts`
   - ✅ 重构 `CodeFormatter.vue`
   - ✅ 支持多语言格式化（Prettier）
   - ✅ 动态插件加载和语言检测

5. **应用集成**
   - ✅ `main.ts` 中调用自动注册
   - ✅ 服务在应用启动时初始化

6. **TextDiff** - 中等复杂度工具（完成）
   - ✅ 创建 `textDiff.service.ts`
   - ✅ 重构 `TextDiff.vue`
   - ✅ 实现文件操作、补丁生成、剪贴板功能
   - ✅ Monaco 编辑器管理保留在组件层

7. **服务监控工具**
   - ✅ `ServiceMonitor.vue` - 可视化服务状态
   - ✅ 支持查看服务元数据和方法签名

8. **SymlinkMover** - 中等复杂度工具（完成）
   - ✅ 创建 `symlinkMover.service.ts`
   - ✅ 重构 `SymlinkMover.vue`
   - ✅ 文件验证逻辑封装
   - ✅ 文件列表管理（添加、删除、合并）
   - ✅ 核心操作（移动+链接、仅创建链接）
   - ✅ 进度监听与日志管理
   - ✅ 完整的元数据定义

---

## 改造优先级分级

### 🟢 简单级（纯文本处理，优先改造）

**特点：** 无复杂状态，纯函数式逻辑，适合快速验证模式

#### 1. JsonFormatter ✅
- **复杂度：** ⭐
- **状态：** 已完成
- **业务逻辑：**
  - JSON 解析与格式化
  - 自定义展开层级
  - 文件拖放读取
- **已实现：**
  - ✅ `jsonFormatter.service.ts` - 核心服务
  - ✅ `formatJson()`, `parseJson()`, `readFile()` 方法
  - ✅ 组件重构，业务逻辑完全剥离

#### 2. CodeFormatter ✅
- **复杂度：** ⭐⭐
- **状态：** 已完成
- **业务逻辑：**
  - 多语言代码格式化（Prettier）
  - 语言检测与插件加载
- **已实现：**
  - ✅ `codeFormatter.service.ts` - 核心服务
  - ✅ `formatCode()`, `detectLanguage()`, `getSupportedLanguages()` 方法
  - ✅ 异步插件加载和错误处理

---

### 🟡 中等复杂度（文件操作）

**特点：** 涉及文件系统交互，需要处理异步操作和错误

#### 3. TextDiff ✅
- **复杂度：** ⭐⭐⭐
- **状态：** 已完成
- **业务逻辑：**
  - 文件对比（Monaco Diff Editor）
  - 文件读写
  - 补丁生成与导出
  - 剪贴板操作
- **已实现：**
  - ✅ `textDiff.service.ts` - 核心服务
  - ✅ `openFile()`, `loadFile()`, `saveFile()` - 文件操作
  - ✅ `generatePatch()`, `exportPatch()` - 补丁处理
  - ✅ `copyToClipboard()`, `pasteFromClipboard()` - 剪贴板
  - ✅ Monaco 编辑器实例管理保留在组件层
  - ✅ 差异导航功能保留在组件层

#### 4. SymlinkMover ✅
- **复杂度：** ⭐⭐
- **状态：** 已完成
- **业务逻辑：**
  - 符号链接/硬链接管理
  - 文件/目录移动
  - 进度监听与日志记录
  - 文件验证（跨设备、目录支持检测）
- **已实现：**
  - ✅ `symlinkMover.service.ts` - 核心服务
  - ✅ `validateFile()`, `validateFiles()` - 文件验证
  - ✅ `parsePathsToFileItems()`, `mergeFileItems()`, `removeFileByIndex()` - 文件列表管理
  - ✅ `moveAndLink()`, `createLinksOnly()` - 核心操作
  - ✅ `startProgressListener()`, `stopProgressListener()` - 进度监听
  - ✅ `getLatestLog()`, `getAllLogs()` - 原始日志管理
  - ✅ **高级封装方法（Agent 调用接口）：**
    - `getLatestOperationSummary()` - 获取格式化的最新操作摘要
    - `getOperationHistory(limit?)` - 获取格式化的操作历史
  - ✅ 内部格式化工具（不对外暴露）：`formatBytes()`, `formatDuration()`, `formatTimestamp()` 等
- **设计亮点：**
  - 🎯 **分层设计**：内部方法 vs 对外接口明确分离
  - 🎯 **高级封装**：Agent 调用时一次调用即可获取完整格式化信息
  - 🎯 **完整类型定义**：新增 `FormattedLogSummary` 接口
  - 🎯 **元数据优化**：只暴露真正需要对外调用的方法，包含使用示例

---

### 🔴 复杂级（状态管理整合）

**特点：** 已有 Pinia store，需要决定状态管理策略

#### 5. RegexApplier
- **复杂度：** ⭐⭐⭐⭐
- **现有架构：**
  - `store.ts` - Pinia 预设管理
  - `engine.ts` - 规则应用引擎
  - `appConfig.ts` - 应用配置
- **改造策略：**
  - **保留 Pinia store** 用于预设管理（共享状态）
  - **创建 Service** 封装文件处理逻辑
  - 方法：`processText()`, `processFiles()`
  - Service 可以调用 store，但不依赖 Vue 实例

#### 6. ApiTester
- **复杂度：** ⭐⭐⭐⭐
- **现有架构：**
  - `store.ts` - Profile 管理
  - `types.ts` - 类型定义
- **改造策略：**
  - 保留 Pinia 用于 profile 状态
  - Service 封装 HTTP 请求逻辑

---

### 🔵 待评估工具

#### 7. git-analyzer
- **待分析：** 需要查看具体实现
- **预估复杂度：** ⭐⭐⭐

#### 8. directory-janitor
- **待分析：** 目录清理工具
- **预估复杂度：** ⭐⭐

#### 9. media-info-reader
- **待分析：** 媒体信息读取
- **预估复杂度：** ⭐⭐

#### 10. smart-ocr
- **复杂度：** ⭐⭐⭐⭐
- **特殊性：** OCR 服务已在 composables 中

#### 11. llm-chat
- **复杂度：** ⭐⭐⭐⭐⭐
- **特殊性：** 已有完善的 composables 架构，可能不需要改造

---

## 改造模板与最佳实践

### 服务类模板

```typescript
import type { ToolService } from '@/services/types';
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler, ErrorLevel } from '@/utils/errorHandler';

const logger = createModuleLogger('services/tool-name');
const errorHandler = createModuleErrorHandler('services/tool-name');

// ==================== 类型定义 ====================

export interface ToolOptions {
  // 配置选项
}

export interface ToolResult {
  // 返回结果
}

// 格式化的高级结果（用于 Agent 调用）
export interface FormattedResult {
  summary: string;
  details: Record<string, any>;
}

// ==================== 服务类 ====================

export default class ToolNameService implements ToolService {
  public readonly id = 'tool-name';
  public readonly name = '工具显示名称';
  public readonly description = '工具描述';

  // ==================== 核心业务方法 ====================

  /**
   * 核心业务方法
   */
  public async process(options: ToolOptions): Promise<ToolResult | null> {
    logger.info('开始处理', options);
    
    return await errorHandler.wrapAsync(
      async () => {
        const result = await this.doSomething(options);
        logger.info('处理完成', { result });
        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: '处理失败',
        context: options,
      }
    );
  }

  // ==================== 高级封装方法（Agent 调用接口）====================

  /**
   * 获取格式化的处理结果（推荐 Agent 使用）
   */
  public async getFormattedResult(options: ToolOptions): Promise<FormattedResult | null> {
    const result = await this.process(options);
    if (!result) return null;

    return {
      summary: this.formatSummary(result),
      details: this.extractDetails(result),
    };
  }

  // ==================== 内部辅助方法 ====================

  /**
   * 格式化摘要（内部使用，不对外暴露）
   */
  private formatSummary(result: ToolResult): string {
    // 格式化逻辑
    return '';
  }

  /**
   * 提取详细信息（内部使用，不对外暴露）
   */
  private extractDetails(result: ToolResult): Record<string, any> {
    // 提取逻辑
    return {};
  }

  private async doSomething(options: ToolOptions): Promise<ToolResult> {
    // 私有业务逻辑
    return {} as ToolResult;
  }

  // ==================== 元数据 ====================

  /**
   * 获取服务元数据（仅包含对外公开的高级接口）
   */
  public getMetadata() {
    return {
      methods: [
        {
          name: 'process',
          description: '核心处理方法',
          parameters: [
            {
              name: 'options',
              type: 'ToolOptions',
              description: '处理选项',
              properties: [
                {
                  name: 'param1',
                  type: 'string',
                  description: '参数说明',
                }
              ]
            }
          ],
          returnType: 'Promise<ToolResult | null>',
          example: `
await service.process({
  param1: 'value'
});`
        },
        {
          name: 'getFormattedResult',
          description: '获取格式化的处理结果（推荐 Agent 使用）',
          parameters: [
            {
              name: 'options',
              type: 'ToolOptions',
              description: '处理选项'
            }
          ],
          returnType: 'Promise<FormattedResult | null>',
          example: `
const result = await service.getFormattedResult({ param1: 'value' });
// 返回: { summary, details }`
        }
      ]
    };
  }
}
```

### 元数据设计原则 ⭐

在设计 `getMetadata()` 时，应遵循以下原则：

1. **只暴露对外接口**
   - ❌ 不要包含内部辅助方法（如 `formatBytes()`, `formatTimestamp()`）
   - ✅ 只暴露真正需要被外部（特别是 Agent）调用的方法

2. **提供高级封装**
   - ❌ 避免让 Agent 分散调用多个方法来拼接信息
   - ✅ 提供"一次调用完成"的高级方法（如 `getFormattedResult()`）

3. **清晰的职责边界**
   - **UI 层方法**：文件列表管理、UI 状态辅助等，保持 public 但不在元数据中暴露
   - **Agent 调用方法**：核心业务 + 高级封装，在元数据中暴露
   - **内部方法**：格式化工具、私有逻辑，设为 private

4. **包含使用示例**
   - 每个对外方法都应包含 `example` 字段
   - 示例应展示实际调用方式和返回值结构

5. **完整的类型定义**
   - 为高级封装方法定义专门的返回类型（如 `FormattedLogSummary`）
   - 类型应该是自解释的，包含所有必要字段

### 组件重构模板

```vue
<script setup lang="ts">
import { serviceRegistry } from '@/services/registry';
import type ToolNameService from './toolName.service';

// 获取服务实例
const toolService = serviceRegistry.getService<typeof ToolNameService>('tool-name');

// 组件状态（仅 UI 相关）
const isProcessing = ref(false);
const result = ref('');

// UI 事件处理
const handleProcess = async () => {
  isProcessing.value = true;
  try {
    const output = await toolService.process({ /* options */ });
    result.value = output.data;
  } catch (error) {
    // 错误处理
  } finally {
    isProcessing.value = false;
  }
};
</script>
```

---

## 改造检查清单

每个工具改造时应确保：

### Service 层
- [ ] 创建 `*.service.ts` 文件
- [ ] 实现 `ToolService` 接口
- [ ] 定义清晰的输入输出类型
- [ ] **设计高级封装方法**（用于 Agent 调用）
  - [ ] 提供"一次调用完成"的高级接口
  - [ ] 为高级方法定义专门的返回类型（如 `FormattedResult`）
- [ ] 实现 `getMetadata()` 方法
  - [ ] **只包含对外暴露的高级接口**
  - [ ] **不包含内部辅助方法**（如格式化工具）
  - [ ] 每个方法包含使用示例（`example` 字段）
- [ ] 使用统一错误处理（`errorHandler.wrapAsync`）
- [ ] 添加详细的 JSDoc 注释
- [ ] 使用模块日志记录器（`createModuleLogger`）
- [ ] 所有业务逻辑从组件移除

### 组件层
- [ ] 通过 `serviceRegistry.getService()` 获取服务
- [ ] 只保留 UI 状态（loading, error 等）
- [ ] 移除所有业务逻辑代码
- [ ] 简化事件处理函数

### 测试
- [ ] 在服务监控工具中验证服务已注册
- [ ] 验证所有功能正常工作
- [ ] 检查错误处理是否正确


---

## 长期目标

1. **完成所有工具服务化**（预计 2-3 周）
2. **建立服务间调用机制**（为 Agent 做准备）
3. **实现服务的热重载**（开发体验优化）
4. **生成服务 API 文档**（基于 metadata）
5. **实现工具调用协议**（统一的调用接口）

---

## 文档更新计划

- [ ] 完善 `tool-service-refactoring.md` 的实例部分
- [ ] 创建 `service-best-practices.md`
- [ ] 更新每个已改造工具的 README
- [ ] 在项目 README 中添加服务架构说明