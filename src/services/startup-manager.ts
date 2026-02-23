import { ref, readonly } from "vue";
import { toolRegistryManager } from "./registry";
import { type StartupTaskState } from "@/utils/appSettings";
import { useAppSettingsStore } from "@/stores/appSettingsStore";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useNotification } from "@/composables/useNotification";
import type { ToolRegistry } from "./types";

const logger = createModuleLogger("services/startup-manager");
const errorHandler = createModuleErrorHandler("services/startup-manager");

/**
 * 启动项执行结果
 */
export interface StartupExecutionResult {
  toolId: string;
  label: string;
  success: boolean;
  duration: number; // 耗时 (ms)
  error?: string;
  autoDisabled?: boolean;
}

class StartupManager {
  private _results = ref<StartupExecutionResult[]>([]);
  /** 响应式只读结果列表，供 UI 层订阅 */
  readonly results = readonly(this._results);
  private isRunning = false;
  private readonly FAILURE_THRESHOLD = 3; // 连续失败 3 次触发熔断
  private readonly TIMEOUT_MS = 10000; // 10 秒超时

  /**
   * 运行所有已启用的启动项
   */
  async run(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;

    logger.info("开始执行启动项任务");
    const startTime = Date.now();

    try {
      const appSettingsStore = useAppSettingsStore();
      const settings = appSettingsStore.settings;
      const startupTasks = settings.startupTasks || {};
      const updatedTasks: Record<string, StartupTaskState> = { ...startupTasks };
      let hasChanges = false;

      // 获取所有注册的工具
      const tools = toolRegistryManager.getAllTools();
      const notify = useNotification();

      // 筛选出有启动配置的工具
      const toolsWithStartup = tools.filter((tool) => tool.startupConfig && tool.onStartup);

      const executionPromises = toolsWithStartup.map(async (tool: ToolRegistry) => {
        const toolId = tool.id;
        const config = tool.startupConfig!;

        // 获取或初始化任务状态
        let state = updatedTasks[toolId];
        if (!state) {
          state = {
            enabled: config.defaultEnabled ?? false,
            consecutiveFailures: 0,
          };
          updatedTasks[toolId] = state;
          hasChanges = true;
        }

        // 检查是否被自动禁用
        if (state.autoDisabled) {
          logger.info(`跳过自动禁用的启动项: ${config.label} (${toolId})`);
          this._results.value.push({
            toolId,
            label: config.label,
            success: false,
            duration: 0,
            error: "已自动禁用（熔断）",
          });
          return;
        }

        // 检查用户是否启用
        if (!state.enabled) {
          return;
        }

        // 准备执行
        const taskStartTime = Date.now();
        let timeoutId: ReturnType<typeof setTimeout> | undefined;
        try {
          logger.info(`正在执行启动项: ${config.label} (${toolId})`);

          // 使用 Promise.race 实现超时控制，并在完成后清理 timer
          await Promise.race([
            Promise.resolve(tool.onStartup!()),
            new Promise((_, reject) => {
              timeoutId = setTimeout(() => reject(new Error("启动超时")), this.TIMEOUT_MS);
            }),
          ]);

          const duration = Date.now() - taskStartTime;

          // 执行成功，重置失败计数
          if (state.consecutiveFailures > 0) {
            state.consecutiveFailures = 0;
            state.lastError = undefined;
            hasChanges = true;
          }

          this._results.value.push({
            toolId,
            label: config.label,
            success: true,
            duration,
          });

          logger.info(`启动项执行成功: ${config.label}`, { duration });
        } catch (error: any) {
          const duration = Date.now() - taskStartTime;
          const errorMessage = error?.message || String(error);

          // 执行失败，增加失败计数
          state.consecutiveFailures++;
          state.lastError = errorMessage;
          hasChanges = true;

          // 检查是否触发熔断
          if (state.consecutiveFailures >= this.FAILURE_THRESHOLD) {
            state.autoDisabled = true;
            state.enabled = false;

            notify.error(
              `启动项已禁用: ${config.label}`,
              `由于连续 ${state.consecutiveFailures} 次启动失败，该项已自动禁用以保护应用稳定性。错误: ${errorMessage}`,
              {
                source: "StartupManager",
                metadata: { path: "/settings" },
              }
            );

            logger.warn(`启动项触发熔断: ${config.label}`, {
              consecutiveFailures: state.consecutiveFailures,
              error: errorMessage,
            });
          }

          this._results.value.push({
            toolId,
            label: config.label,
            success: false,
            duration,
            error: errorMessage,
            autoDisabled: state.autoDisabled,
          });

          errorHandler.error(error, `启动项执行失败: ${config.label}`, { toolId, duration });
        } finally {
          // 无论成功/失败/超时，都清理超时 timer
          if (timeoutId !== undefined) clearTimeout(timeoutId);
        }
      });

      // 等待所有任务完成
      await Promise.allSettled(executionPromises);

      // 如果有状态变更，保存设置
      if (hasChanges) {
        appSettingsStore.update({ startupTasks: updatedTasks });
      }

      const totalDuration = Date.now() - startTime;
      logger.info("所有启动项任务执行完毕", {
        totalTasks: toolsWithStartup.length,
        executed: this._results.value.length,
        totalDuration,
      });
    } finally {
      // 确保无论如何都释放锁，防止异常导致永久锁死
      this.isRunning = false;
    }
  }

  /**
   * 获取启动项执行结果列表
   */
  getResults(): StartupExecutionResult[] {
    return [...this._results.value];
  }
}

export const startupManager = new StartupManager();
