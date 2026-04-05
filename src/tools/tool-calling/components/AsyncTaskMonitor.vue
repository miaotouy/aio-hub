<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { useAsyncTaskStore } from "../stores/asyncTaskStore";
import { ElMessageBox } from "element-plus";
import { execute } from "@/services/executor";
import TaskToolbar from "./TaskToolbar.vue";
import TaskTable from "./TaskTable.vue";
import TaskDetailDialog from "./TaskDetailDialog.vue";
import type { AsyncTaskMetadata, TaskStatus } from "../core/async-task/types";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { customMessage } from "@/utils/customMessage";

const logger = createModuleLogger("tool-calling/async-task-monitor");
const errorHandler = createModuleErrorHandler("tool-calling/async-task-monitor");

const asyncTaskStore = useAsyncTaskStore();

// 状态
const loading = ref(false);
const selectedStatus = ref<TaskStatus | "all">("all");
const searchKeyword = ref("");
const detailDialogVisible = ref(false);
const selectedTask = ref<AsyncTaskMetadata | null>(null);

// 计算属性
const filteredTasks = computed(() => {
  let tasks = asyncTaskStore.taskList;

  // 按状态筛选
  if (selectedStatus.value !== "all") {
    tasks = tasks.filter((t) => t.status === selectedStatus.value);
  }

  // 按关键词搜索
  if (searchKeyword.value.trim()) {
    const keyword = searchKeyword.value.toLowerCase();
    tasks = tasks.filter((t) => t.taskId.toLowerCase().includes(keyword) || t.toolName.toLowerCase().includes(keyword));
  }

  return tasks;
});

const totalCount = computed(() => asyncTaskStore.taskList.length);
const activeCount = computed(() => asyncTaskStore.activeTaskCount);
const completedCount = computed(() => asyncTaskStore.completedTasks.length);
const failedCount = computed(() => asyncTaskStore.failedTasks.length);

// 方法
async function handleRefresh() {
  // 现在的 Store 是实时同步的，刷新只需确保初始化即可
  loading.value = true;
  try {
    if (!asyncTaskStore.isInitialized) {
      await asyncTaskStore.initialize();
    }
    logger.info("任务监控器已就绪（实时同步中）");
  } catch (error) {
    errorHandler.error(error, "初始化失败");
  } finally {
    loading.value = false;
  }
}

function handleStatusChange(status: TaskStatus | "all") {
  selectedStatus.value = status;
  logger.debug("状态筛选已更改", { status });
}

function handleSearch(keyword: string) {
  searchKeyword.value = keyword;
  logger.debug("搜索关键词已更改", { keyword });
}

async function handleClearCompleted() {
  try {
    await ElMessageBox.confirm(`确定要清理 ${completedCount.value} 个已完成的任务吗？`, "确认清理", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });

    const taskIds = asyncTaskStore.completedTasks.map((t) => t.taskId);
    const result = await execute({ service: "tool-calling", method: "deleteTasks", params: { taskIds } });
    if (result.success) {
      customMessage.success(`已清理 ${result.data} 个已完成任务`);
      logger.info("已清理已完成任务", { count: result.data });
    }
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error, "清理已完成任务失败");
    }
  }
}

async function handleClearFailed() {
  try {
    await ElMessageBox.confirm(`确定要清理 ${failedCount.value} 个失败的任务吗？`, "确认清理", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });

    const taskIds = asyncTaskStore.failedTasks.map((t) => t.taskId);
    const result = await execute({ service: "tool-calling", method: "deleteTasks", params: { taskIds } });
    if (result.success) {
      customMessage.success(`已清理 ${result.data} 个失败任务`);
      logger.info("已清理失败任务", { count: result.data });
    }
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error, "清理失败任务失败");
    }
  }
}

async function handleClearAll() {
  try {
    await ElMessageBox.confirm(`确定要清理全部 ${totalCount.value} 个任务吗？此操作不可恢复！`, "确认清理", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });

    const taskIds = asyncTaskStore.taskList.map((t) => t.taskId);
    const result = await execute({ service: "tool-calling", method: "deleteTasks", params: { taskIds } });
    if (result.success) {
      customMessage.success(`已清理 ${result.data} 个任务`);
      logger.info("已清理全部任务", { count: result.data });
    }
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error, "清理全部任务失败");
    }
  }
}

async function handleCancelTask(taskId: string) {
  try {
    await ElMessageBox.confirm("确定要取消这个任务吗？", "确认取消", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });

    const result = await execute({ service: "tool-calling", method: "cancelTask", params: { taskId } });
    if (result.success) {
      customMessage.success("任务已取消");
      logger.info("任务已取消", { taskId });
    } else {
      customMessage.warning("取消任务失败");
    }
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error, "取消任务失败");
    }
  }
}

async function handleRetryTask(taskId: string) {
  try {
    const result = await execute({ service: "tool-calling", method: "retryTask", params: { taskId } });
    if (result.success) {
      customMessage.success("任务已重新提交");
      logger.info("任务已重试", { originalTaskId: taskId });
    }
  } catch (error) {
    errorHandler.error(error, "重试任务失败");
  }
}

async function handleDeleteTask(taskId: string) {
  try {
    await ElMessageBox.confirm("确定要删除这个任务吗？", "确认删除", {
      type: "warning",
      confirmButtonText: "确定",
      cancelButtonText: "取消",
    });

    const result = await execute({ service: "tool-calling", method: "deleteTask", params: { taskId } });
    if (result.success && result.data) {
      customMessage.success("任务已删除");
      logger.info("任务已删除", { taskId });
    }
  } catch (error) {
    if (error !== "cancel") {
      errorHandler.error(error, "删除任务失败");
    }
  }
}

function handleViewDetail(task: AsyncTaskMetadata) {
  selectedTask.value = task;
  detailDialogVisible.value = true;
}

// 生命周期
onMounted(async () => {
  loading.value = true;
  try {
    // 初始化 Store，内部会启动订阅
    await asyncTaskStore.initialize();
    logger.info("任务监控器已初始化（实时同步已启动）");
  } catch (error) {
    errorHandler.error(error, "初始化任务监控器失败");
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div class="async-task-monitor">
    <!-- 工具栏 -->
    <TaskToolbar
      :total-count="totalCount"
      :active-count="activeCount"
      :completed-count="completedCount"
      :failed-count="failedCount"
      @refresh="handleRefresh"
      @clear-completed="handleClearCompleted"
      @clear-failed="handleClearFailed"
      @clear-all="handleClearAll"
      @status-change="handleStatusChange"
      @search="handleSearch"
    />

    <!-- 任务表格 -->
    <div class="table-container">
      <TaskTable
        :tasks="filteredTasks"
        :loading="loading"
        @cancel="handleCancelTask"
        @retry="handleRetryTask"
        @delete="handleDeleteTask"
        @view-detail="handleViewDetail"
      />
    </div>

    <!-- 任务详情对话框 -->
    <TaskDetailDialog
      v-model:visible="detailDialogVisible"
      :task="selectedTask"
      @cancel="handleCancelTask"
      @retry="handleRetryTask"
    />
  </div>
</template>

<style scoped>
.async-task-monitor {
  height: 100%;
  display: flex;
  flex-direction: column;
  background-color: var(--container-bg);
  border-radius: 8px;
  overflow: hidden;
}

.table-container {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>
