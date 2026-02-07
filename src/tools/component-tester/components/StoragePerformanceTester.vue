<template>
  <div class="storage-performance-tester">
    <!-- 顶部控制面板 -->
    <div class="action-bar">
      <div class="bar-title">
        <Activity class="icon" :size="18" />
        <span>性能测试配置</span>
      </div>
      <el-form :inline="true" :model="config" class="config-form">
        <el-form-item label="消息数量">
          <el-input-number
            v-model="config.messageCount"
            :min="100"
            :max="100000"
            :step="100"
            size="small"
          />
        </el-form-item>
        <el-form-item label="单条长度 (KB)">
          <el-input-number
            v-model="config.contentSizeKB"
            :min="1"
            :max="1000"
            :step="1"
            size="small"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" @click="runTest" :loading="testing" size="small">
            <template #icon><Play :size="14" /></template>
            开始测试
          </el-button>
        </el-form-item>
      </el-form>
      <div class="estimated-size">
        <Database :size="14" />
        预计文件大小: <span>{{ estimatedSize }} MB</span>
      </div>
    </div>

    <div class="main-content">
      <!-- 测试结果表格 -->
      <div class="results-card" v-if="results.length > 0">
        <div class="card-header">
          <Zap :size="16" />
          <span>执行步骤详情</span>
        </div>
        <el-table :data="results" style="width: 100%" class="custom-table">
          <el-table-column prop="step" label="步骤" width="220" />
          <el-table-column prop="duration" label="耗时 (ms)" width="120">
            <template #default="{ row }">
              <span class="duration-tag" :class="getDurationClass(row.duration)">
                {{ row.duration.toFixed(2) }}
              </span>
            </template>
          </el-table-column>
          <el-table-column prop="details" label="详情" />
        </el-table>

        <div class="total-summary" v-if="summary">
          <div class="summary-item">
            <span class="label">实际文件大小:</span>
            <span class="value">{{ summary.actualSizeMB.toFixed(2) }} MB</span>
          </div>
          <el-divider direction="vertical" />
          <div class="summary-item">
            <span class="label">总阻塞时间 (JS):</span>
            <span class="value highlight">{{ summary.totalBlockingTime.toFixed(2) }} ms</span>
          </div>
        </div>
      </div>

      <!-- 日志输出区域 -->
      <div class="log-container">
        <div class="log-header">
          <Terminal :size="16" />
          <span>实时执行日志</span>
          <div class="log-actions">
            <el-button link size="small" @click="logs = []">清空</el-button>
          </div>
        </div>
        <div class="log-area" ref="logContainer">
          <div v-if="logs.length === 0" class="empty-log">等待测试开始...</div>
          <div v-for="(log, index) in logs" :key="index" class="log-entry" :class="log.type">
            <span class="log-time">{{ log.time }}</span>
            <span class="log-type-tag">[{{ log.type.toUpperCase() }}]</span>
            <span class="log-msg">{{ log.message }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick } from "vue";
import { Activity, Play, Database, Zap, Terminal } from "lucide-vue-next";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleLogger } from "@/utils/logger";

const logger = createModuleLogger("StoragePerfTest");

const config = reactive({
  messageCount: 1000,
  contentSizeKB: 10,
});

const testing = ref(false);
const results = ref<any[]>([]);
const logs = ref<any[]>([]);
const logContainer = ref<HTMLElement | null>(null);

const estimatedSize = computed(() => {
  return ((config.messageCount * config.contentSizeKB) / 1024).toFixed(2);
});

const summary = ref<{
  actualSizeMB: number;
  totalBlockingTime: number;
} | null>(null);

function addLog(message: string, type: "info" | "warn" | "error" | "success" = "info") {
  const now = new Date().toLocaleTimeString();
  logs.value.push({ time: now, message, type });
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
}

function getDurationClass(duration: number) {
  if (duration > 1000) return "text-danger";
  if (duration > 300) return "text-warning";
  return "text-success";
}

async function runTest() {
  testing.value = true;
  results.value = [];
  logs.value = [];
  summary.value = null;

  try {
    addLog(`开始测试: ${config.messageCount} 条消息, 每条约 ${config.contentSizeKB} KB`);

    // 1. 生成数据
    const genStart = performance.now();
    const session = generateMockSession(config.messageCount, config.contentSizeKB);
    const genEnd = performance.now();
    results.value.push({
      step: "生成模拟数据",
      duration: genEnd - genStart,
      details: `生成了 ${Object.keys(session.nodes).length} 个节点`,
    });
    addLog(`数据生成完成`);

    // 2. JSON.stringify (阻塞主线程)
    const stringifyStart = performance.now();
    const jsonString = JSON.stringify(session, null, 2);
    const stringifyEnd = performance.now();
    results.value.push({
      step: "JSON.stringify (美化)",
      duration: stringifyEnd - stringifyStart,
      details: `字符串长度: ${jsonString.length}`,
    });
    addLog(`JSON序列化完成`);

    // 3. 写入文件 (Tauri Invoke)
    const appDir = await getAppConfigDir();
    const testPath = await join(appDir, "component-tester/perf-tests/perf-test-session.json");
    const encoder = new TextEncoder();
    const uint8Array = encoder.encode(jsonString);

    addLog(`开始调用 write_file_force, 路径: ${testPath}`);
    const writeStart = performance.now();
    await invoke("write_file_force", {
      path: testPath,
      content: uint8Array,
    });
    const writeEnd = performance.now();
    results.value.push({
      step: "write_file_force (IPC + IO)",
      duration: writeEnd - writeStart,
      details: `写入字节: ${uint8Array.length}`,
    });
    addLog(`文件写入完成`, "success");

    // 4. 读取文件
    addLog(`开始调用 read_text_file_force`);
    const readStart = performance.now();
    const readContent = await invoke<string>("read_text_file_force", { path: testPath });
    const readEnd = performance.now();
    results.value.push({
      step: "read_text_file_force (IPC + IO)",
      duration: readEnd - readStart,
      details: `读取字符数: ${readContent.length}`,
    });
    addLog(`文件读取完成`);

    // 5. JSON.parse (阻塞主线程)
    const parseStart = performance.now();
    const parsedData = JSON.parse(readContent);
    const parseEnd = performance.now();
    results.value.push({
      step: "JSON.parse",
      duration: parseEnd - parseStart,
      details: `解析节点数: ${Object.keys(parsedData.nodes || {}).length}`,
    });
    addLog(`JSON反序列化完成`);

    const actualSizeMB = uint8Array.length / (1024 * 1024);
    summary.value = {
      actualSizeMB,
      totalBlockingTime: stringifyEnd - stringifyStart + (parseEnd - parseStart),
    };

    addLog(`测试全部完成! 实际大小: ${actualSizeMB.toFixed(2)} MB`, "success");
  } catch (error: any) {
    addLog(`测试失败: ${error.message}`, "error");
    logger.error("测试失败", error);
  } finally {
    testing.value = false;
  }
}

/**
 * 生成伪随机文本内容，模拟真实 LLM 输出。
 * 混合中英文、代码块、markdown 标记等，避免重复字符导致的
 * V8 字符串优化 / CPU 缓存友好度虚高 / 文件系统透明压缩等问题。
 */
function generateRandomContent(targetBytes: number): string {
  // 预定义的文本片段池，模拟真实对话内容的多样性
  const fragments = [
    "这是一段模拟的中文回复内容，用于测试存储性能。",
    "The quick brown fox jumps over the lazy dog. ",
    "```typescript\nconst result = await fetch(url);\nconst data = await result.json();\nconsole.log(data);\n```\n",
    "## 分析结果\n\n根据以上数据，我们可以得出以下结论：\n\n",
    "1. 首先需要检查配置文件是否正确\n2. 然后验证 API 密钥的有效性\n3. 最后运行集成测试\n\n",
    "在深度学习领域，Transformer 架构已经成为主流。自注意力机制允许模型捕获长距离依赖关系。",
    "```python\nimport numpy as np\nmatrix = np.random.randn(256, 512)\nresult = np.dot(matrix, matrix.T)\nprint(f'Shape: {result.shape}')\n```\n",
    "| 指标 | 数值 | 状态 |\n|------|------|------|\n| 延迟 | 42ms | ✅ |\n| 吞吐 | 1.2k/s | ⚠️ |\n\n",
    "用户的需求可以拆解为三个子任务：数据预处理、模型推理和结果后处理。每个环节都需要仔细优化。",
    "> 注意：此操作不可逆，请确保已备份重要数据。\n\n",
    "函数签名：`function processData<T extends Record<string, unknown>>(input: T[], options?: ProcessOptions): Promise<T[]>`\n\n",
    "根据 RFC 7231 规范，HTTP 状态码 429 表示请求频率超限。建议实现指数退避重试策略。",
    "$$E = mc^2$$\n\n这个公式描述了质量与能量之间的等价关系。\n\n",
    "错误堆栈信息：\n```\nTypeError: Cannot read properties of undefined (reading 'map')\n    at processItems (src/utils/processor.ts:42:15)\n    at async main (src/index.ts:18:3)\n```\n",
    "性能优化建议：考虑使用 Web Worker 将 JSON 序列化操作移出主线程，避免阻塞 UI 渲染。",
    '配置示例：\n```json\n{\n  "model": "gpt-4",\n  "temperature": 0.7,\n  "max_tokens": 4096,\n  "stream": true\n}\n```\n',
  ];

  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,;:!?-_=+[]{}()@#$%&*\n";

  const parts: string[] = [];
  let currentSize = 0;

  // 用片段池填充大部分内容
  while (currentSize < targetBytes) {
    const fragment = fragments[Math.floor(Math.random() * fragments.length)];
    parts.push(fragment);
    // 粗略估算：中文字符约 3 字节 UTF-8，英文 1 字节，取平均 ~1.5
    currentSize += fragment.length * 1.5;

    // 在片段之间插入随机长度的随机字符（模拟不可预测的内容）
    const gapLen = 20 + Math.floor(Math.random() * 80);
    let gap = "";
    for (let i = 0; i < gapLen; i++) {
      gap += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(gap);
    currentSize += gapLen;
  }

  return parts.join("");
}

function generateMockSession(count: number, sizeKB: number) {
  const sessionId = `session-perf-${Date.now()}`;
  const rootNodeId = `node-${Date.now()}-root`;
  const nodes: Record<string, any> = {};

  const targetContentBytes = Math.max(0, sizeKB * 1024 - 500); // 减去一些固定开销

  // 辅助函数：生成随机 ID
  const genId = (prefix = "node") => `${prefix}-${Math.random().toString(36).substring(2, 11)}`;

  nodes[rootNodeId] = {
    id: rootNodeId,
    parentId: null,
    childrenIds: [],
    content: "System Initialized",
    role: "system",
    status: "complete",
    isEnabled: true,
    timestamp: new Date().toISOString(),
    lastSelectedChildId: null,
  };

  let currentTotal = 1;
  const leafNodes: string[] = [rootNodeId];

  while (currentTotal < count) {
    // 随机选一个叶子节点进行扩展，模拟分支
    const parentId = leafNodes[Math.floor(Math.random() * leafNodes.length)];
    const id = genId();

    // 模拟真实元数据
    const isAssistant = Math.random() > 0.5;
    const metadata: any = {
      isEnabled: true,
      timestamp: new Date().toISOString(),
    };

    if (isAssistant) {
      metadata.agentId = "agent-gugu-perf";
      metadata.agentName = "咕咕";
      metadata.modelId = "gemini-3-flash-preview";
      metadata.usage = {
        promptTokens: 20000 + Math.floor(Math.random() * 10000),
        completionTokens: 500 + Math.floor(Math.random() * 2000),
        totalTokens: 0,
      };
      metadata.usage.totalTokens = metadata.usage.promptTokens + metadata.usage.completionTokens;
      metadata.requestStartTime = Date.now();
      metadata.requestEndTime = Date.now() + 5000;
    } else {
      metadata.userProfileId = "user-mty";
      metadata.contentTokens = 1000 + Math.floor(Math.random() * 500);
    }

    // 模拟附件 (10% 概率)
    const attachments =
      Math.random() > 0.9
        ? [
            {
              id: genId("file"),
              type: "image",
              mimeType: "image/png",
              name: "perf-test-image.png",
              path: "images/perf/test.png",
              size: 1024 * 1024,
              importStatus: "complete",
              metadata: { width: 1024, height: 768 },
            },
          ]
        : [];

    nodes[id] = {
      id,
      parentId,
      childrenIds: [],
      content: `<guguthink>\nSimulating complex thought process for node ${currentTotal}\n</guguthink>\n${generateRandomContent(targetContentBytes)}\nMessage index: ${currentTotal}`,
      role: isAssistant ? "assistant" : "user",
      status: "complete",
      isEnabled: true,
      timestamp: new Date().toISOString(),
      metadata,
      attachments,
      lastSelectedChildId: null,
    };

    // 更新父节点的子节点列表和最后选择
    nodes[parentId].childrenIds.push(id);
    nodes[parentId].lastSelectedChildId = id;

    // 如果父节点的分支数超过一定数量，或者随机概率，将其从叶子节点列表中移除
    if (nodes[parentId].childrenIds.length > 2 || Math.random() > 0.8) {
      const idx = leafNodes.indexOf(parentId);
      if (idx > -1) leafNodes.splice(idx, 1);
    }

    leafNodes.push(id);
    currentTotal++;
  }

  return {
    id: sessionId,
    name: "Performance Test Session",
    nodes,
    rootNodeId,
    activeLeafId: leafNodes[leafNodes.length - 1],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    messageCount: currentTotal,
  };
}
</script>

<style scoped>
.storage-performance-tester {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 8px;
  height: 100%;
  box-sizing: border-box;
}

/* 顶部操作栏 */
.action-bar {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  border: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.bar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  font-size: 14px;
  padding-right: 16px;
  border-right: 1px solid var(--border-color);
}

.config-form :deep(.el-form-item) {
  margin-bottom: 0;
  margin-right: 16px;
}

.estimated-size {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-left: auto;
}

.estimated-size span {
  color: var(--el-color-primary);
  font-weight: 600;
  font-family: var(--el-font-family-mono);
}

/* 主内容区域 */
.main-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  flex: 1;
  min-height: 0;
}

/* 结果卡片 */
.results-card {
  background-color: var(--card-bg);
  backdrop-filter: blur(var(--ui-blur));
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
  font-size: 14px;
  font-weight: 600;
  background-color: rgba(var(--el-color-primary-rgb), 0.05);
}

.custom-table {
  --el-table-border-color: var(--border-color);
  --el-table-header-bg-color: transparent;
  background-color: transparent !important;
}

.custom-table :deep(tr) {
  background-color: transparent !important;
}

.duration-tag {
  font-family: var(--el-font-family-mono);
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
}

.text-success {
  color: var(--el-color-success);
}
.text-warning {
  color: var(--el-color-warning);
}
.text-danger {
  color: var(--el-color-danger);
}

/* 总计摘要 */
.total-summary {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 12px 16px;
  background-color: rgba(var(--el-color-primary-rgb), 0.02);
  border-top: 1px solid var(--border-color);
}

.summary-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
}

.summary-item .label {
  color: var(--el-text-color-secondary);
}

.summary-item .value {
  font-weight: 600;
  font-family: var(--el-font-family-mono);
}

.summary-item .highlight {
  color: var(--el-color-warning);
}

/* 日志容器 */
.log-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: rgba(0, 0, 0, 0.2);
  border-radius: 12px;
  border: 1px solid var(--border-color);
  overflow: hidden;
  min-height: 200px;
  backdrop-filter: blur(var(--ui-blur));
}

.log-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background-color: rgba(0, 0, 0, 0.2);
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
  font-weight: 600;
  color: #ccc;
}

.log-actions {
  margin-left: auto;
}

.log-area {
  flex: 1;
  padding: 12px;
  overflow-y: auto;
  font-family: var(--el-font-family-mono);
  font-size: 12px;
  line-height: 1.5;
}

.empty-log {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #666;
  font-style: italic;
}

.log-entry {
  margin-bottom: 4px;
  display: flex;
  gap: 8px;
}

.log-time {
  color: #666;
  min-width: 80px;
}

.log-type-tag {
  min-width: 70px;
}

.info .log-type-tag {
  color: #409eff;
}
.success .log-type-tag {
  color: #67c23a;
}
.warn .log-type-tag {
  color: #e6a23c;
}
.error .log-type-tag {
  color: #f56c6c;
}

.log-msg {
  color: #eee;
  word-break: break-all;
}

.success .log-msg {
  color: #a3da8d;
}
.error .log-msg {
  color: #fab6b6;
}

/* 滚动条优化 */
.log-area::-webkit-scrollbar {
  width: 6px;
}
.log-area::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}
.log-area::-webkit-scrollbar-thumb:hover {
  background-color: rgba(255, 255, 255, 0.2);
}
</style>
