<script setup lang="ts">
import { ref, onMounted, watch } from "vue";
import { InfoFilled, FolderOpened, Delete } from "@element-plus/icons-vue";
import { ElMessageBox, ElButton } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { logger, LogLevel } from "@/utils/logger";
import { formatDateTime } from "@/utils/time";
import { invoke } from "@tauri-apps/api/core";
import { join } from "@tauri-apps/api/path";
import { getAppConfigDir } from "@/utils/appPath";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const errorHandler = createModuleErrorHandler("LogSettings");

// 日志级别选项
const logLevelOptions = [
  { label: "DEBUG (调试)", value: "DEBUG" },
  { label: "INFO (信息)", value: "INFO" },
  { label: "WARN (警告)", value: "WARN" },
  { label: "ERROR (错误)", value: "ERROR" },
];

// 日志缓冲区大小选项
const bufferSizeOptions = [
  { label: "500 条", value: 500 },
  { label: "1000 条", value: 1000 },
  { label: "2000 条", value: 2000 },
  { label: "5000 条", value: 5000 },
  { label: "1 万条", value: 10000 },
  { label: "5 万条", value: 50000 },
];

// 单个日志文件大小选项
const maxFileSizeOptions = [
  { label: "1 MB", value: 1024 * 1024 },
  { label: "2 MB", value: 2 * 1024 * 1024 },
  { label: "5 MB", value: 5 * 1024 * 1024 },
  { label: "10 MB", value: 10 * 1024 * 1024 },
  { label: "20 MB", value: 20 * 1024 * 1024 },
];

// 组件属性
const props = defineProps<{
  logLevel?: "DEBUG" | "INFO" | "WARN" | "ERROR";
  logToFile?: boolean;
  logToConsole?: boolean;
  logBufferSize?: number;
  maxFileSize?: number;
}>();

// 事件
const emit = defineEmits<{
  "update:logLevel": [value: "DEBUG" | "INFO" | "WARN" | "ERROR"];
  "update:logToFile": [value: boolean];
  "update:logToConsole": [value: boolean];
  "update:logBufferSize": [value: number];
  "update:maxFileSize": [value: number];
}>();

// 内部状态
const internalLogLevel = ref<"DEBUG" | "INFO" | "WARN" | "ERROR">("INFO");
const internalLogToFile = ref<boolean>(true);
const internalLogToConsole = ref<boolean>(true);
const internalLogBufferSize = ref<number>(1000);
const internalMaxFileSize = ref<number>(2 * 1024 * 1024);

// 日志统计信息
const logStats = ref({
  totalLogs: 0,
  debugLogs: 0,
  infoLogs: 0,
  warnLogs: 0,
  errorLogs: 0,
});

// 日志文件路径
const logFilePath = ref<string>("");

// 初始化
onMounted(async () => {
  // 从 props 更新内部状态
  if (props.logLevel) internalLogLevel.value = props.logLevel;
  if (props.logToFile !== undefined) internalLogToFile.value = props.logToFile;
  if (props.logToConsole !== undefined) internalLogToConsole.value = props.logToConsole;
  if (props.logBufferSize) internalLogBufferSize.value = props.logBufferSize;
  if (props.maxFileSize) internalMaxFileSize.value = props.maxFileSize;

  // 立即应用当前的日志级别设置（确保界面状态和实际运行状态一致）
  logger.setLevel(LogLevel[internalLogLevel.value as keyof typeof LogLevel]);
  logger.setLogToFile(internalLogToFile.value);
  logger.setLogToConsole(internalLogToConsole.value);
  logger.setLogBufferSize(internalLogBufferSize.value);
  logger.setMaxFileSize(internalMaxFileSize.value);

  // 获取日志统计信息
  updateLogStats();

  // 获取日志文件路径
  try {
    const appDir = await getAppConfigDir();
    const logsDir = await join(appDir, "logs");
    const date = formatDateTime(new Date(), 'yyyy-MM-dd');
    logFilePath.value = await join(logsDir, `app-${date}.log`);
  } catch (error) {
    errorHandler.handle(error as Error, { userMessage: "获取日志文件路径失败", showToUser: false });
  }
});

// 监听 props 变化
watch(
  () => props.logLevel,
  (newValue) => {
    if (newValue) internalLogLevel.value = newValue;
  }
);

watch(
  () => props.logToFile,
  (newValue) => {
    if (newValue !== undefined) internalLogToFile.value = newValue;
  }
);

watch(
  () => props.logToConsole,
  (newValue) => {
    if (newValue !== undefined) internalLogToConsole.value = newValue;
  }
);

watch(
  () => props.logBufferSize,
  (newValue) => {
    if (newValue) internalLogBufferSize.value = newValue;
  }
);

watch(
  () => props.maxFileSize,
  (newValue) => {
    if (newValue) internalMaxFileSize.value = newValue;
  }
);

// 更新日志统计信息
const updateLogStats = () => {
  const logs = logger.getLogBuffer();
  logStats.value = {
    totalLogs: logs.length,
    debugLogs: logs.filter((log) => log.level === LogLevel.DEBUG).length,
    infoLogs: logs.filter((log) => log.level === LogLevel.INFO).length,
    warnLogs: logs.filter((log) => log.level === LogLevel.WARN).length,
    errorLogs: logs.filter((log) => log.level === LogLevel.ERROR).length,
  };
};

// 打开日志目录
const handleOpenLogDir = async () => {
  try {
    const appDir = await getAppConfigDir();
    const logsDir = await join(appDir, "logs");
    // 使用 Rust 后端命令强制打开路径，绕过前端 Scope 限制
    await invoke("open_path_force", { path: logsDir });
    customMessage.success("日志目录已打开");
  } catch (error) {
    errorHandler.error(error as Error, "打开日志目录失败");
  }
};

// 清空日志缓冲区
const handleClearLogBuffer = async () => {
  try {
    await ElMessageBox.confirm(
      "确定要清空内存中的日志缓冲区吗？这不会删除已保存的日志文件。",
      "清空日志缓冲区",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );

    logger.clearBuffer();
    updateLogStats();
    customMessage.success("日志缓冲区已清空");
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error as Error, "清空日志缓冲区失败");
    }
  }
};

// 导出日志
const handleExportLogs = async () => {
  try {
    const { save } = await import("@tauri-apps/plugin-dialog");
    const filePath = await save({
      title: "导出日志",
      defaultPath: `logs-${formatDateTime(new Date(), 'yyyy-MM-dd')}.txt`,
      filters: [
        {
          name: "文本文件",
          extensions: ["txt"],
        },
      ],
    });

    if (filePath) {
      await logger.exportLogs(filePath as string);
      customMessage.success("日志导出成功");
    }
  } catch (error) {
    errorHandler.error(error as Error, "导出日志失败");
  }
};

// 测试日志功能
const handleTestLogs = () => {
  const testLogger = createModuleLogger("LogTest");
  testLogger.debug("这是一条测试调试日志");
  testLogger.info("这是一条测试信息日志");
  testLogger.warn("这是一条测试警告日志");
  testLogger.error("这是一条测试错误日志", new Error("测试错误"));

  // 更新统计信息
  setTimeout(updateLogStats, 100);
  customMessage.success("测试日志已生成");
};

// 监听内部状态变化，发出事件
watch(internalLogLevel, (newValue) => {
  emit("update:logLevel", newValue);
  // 更新日志级别
  logger.setLevel(LogLevel[newValue as keyof typeof LogLevel]);
});

watch(internalLogToFile, (newValue) => {
  emit("update:logToFile", newValue);
  // 更新文件日志设置
  logger.setLogToFile(newValue);
});

watch(internalLogToConsole, (newValue) => {
  emit("update:logToConsole", newValue);
  // 更新控制台日志设置
  logger.setLogToConsole(newValue);
});

watch(internalLogBufferSize, (newValue) => {
  emit("update:logBufferSize", newValue);
  // 更新日志缓冲区大小
  logger.setLogBufferSize(newValue);
});

watch(internalMaxFileSize, (newValue) => {
  emit("update:maxFileSize", newValue);
  // 更新日志文件大小限制
  logger.setMaxFileSize(newValue);
});
</script>

<template>
  <div class="log-settings">
    <!-- 日志级别设置 -->
    <div class="setting-item">
      <div class="setting-label">
        <span>日志级别</span>
        <el-tooltip content="设置记录的最低日志级别，低于此级别的日志将被忽略" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-select v-model="internalLogLevel" style="width: 200px">
        <el-option
          v-for="option in logLevelOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>

    <!-- 日志输出设置 -->
    <div class="setting-item">
      <div class="setting-label">
        <span>文件日志</span>
        <el-tooltip content="将日志保存到本地文件" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-switch v-model="internalLogToFile" />
    </div>

    <div class="setting-item">
      <div class="setting-label">
        <span>控制台日志</span>
        <el-tooltip content="在浏览器控制台显示日志" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-switch v-model="internalLogToConsole" />
    </div>

    <!-- 日志缓冲区大小 -->
    <div class="setting-item">
      <div class="setting-label">
        <span>日志缓冲区大小</span>
        <el-tooltip content="内存中保存的日志条数，超过后将删除最早的日志" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-select v-model="internalLogBufferSize" style="width: 150px">
        <el-option
          v-for="option in bufferSizeOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>

    <!-- 单个日志文件大小限制 -->
    <div class="setting-item">
      <div class="setting-label">
        <span>文件分割阈值</span>
        <el-tooltip content="当单个日志文件超过此大小时，将自动分割并创建新文件" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <el-select v-model="internalMaxFileSize" style="width: 150px">
        <el-option
          v-for="option in maxFileSizeOptions"
          :key="option.value"
          :label="option.label"
          :value="option.value"
        />
      </el-select>
    </div>

    <el-divider />

    <!-- 日志统计信息 -->
    <div class="log-stats">
      <h3 class="stats-title">日志统计</h3>
      <div class="stats-grid">
        <div class="stat-item total">
          <div class="stat-value">{{ logStats.totalLogs }}</div>
          <div class="stat-label">总计</div>
        </div>
        <div class="stat-item debug">
          <div class="stat-value">{{ logStats.debugLogs }}</div>
          <div class="stat-label">DEBUG</div>
        </div>
        <div class="stat-item info">
          <div class="stat-value">{{ logStats.infoLogs }}</div>
          <div class="stat-label">INFO</div>
        </div>
        <div class="stat-item warn">
          <div class="stat-value">{{ logStats.warnLogs }}</div>
          <div class="stat-label">WARN</div>
        </div>
        <div class="stat-item error">
          <div class="stat-value">{{ logStats.errorLogs }}</div>
          <div class="stat-label">ERROR</div>
        </div>
      </div>
    </div>

    <el-divider />

    <!-- 日志操作 -->
    <div class="log-actions">
      <h3 class="actions-title">日志操作</h3>
      <div class="action-buttons">
        <el-button @click="handleOpenLogDir" :icon="FolderOpened" size="small">
          打开日志目录
        </el-button>
        <el-button @click="handleExportLogs" size="small"> 导出日志 </el-button>
        <el-button @click="handleClearLogBuffer" :icon="Delete" size="small" type="warning">
          清空缓冲区
        </el-button>
        <el-button @click="handleTestLogs" size="small" type="primary"> 测试日志 </el-button>
      </div>
    </div>

    <!-- 日志文件路径 -->
    <div v-if="logFilePath" class="log-file-path">
      <div class="setting-label">
        <span>当前日志文件</span>
        <el-tooltip content="当前日志文件的保存路径" placement="top">
          <el-icon class="info-icon">
            <InfoFilled />
          </el-icon>
        </el-tooltip>
      </div>
      <div class="file-path">{{ logFilePath }}</div>
    </div>
  </div>
</template>

<style scoped>
.log-settings {
  padding: 0;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  margin-bottom: 8px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.setting-item:not(:last-child) {
  border-bottom: 1px solid var(--border-color);
}

.setting-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  color: var(--text-color);
}

.info-icon {
  color: var(--text-color-secondary);
  cursor: help;
}

.log-stats {
  margin: 20px 0;
}

.stats-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 16px 0;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 16px;
}

.stat-item {
  text-align: center;
  padding: 12px;
  border-radius: 8px;
  background: var(--bg-color-page);
  border: 1px solid var(--border-color);
  backdrop-filter: blur(var(--ui-blur));
  border-left: 4px solid var(--border-color);
}

.stat-item.total {
  border-left-color: var(--el-color-primary);
}

.stat-item.debug {
  border-left-color: var(--el-color-info);
}

.stat-item.info {
  border-left-color: var(--el-color-success);
}

.stat-item.warn {
  border-left-color: var(--el-color-warning);
}

.stat-item.error {
  border-left-color: var(--el-color-danger);
}

.stat-value {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
  margin-bottom: 4px;
}

.stat-label {
  font-size: 12px;
  color: var(--text-color-secondary);
  text-transform: uppercase;
}

.log-actions {
  margin: 20px 0;
  padding: 8px;
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.actions-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 16px 0;
}

.action-buttons {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.log-file-path {
  margin-top: 20px;
  padding: 12px;
  background: var(--bg-color-page);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  backdrop-filter: blur(var(--ui-blur));
}

.file-path {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-color-secondary);
  word-break: break-all;
  margin-top: 8px;
}
</style>
