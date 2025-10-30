# 工具服务化改造路线图

## 当前进度

### ✅ 已完成（15/15）

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

9. **统一服务执行器** - 核心基础设施（完成）
   - ✅ 创建 `src/services/executor.ts`
   - ✅ 定义 `ToolCall` 和 `ServiceResult` 核心类型
   - ✅ 实现 `execute()` 函数 - 统一服务调用入口
   - ✅ 实现 `executeMany()` 函数 - 批量调用支持
   - ✅ 集成统一错误处理和日志记录
   - ✅ 在 `src/services/index.ts` 中导出

10. **RegexApplier** - 复杂级工具（完成）

- ✅ 创建 `regexApplier.service.ts`
- ✅ 重构 `RegexApplier.vue`
- ✅ 保留 Pinia store 用于预设管理
- ✅ 服务封装文本和文件处理逻辑
- ✅ 实现文本处理（`processText`）
- ✅ 实现文件批量处理（`processFiles`）
- ✅ 实现剪贴板操作（`pasteFromClipboard`, `copyToClipboard`）
- ✅ 实现一键处理（`oneClickProcess`）
- ✅ 高级封装方法（`getFormattedTextResult`, `getFormattedFileResult`）
- ✅ 完整的元数据定义

11. **SmartOcr** - 超复杂级工具（完成）

- ✅ 采用新的"上下文模式"架构
- ✅ 创建 `OcrContext.ts` - 响应式上下文类
- ✅ 改造 `smartOcr.service.ts` 为无状态工厂
- ✅ 重构 `SmartOcr.vue` 使用 Context 实例
- ✅ 优化 composables 结构（拆分引擎实现）
- ✅ 创建 `useTesseractEngine` - Tesseract OCR 引擎
- ✅ 创建 `useNativeEngine` - Windows 原生 OCR 引擎
- ✅ 创建 `useVlmEngine` - 多模态大模型 OCR 引擎
- ✅ 重构 `useOcrRunner` - 轻量级编排者
- ✅ 完整的元数据和类型定义

12. **GitAnalyzer** - 复杂级工具（完成）

- ✅ 采用"上下文模式"架构
- ✅ 创建 `GitAnalyzerContext.ts` - 集中管理响应式状态
- ✅ 创建 `useGitLoader.ts` - 数据获取层（与 Tauri 后端交互）
- ✅ 创建 `useGitProcessor.ts` - 数据处理层（纯函数）
- ✅ 创建 `useGitAnalyzerRunner.ts` - 业务编排层
- ✅ 创建 `gitAnalyzer.service.ts` - 无状态服务层
- ✅ 实现 Agent 友好的高级接口（`getFormattedAnalysis`, `getAuthorCommits`, `getBranchList`）
- ✅ 重构 `GitAnalyzer.vue` 使用新架构
- ✅ 更新辅助 composables（`useCharts.ts`, `useReportGenerator.ts`）
- ✅ 完整的元数据定义

13. **DirectoryJanitor** - 中等复杂度工具（完成）

- ✅ 采用"上下文模式"架构
- ✅ 创建 `DirectoryJanitorContext.ts` - 管理所有响应式状态和业务编排
- ✅ 创建 `directoryJanitor.service.ts` - 无状态服务层
- ✅ 实现 Agent 友好的高级接口：
  - ✅ `scanDirectory()` - 扫描目录并返回格式化结果
  - ✅ `cleanupItems()` - 清理指定的文件和目录
  - ✅ `scanAndCleanup()` - 一步到位的扫描并清理
- ✅ 重构 `DirectoryJanitor.vue` 使用 Context 实例驱动 UI
- ✅ 重构 `ConfigPanel.vue` 和 `ResultPanel.vue` 适配新架构
- ✅ 服务元数据只暴露高级接口
- ✅ 完整的类型定义和错误处理

---

## 改造优先级分级

> **核心指导思想 (2025-10-30 更新):** 服务化改造的核心目标是**识别并封装可复用的核心能力**，使其能被其他工具或未来的 AI Agent 以编程方式调用。优先级将依据“对 Agent 的战略价值”和“能力的可复用性”进行动态调整，而不仅仅是评估技术改造的复杂度。

### 🌟 Agent 核心能力 (优先改造)

**特点：** 为 Agent 提供强大的、可编程的上下文感知和项目操作能力，是实现高级自动化功能的基础。

#### 1. git-analyzer ✅ (已完成)

- **复杂度：** ⭐⭐⭐⭐
- **状态：** `[x] 已完成`
- **服务化价值：** **极高**。为 Agent 提供强大的代码库洞察能力，例如查询提交历史、分析贡献者、获取分支状态等。是实现代码智能分析、自动化报告等高级功能的基础。
- **改造总结：**
  - ✅ 采用"上下文模式"架构，创建 `GitAnalyzerContext.ts` 管理响应式状态
  - ✅ 创建 `useGitLoader.ts` - 数据获取层（Tauri 交互）
  - ✅ 创建 `useGitProcessor.ts` - 数据处理层（纯函数）
  - ✅ 创建 `useGitAnalyzerRunner.ts` - 业务编排层
  - ✅ 创建 `gitAnalyzer.service.ts` - 无状态服务层，提供 Agent 友好的高级接口
  - ✅ 重构 `GitAnalyzer.vue` 使用新架构
  - ✅ 完整的元数据定义

---

### 🟢 简单级（纯文本处理）

**特点：** 无复杂状态，纯函数式逻辑，已完成。

#### 2. JsonFormatter ✅ (已完成)
#### 3. CodeFormatter ✅ (已完成)

---

### 🟡 中等复杂度（文件操作）

**特点：** 涉及文件系统交互，需要处理异步操作和错误。

#### 4. TextDiff ✅ (已完成)
#### 5. SymlinkMover ✅ (已完成)

#### 6. directory-janitor ✅ (已完成)

- **复杂度：** ⭐⭐
- **状态：** `[x] 已完成`
- **服务化价值：** **较高**。允许 Agent 以编程方式执行清理任务，例如"使用'临时文件'规则集清理下载文件夹"。
- **改造总结：**
  - ✅ 采用"上下文模式"架构
  - ✅ 创建 `DirectoryJanitorContext.ts` 管理响应式状态和业务编排
  - ✅ 创建 `directoryJanitor.service.ts` 无状态服务层
  - ✅ 实现 `scanDirectory()`, `cleanupItems()`, `scanAndCleanup()` 高级接口
  - ✅ 重构 `DirectoryJanitor.vue` 使用 Context 驱动
  - ✅ 完整的元数据定义

#### 7. AI Image Metadata Reader (media-info-reader) ✅ (已完成)

- **复杂度：** ⭐⭐⭐
- **状态：** `[x] 已完成`
- **服务化价值：** **极高**。为 Agent 提供了理解 AI 生成图片（Stable Diffusion, ComfyUI）背后参数的核心能力。Agent 可以通过此服务读取图片的 Prompt、模型、采样器等关键信息，用于分析、复现或学习。
- **改造总结：**
  - ✅ 创建 `useMediaInfoParser.ts` composable - 封装核心解析逻辑（纯函数）
  - ✅ 创建 `mediaInfoReader.service.ts` - 无状态服务层，作为薄层入口
  - ✅ 封装了 `exifr` 和自定义的 PNG `tEXt` 区块解析逻辑
  - ✅ 实现对 Stable Diffusion WebUI、ComfyUI、SillyTavern 角色卡的元数据提取
  - ✅ 提供 Agent 友好的高级接口：
    - ✅ `readImageMetadata(filePath)` - 从文件路径读取并解析
    - ✅ `parseImageBuffer(buffer)` - 从内存 buffer 直接解析
  - ✅ 重构 `MediaInfoReader.vue` 直接使用 composable（未采用 Context 模式，因复杂度较低）
  - ✅ 完整的元数据定义和类型导出

---

### 🔴 复杂级（状态管理整合）

**特点：** 通常与 Pinia store 紧密耦合，或具有复杂的内部状态。

#### 8. RegexApplier ✅ (已完成)
#### 9. smart-ocr ✅ (已完成)

---

### 🔵 低优先级 (重新评估)

**特点：** 服务化带来的直接价值有限，或已有更合适的替代方案。

#### 10. ApiTester

- **复杂度：** ⭐⭐⭐⭐
- **状态：** `[ ] 暂缓`
- **重新评估：** 核心价值在于其 UI，作为一个独立的 HTTP 客户端工具。其他服务若需发送 HTTP 请求，直接调用底层的 `fetch` 或封装的 `apiRequest` 更为直接高效。几乎不存在一个服务需要调用 `ApiTester` 服务来完成自身逻辑的场景，因此服务化价值较低。

#### 11. llm-chat

- **复杂度：** ⭐⭐⭐ (采用外观模式后降低)
- **状态：** `[ ] 计划中`
- **重新评估 (2025-10-30):** 原始评估是正确的，全面服务化重构的成本很高。但为了满足 Agent 编程交互和工具间协同的需求，我们决定采用一种更轻量的**外观服务 (Facade Service)** 模式。
- **改造策略：**
  - **第一步：全局状态管理** - 创建 `useChatInputManager.ts` composable
    - 管理全局的输入框文本内容和附件列表
    - 使用单例模式，确保主窗口和分离窗口共享同一份状态
    - 集成现有的 `useAttachmentManager` 逻辑
    - 支持状态持久化（localStorage），避免刷新或关闭窗口导致内容丢失
    - 提供跨窗口同步机制（利用现有的窗口同步基础设施）
  - **第二步：外观服务** - 创建 `llmChat.service.ts`
    - 该服务不包含核心业务逻辑，仅作为对外的编程接口
    - 调用 `useChatInputManager` 来操作输入框状态
  - **第三步：组件重构** - 更新 `MessageInput.vue`
    - 移除组件内部的本地 `inputText` 状态
    - 调用 `useChatInputManager` 获取全局状态
    - 保持 UI 逻辑不变，仅改变状态来源
- **核心接口设计** (`llmChat.service.ts`):
  - `addContentToInput(content: string, position: 'append' | 'prepend' = 'append')`: 向输入框追加或前置内容
  - `getInputContent(): string`: 获取当前输入框的完整内容，用于其他工具进行预处理
  - `setInputContent(content: string)`: 完全覆盖输入框的内容，用于写回预处理后的结果
  - `getAttachments(): Asset[]`: 获取当前附件列表
  - `addAttachment(asset: Asset)`: 添加附件
  - `clearInput()`: 清空输入框和附件
- **附加价值：**
  - 用户在主窗口和分离窗口之间切换时，输入内容不会丢失
  - 意外关闭窗口或刷新页面后，可以恢复未发送的内容
  - 为未来的"草稿自动保存"功能打下基础
  - 支持工具间协同：其他工具可以将处理结果直接注入到聊天输入框

## 改造模板与最佳实践

### 服务类模板

```typescript
import type { ToolService } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler, ErrorLevel } from "@/utils/errorHandler";

const logger = createModuleLogger("services/tool-name");
const errorHandler = createModuleErrorHandler("services/tool-name");

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
  public readonly id = "tool-name";
  public readonly name = "工具显示名称";
  public readonly description = "工具描述";

  // ==================== 核心业务方法 ====================

  /**
   * 核心业务方法
   */
  public async process(options: ToolOptions): Promise<ToolResult | null> {
    logger.info("开始处理", options);

    return await errorHandler.wrapAsync(
      async () => {
        const result = await this.doSomething(options);
        logger.info("处理完成", { result });
        return result;
      },
      {
        level: ErrorLevel.ERROR,
        userMessage: "处理失败",
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
    return "";
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
          name: "process",
          description: "核心处理方法",
          parameters: [
            {
              name: "options",
              type: "ToolOptions",
              description: "处理选项",
              properties: [
                {
                  name: "param1",
                  type: "string",
                  description: "参数说明",
                },
              ],
            },
          ],
          returnType: "Promise<ToolResult | null>",
          example: `
await service.process({
  param1: 'value'
});`,
        },
        {
          name: "getFormattedResult",
          description: "获取格式化的处理结果（推荐 Agent 使用）",
          parameters: [
            {
              name: "options",
              type: "ToolOptions",
              description: "处理选项",
            },
          ],
          returnType: "Promise<FormattedResult | null>",
          example: `
const result = await service.getFormattedResult({ param1: 'value' });
// 返回: { summary, details }`,
        },
      ],
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
import { serviceRegistry } from "@/services/registry";
import type ToolNameService from "./toolName.service";

// 获取服务实例
const toolService = serviceRegistry.getService<typeof ToolNameService>("tool-name");

// 组件状态（仅 UI 相关）
const isProcessing = ref(false);
const result = ref("");

// UI 事件处理
const handleProcess = async () => {
  isProcessing.value = true;
  try {
    const output = await toolService.process({
      /* options */
    });
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

- [ ] **通过统一执行器 `execute()` 调用服务**
- [ ] 只保留 UI 状态（loading, error 等）
- [ ] 移除所有业务逻辑代码
- [ ] 简化事件处理函数，使其成为 `execute` 的调用者

### 测试

- [ ] 在服务监控工具中验证服务已注册
- [ ] 验证所有功能正常工作
- [ ] 检查错误处理是否正确

---

## 统一服务调用架构：执行器模式

为了给未来的 Agent 调用和工具间协同工作提供一个稳定、统一的入口，我们引入一个轻量级的**统一执行器 (Unified Executor)**。它将作为所有服务调用的唯一通道，实现关注点分离。

**核心理念**：UI 组件和其他服务不直接与目标服务实例交互，而是通过一个统一的 `execute` 函数发起调用。

### 架构图

```mermaid
graph TD
    subgraph Callers (调用方)
        B[UI Component]
        C[Another Service]
    end

    subgraph Unified Executor (统一执行器)
        D{execute(call: ToolCall)}
        F[1. 查找服务]
        G[2. 执行方法]
        H[3. 包装结果]
    end

    subgraph Service Discovery
        I[ServiceRegistry]
    end

    subgraph Services (具体服务)
        J[RegexApplierService]
        K[SymlinkMoverService]
        L[...]
    end

    B -- Programmatic Call --> D
    C -- Programmatic Call --> D

    D --> F
    F -- "getService(id)" --> I
    I -- return Service Instance --> F
    F --> G
    G -- "service.method(params)" --> J
    G --> H

    H -- 返回 Promise<ServiceResult> --> B
    H -- 返回 Promise<ServiceResult> --> C
```

### 核心接口定义

将在 `src/services/executor.ts` (待创建) 中定义以下核心类型：

```typescript
// 描述一个完整的工具调用请求
export interface ToolCall<TParams = Record<string, any>> {
  service: string; // 服务 ID，例如 'regex-applier'
  method: string; // 要调用的方法名
  params: TParams; // 传递给方法的参数
}

// 标准化的服务返回结果
export type ServiceResult<TData = any, TError = Error> =
  | { success: true; data: TData }
  | { success: false; error: TError };

// 执行器函数签名
export async function execute<TData = any>(call: ToolCall): Promise<ServiceResult<TData>> {
  // ... 实现逻辑
}
```

### 调用示例 (在组件中)

```typescript
import { execute } from "@/services/executor";

async function handleProcessFiles() {
  const result = await execute({
    service: "regex-applier",
    method: "processFiles",
    params: {
      /* ...从 UI 收集的参数... */
    },
  });

  if (result.success) {
    // 更新 UI
    console.log("处理成功:", result.data);
  } else {
    // 显示错误
    console.error("处理失败:", result.error);
  }
}
```

### 优点

1.  **强解耦**：调用方无需关心服务的具体实例，只需描述“做什么”。
2.  **一致性**：所有服务调用都遵循相同的模式，返回统一的 `ServiceResult` 结构，简化了调用方的错误处理逻辑。
3.  **可扩展性**：未来可以在执行器中轻松添加日志、权限校验、性能监控等横切关注点，而无需修改任何服务。
4.  **接口清晰**：为姐姐后续设计的 Agent 解析器层提供了干净、单一的对接点。

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
