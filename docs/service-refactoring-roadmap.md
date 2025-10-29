# 工具服务化改造路线图

## 当前进度

### ✅ 已完成（5/15）

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

3. **应用集成**
   - ✅ `main.ts` 中调用自动注册
   - ✅ 服务在应用启动时初始化

4. **服务监控工具**
   - ✅ `ServiceMonitor.vue` - 可视化服务状态
   - ✅ 支持查看服务元数据和方法签名

---

## 改造优先级分级

### 🟢 简单级（纯文本处理，优先改造）

**特点：** 无复杂状态，纯函数式逻辑，适合快速验证模式

#### 1. JsonFormatter（完成）
- **复杂度：** ⭐
- **业务逻辑：**
  - JSON 解析与格式化
  - 自定义展开层级
  - 文件拖放读取
- **改造要点：**
  - 创建 `jsonFormatter.service.ts`
  - 方法：`formatJson(text, options)`, `parseJson(text)`
  - 移除组件内的格式化逻辑

#### 2. CodeFormatter（完成）
- **复杂度：** ⭐⭐
- **业务逻辑：**
  - 多语言代码格式化（Prettier）
  - 语言检测与插件加载
- **改造要点：**
  - 创建 `codeFormatter.service.ts`
  - 方法：`format(code, language, options)`
  - 处理异步插件加载

---

### 🟡 中等复杂度（文件操作）

**特点：** 涉及文件系统交互，需要处理异步操作和错误

#### 3. TextDiff（下一个目标）
- **复杂度：** ⭐⭐⭐
- **业务逻辑：**
  - 文件对比（Monaco Diff Editor）
  - 文件读写
  - 补丁生成与导出
- **改造要点：**
  - 创建 `textDiff.service.ts`
  - 方法：`loadFile()`, `saveFile()`, `generatePatch()`
  - 保留 Monaco 编辑器实例管理在组件层

#### 4. SymlinkMover
- **复杂度：** ⭐⭐
- **业务逻辑：**
  - 符号链接管理
  - 文件/目录移动
- **改造要点：**
  - 创建 `symlinkMover.service.ts`
  - 封装 Tauri 文件操作命令

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

const logger = createModuleLogger('services/tool-name');

export interface ToolOptions {
  // 配置选项
}

export interface ToolResult {
  // 返回结果
}

export default class ToolNameService implements ToolService {
  public readonly id = 'tool-name';
  public readonly name = '工具显示名称';
  public readonly description = '工具描述';

  /**
   * 核心业务方法
   */
  public async process(options: ToolOptions): Promise<ToolResult> {
    logger.info('开始处理', { options });
    
    try {
      // 业务逻辑
      const result = await this.doSomething(options);
      
      logger.info('处理完成', { result });
      return result;
    } catch (error) {
      logger.error('处理失败', error);
      throw error;
    }
  }

  /**
   * 获取服务元数据
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
          returnType: 'Promise<ToolResult>'
        }
      ]
    };
  }

  private async doSomething(options: ToolOptions): Promise<any> {
    // 私有辅助方法
  }
}
```

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
- [ ] 实现 `getMetadata()` 方法，并且只包含对外暴露方法，不包含内部方法
- [ ] 添加详细的 JSDoc 注释
- [ ] 使用模块日志记录器
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