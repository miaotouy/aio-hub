# 日志与错误处理系统使用指南

## 概述

应用现在拥有完善的日志记录和错误处理系统，可以帮助你更好地追踪问题和调试。

## 日志系统 (logger.ts)

### 特性

- **分级日志**: DEBUG, INFO, WARN, ERROR
- **自动文件持久化**: 日志自动保存到 `AppData/logs/app-YYYY-MM-DD.log`
- **控制台输出**: 同时输出到浏览器控制台
- **日志缓冲**: 保留最近 1000 条日志在内存中
- **详细上下文**: 支持附加数据和堆栈信息

### 使用方法

#### 1. 创建模块日志器

```typescript
import { createModuleLogger } from '@/utils/logger';

const logger = createModuleLogger('MyModule');

// 使用
logger.debug('调试信息', { data: 'some data' });
logger.info('普通信息');
logger.warn('警告信息', { warning: 'details' });
logger.error('错误信息', error, { context: 'data' });
```

#### 2. 日志级别

```typescript
// DEBUG - 调试信息
logger.debug('函数被调用', { params: { id: 123 } });

// INFO - 一般信息
logger.info('配置加载成功', { profileCount: 5 });

// WARN - 警告
logger.warn('API密钥未配置', { profileId: 'xxx' });

// ERROR - 错误
logger.error('请求失败', error, { 
  url: 'https://api.example.com',
  status: 500 
});
```

#### 3. 设置日志级别

```typescript
import { logger, LogLevel } from '@/utils/logger';

// 仅记录 INFO 及以上级别
logger.setLevel(LogLevel.INFO);

// 开发环境显示所有日志
if (import.meta.env.DEV) {
  logger.setLevel(LogLevel.DEBUG);
}
```

## 错误处理系统 (errorHandler.ts)

### 特性

- **统一错误处理**: 标准化所有错误
- **自动用户提示**: 根据错误级别显示相应提示
- **错误队列**: 保留最近 100 个错误记录
- **友好错误消息**: 自动翻译技术错误为用户可理解的消息
- **与日志系统集成**: 错误自动记录到日志

### 使用方法

#### 1. 创建模块错误处理器

```typescript
import { createModuleErrorHandler } from '@/utils/errorHandler';

const errorHandler = createModuleErrorHandler('MyModule');

// 基础使用
try {
  // 可能出错的代码
  await riskyOperation();
} catch (error) {
  errorHandler.error(error, '操作失败，请重试');
}
```

#### 2. 不同错误级别

```typescript
// INFO - 信息性提示
errorHandler.info(error, '这是一条信息');

// WARN - 警告
errorHandler.warn(error, '配置可能有问题');

// ERROR - 错误（默认）
errorHandler.error(error, '操作失败');

// CRITICAL - 严重错误（不自动关闭提示）
errorHandler.critical(error, '系统遇到严重错误');
```

#### 3. 异步函数包装

```typescript
// 自动捕获异步错误
const result = await errorHandler.wrapAsync(
  async () => {
    return await fetchData();
  },
  {
    userMessage: '获取数据失败',
    context: { userId: 123 }
  }
);

// result 为 null 表示出错
if (result) {
  // 成功处理数据
}
```

#### 4. 同步函数包装

```typescript
const result = errorHandler.wrapSync(
  () => {
    return parseComplexData(data);
  },
  { userMessage: '数据解析失败' }
);
```

## 全局错误捕获

系统已在 `main.ts` 中配置全局错误捕获：

### 1. Vue 错误捕获

```typescript
// 自动捕获 Vue 组件中未处理的错误
app.config.errorHandler = (err, instance, info) => {
  // 自动记录和处理
};
```

### 2. Promise 错误捕获

```typescript
// 自动捕获未处理的 Promise rejection
window.addEventListener('unhandledrejection', (event) => {
  // 自动记录和处理
});
```

### 3. 全局 JavaScript 错误

```typescript
// 自动捕获全局错误
window.addEventListener('error', (event) => {
  // 自动记录和处理
});
```

## 最佳实践

### 1. 在 Composables 中

```typescript
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('MyComposable');
const errorHandler = createModuleErrorHandler('MyComposable');

export function useMyFeature() {
  const loadData = async () => {
    try {
      logger.info('开始加载数据');
      const data = await fetchData();
      logger.info('数据加载成功', { count: data.length });
      return data;
    } catch (error) {
      logger.error('数据加载失败', error);
      errorHandler.error(error, '无法加载数据，请重试');
      return [];
    }
  };

  return { loadData };
}
```

### 2. 在组件中

```typescript
<script setup lang="ts">
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('MyComponent');
const errorHandler = createModuleErrorHandler('MyComponent');

const handleSubmit = async () => {
  try {
    logger.debug('提交表单', { formData });
    await submitForm(formData);
    logger.info('表单提交成功');
    ElMessage.success('保存成功');
  } catch (error) {
    errorHandler.error(error, '保存失败，请重试');
  }
};
</script>
```

### 3. 在 API 调用中

```typescript
async function callApi() {
  const logger = createModuleLogger('ApiCall');
  
  logger.debug('发送API请求', { url, method });
  
  try {
    const response = await fetch(url, options);
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error('API请求失败', new Error(errorText), {
        status: response.status,
        url
      });
      throw new Error(`请求失败 (${response.status})`);
    }
    
    logger.info('API请求成功', { url });
    return await response.json();
  } catch (error) {
    logger.error('API调用异常', error, { url });
    throw error;
  }
}
```

## 调试技巧

### 1. 查看日志文件

日志文件位于：`AppData/aiohub/logs/app-YYYY-MM-DD.log`

在 Windows 上通常是：
```
C:\Users\你的用户名\AppData\Roaming\com.mty.aiohub\logs\
```

### 2. 查看内存中的日志

```typescript
import { logger } from '@/utils/logger';

// 获取所有日志
const logs = logger.getLogBuffer();
console.table(logs);

// 清空日志缓冲
logger.clearBuffer();
```

### 3. 查看错误队列

```typescript
import { errorHandler } from '@/utils/errorHandler';

// 获取所有错误
const errors = errorHandler.getErrorQueue();
console.table(errors);

// 清空错误队列
errorHandler.clearErrorQueue();
```

### 4. 导出日志

```typescript
import { logger } from '@/utils/logger';

// 导出日志到文件
await logger.exportLogs('/path/to/export.log');
```

## 常见问题

### Q: 如何禁用某个模块的日志？

A: 设置更高的日志级别：

```typescript
import { logger, LogLevel } from '@/utils/logger';

// 生产环境只记录错误
if (import.meta.env.PROD) {
  logger.setLevel(LogLevel.ERROR);
}
```

### Q: 如何避免在控制台显示错误提示？

A: 使用 `showToUser: false` 选项：

```typescript
errorHandler.handle(error, {
  showToUser: false,
  context: { silent: true }
});
```

### Q: 如何自定义错误消息？

A: 使用 `userMessage` 参数：

```typescript
errorHandler.error(
  error,
  '自定义的用户友好消息',
  { additionalContext: 'data' }
);
```

### Q: 日志文件会占用大量空间吗？

A: 每天一个日志文件，建议定期清理旧日志。未来版本将添加自动清理功能。

## 迁移指南

### 从旧代码迁移

**之前：**
```typescript
try {
  await operation();
} catch (error) {
  console.error('操作失败:', error);
  ElMessage.error('操作失败');
}
```

**现在：**
```typescript
import { createModuleLogger } from '@/utils/logger';
import { createModuleErrorHandler } from '@/utils/errorHandler';

const logger = createModuleLogger('MyModule');
const errorHandler = createModuleErrorHandler('MyModule');

try {
  await operation();
} catch (error) {
  logger.error('操作失败', error);
  errorHandler.error(error, '操作失败');
}
```

或者更简洁：

```typescript
const result = await errorHandler.wrapAsync(
  () => operation(),
  { userMessage: '操作失败' }
);