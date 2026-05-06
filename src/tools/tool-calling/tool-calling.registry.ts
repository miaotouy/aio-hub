import { markRaw } from "vue";
import type { ToolConfig, ToolRegistry, ServiceMetadata, ToolContext } from "@/services/types";
import { Wrench } from "lucide-vue-next";
import { taskManager } from "./core/async-task";
import { createModuleLogger } from "@/utils/logger";
import { useToolCallingStore } from "@/tools/llm-chat/stores/toolCallingStore";
import { useAsyncTaskStore } from "./stores/asyncTaskStore";
import { executeToolRequests as internalExecuteToolRequests } from "./core/executor";

// actions 层 — 仅存放复杂业务逻辑或耗时测试任务
import * as actions from "./actions";

const logger = createModuleLogger("tool-calling/registry");

export const toolConfig: ToolConfig = {
  name: "工具调用测试",
  icon: markRaw(Wrench),
  path: "/tool-calling-tester",
  component: () => import("./ToolCallingTester.vue"),
  description: "内部工具调用系统的调试与验证矩阵",
  category: ["开发工具"],
};

export class ToolCallingRegistry implements ToolRegistry {
  readonly id = "tool-calling";
  readonly name = "工具调用";
  readonly description = "工具调用系统与异步任务管理";
  readonly runMode = "main-only";

  async initialize(): Promise<void> {
    await taskManager.waitForInitialization();
    logger.info("工具调用系统已初始化");
  }

  getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "getTaskStatus",
          displayName: "查询任务状态",
          description: "查询异步任务的执行状态和结果",
          parameters: [
            {
              name: "taskId",
              type: "string",
              description: "任务 ID",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "cancelTask",
          displayName: "取消任务",
          description: "取消正在执行或等待中的异步任务",
          parameters: [
            {
              name: "taskId",
              type: "string",
              description: "任务 ID",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "retryTask",
          displayName: "重试任务",
          description: "重新执行失败或中断的异步任务",
          parameters: [
            {
              name: "taskId",
              type: "string",
              description: "任务 ID",
              required: true,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
        {
          name: "testAsyncTask",
          displayName: "测试异步任务",
          description: "用于测试异步任务系统的示例方法，会模拟一个耗时操作。duration 默认 5 秒，shouldFail 默认 false",
          parameters: [
            {
              name: "duration",
              type: "number",
              description: "任务持续时间（秒），默认 5",
              required: false,
            },
            {
              name: "shouldFail",
              type: "boolean",
              description: "是否模拟失败，默认 false 为成功，true 则抛出错误",
              required: false,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
          executionMode: "async",
          asyncConfig: {
            hasProgress: true,
            cancellable: true,
            estimatedDuration: 5,
          },
        },
        {
          name: "testSyncTask",
          displayName: "测试同步耗时任务",
          description:
            "用于测试同步调用的超时机制的示例方法，会模拟一个 CPU 密集型耗时操作。duration 默认 5 秒，shouldFail 默认 false",
          parameters: [
            {
              name: "duration",
              type: "number",
              description: "任务持续时间（秒），默认 5",
              required: false,
            },
            {
              name: "shouldFail",
              type: "boolean",
              description: "是否模拟失败，默认 false 为成功，true 则抛出错误",
              required: false,
            },
          ],
          returnType: "Promise<string>",
          agentCallable: true,
        },
      ],
    };
  }

  // ==================== 以下方法全部委托至 actions 层 ====================

  getTaskStatus(args: { taskId: string }): Promise<string> {
    return actions.getTaskStatus(args);
  }

  cancelTask(args: { taskId: string }): Promise<string> {
    return actions.cancelTask(args);
  }

  retryTask(args: { taskId: string }): Promise<string> {
    return actions.retryTask(args);
  }

  testAsyncTask(args: { duration?: number; shouldFail?: boolean }, context?: ToolContext): Promise<string> {
    return actions.testAsyncTask(args, context);
  }

  testSyncTask(args: { duration?: number; shouldFail?: boolean }, context?: ToolContext): Promise<string> {
    return actions.testSyncTask(args, context);
  }

  // ==================== 审批（供跨窗口转发使用） ====================

  approveRequest(params: { requestId: string }): void {
    useToolCallingStore().approveRequest(params.requestId);
  }

  rejectRequest(params: { requestId: string }): void {
    useToolCallingStore().rejectRequest(params.requestId);
  }

  approveAll(params: { sessionId: string }): void {
    useToolCallingStore().approveAll(params.sessionId);
  }

  rejectAll(params: { sessionId: string }): void {
    useToolCallingStore().rejectAll(params.sessionId);
  }

  silentApproveRequest(params: { requestId: string }): void {
    useToolCallingStore().silentApproveRequest(params.requestId);
  }

  silentCancelRequest(params: { requestId: string }): void {
    useToolCallingStore().silentCancelRequest(params.requestId);
  }

  silentApproveAll(params: { sessionId: string }): void {
    useToolCallingStore().silentApproveAll(params.sessionId);
  }

  silentCancelAll(params: { sessionId: string }): void {
    useToolCallingStore().silentCancelAll(params.sessionId);
  }

  // ==================== 任务管理（供跨窗口转发使用） ====================

  async deleteTasks(params: { taskIds: string[] }): Promise<number> {
    return useAsyncTaskStore().deleteTasks(params.taskIds);
  }

  async deleteTask(params: { taskId: string }): Promise<boolean> {
    return useAsyncTaskStore().deleteTask(params.taskId);
  }

  async executeToolRequests(params: { requests: any[]; options?: any }): Promise<any[]> {
    return internalExecuteToolRequests(params.requests, params.options);
  }
}

export default ToolCallingRegistry;
