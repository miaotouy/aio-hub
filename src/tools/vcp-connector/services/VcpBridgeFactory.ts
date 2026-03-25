import { toolRegistryManager } from "@/services/registry";
import type { ToolRegistry, ToolRegistryFactory } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { VcpToolProxy } from "./VcpToolProxy";
import { useVcpDistributedStore } from "../stores/vcpDistributedStore";
import type { VcpBridgeManifest, VcpToolExecutionResult, VcpToolStatusData } from "../types/distributed";
import { taskManager } from "../../tool-calling/core/async-task/task-manager";

const logger = createModuleLogger("vcp-connector/bridge-factory");

/**
 * VCP 工具桥接工厂
 * 动态将 VCP 侧的插件转换为 AIO 内部的工具实例
 */
export class VcpBridgeFactory implements ToolRegistryFactory {
  public readonly factoryId = "vcp-bridge";

  private sendJson: ((data: any) => void) | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (val: any) => void;
      reject: (err: any) => void;
      timeout: any;
      toolName?: string;
      command?: string;
      args?: Record<string, any>;
    }
  >();
  private vcpToAioTaskMap = new Map<string, string>(); // vcpTaskId -> aioTaskId
  private currentManifests: VcpBridgeManifest[] = [];
  private isInitializing = false;
  private isRefreshing = false;

  /**
   * 设置 WebSocket 发送函数
   */
  public setSendFunction(fn: (data: any) => void) {
    this.sendJson = fn;
    logger.debug("WebSocket send function updated for VcpBridgeFactory");
  }

  /**
   * 实现 ToolRegistryFactory 接口
   */
  public async createRegistries(): Promise<ToolRegistry[]> {
    const distStore = useVcpDistributedStore();

    // 如果桥接功能已关闭，直接返回空
    if (!distStore.config.enableBridge) {
      logger.debug("Bridge feature is disabled, skipping registry creation");
      return [];
    }

    if (this.currentManifests.length === 0) {
      // 如果没有清单且已连接，尝试拉取一次
      if (this.sendJson && !this.isInitializing) {
        try {
          // 此处使用 refreshManifests 可能抛错，我们捕获它并静默处理
          // 因为在应用启动阶段，WS 可能尚未连接，这是正常的
          await this.refreshManifests();
        } catch (error) {
          logger.debug("Silent failure: Could not fetch VCP manifests during early registration", error);
        }
      }
    }

    const disabledIds = distStore.config.disabledBridgeToolIds || [];

    const registries = this.currentManifests
      .filter((m) => !disabledIds.includes(m.name)) // 过滤掉整个被禁用的工具
      .map((manifest) => new VcpToolProxy(manifest, this.executeRemote.bind(this), disabledIds));

    logger.info(`Factory created ${registries.length} tool registries from ${this.currentManifests.length} manifests`);
    return registries;
  }

  /**
   * 向 VCP 请求最新的工具清单
   */
  public async refreshManifests(): Promise<void> {
    const distStore = useVcpDistributedStore();

    // 如果桥接功能已关闭，拒绝请求
    if (!distStore.config.enableBridge) {
      logger.warn("Bridge feature is disabled, cannot refresh manifests");
      return;
    }

    if (!this.sendJson) {
      throw new Error("WebSocket not connected, cannot fetch VCP manifests");
    }

    distStore.setBridgeStatus("fetching");

    this.isInitializing = true;
    logger.info("Requesting VCP tool manifests...");

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          this.isInitializing = false;
          // 超时不再抛出 Error 而是 resolve 空清单，避免上层逻辑崩溃
          // 并在日志中记录警告
          // 清单请求通常很快，如果超时说明对方没准备好，我们 resolve 当前已有的清单
          logger.warn(`Timeout waiting for VCP tool manifests (Req: ${requestId}), using current cache`);
          resolve();
        }
      }, 3000); // 缩短超时时间到 3s，清单请求不应阻塞太久

      this.pendingRequests.set(requestId, {
        resolve: (manifests: VcpBridgeManifest[]) => {
          this.currentManifests = manifests;
          this.isInitializing = false;
          resolve();
        },
        reject: (err) => {
          this.isInitializing = false;
          reject(err);
        },
        timeout,
      });

      this.sendJson!({
        type: "get_vcp_manifests",
        data: {
          requestId,
          // 增加一些元数据，帮助 VCP 识别请求来源
          client: "aio-hub",
          version: "1.0.0",
          // 告知 VCP 我们支持 configSchema
          features: ["configSchema"],
        },
      });
    });
  }

  /**
   * 处理从 VCP 返回的清单响应
   */
  public handleManifestsResponse(requestId: string, manifests: VcpBridgeManifest[]) {
    const pending = this.pendingRequests.get(requestId);

    // 同步更新本地缓存，确保 createRegistries 能拿到最新数据
    this.currentManifests = manifests;

    // 更新 Store 状态
    const distStore = useVcpDistributedStore();
    distStore.setBridgeManifests(manifests);
    distStore.setBridgeStatus("ready");

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(manifests);
      logger.info(`Received ${manifests.length} tool manifests from VCP (Request ID: ${requestId})`);
    } else {
      // 可能是超时后才返回的数据，或者主动推送的数据
      logger.info(`Received ${manifests.length} tool manifests from VCP (Async/Late update)`);

      // 如果没有挂起的请求，说明可能是超时了，此时我们需要手动触发一次注册表刷新
      // 否则虽然数据到了，但工具并没有被注册到系统中
      this.refreshRegistriesOnly();
    }
  }

  /**
   * 仅刷新注册表，不重新请求清单
   */
  private async refreshRegistriesOnly(): Promise<void> {
    if (this.isRefreshing) return;
    this.isRefreshing = true;

    try {
      if (toolRegistryManager.hasFactory(this.factoryId)) {
        await toolRegistryManager.unregisterFactory(this.factoryId);
      }
      await toolRegistryManager.register(this);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 转发工具执行请求到 VCP
   */
  private async executeRemote(toolName: string, command: string, args: Record<string, any>): Promise<any> {
    if (!this.sendJson) {
      throw new Error("VCP connection lost, cannot execute remote tool");
    }

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`VCP tool execution timeout: ${toolName}.${command}`));
      }, 30000);

      this.pendingRequests.set(requestId, { resolve, reject, timeout, toolName, command, args });

      this.sendJson!({
        type: "execute_vcp_tool",
        data: {
          requestId,
          toolName,
          toolArgs: {
            ...args,
            command, // 兼容 VCP 协议，将 command 放入 toolArgs
          },
        },
      });
    });
  }

  /**
   * 处理从 VCP 返回的执行结果
   */
  public async handleToolResult(requestId: string, response: VcpToolExecutionResult) {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      // 如果 VCP 返回了 taskId，说明这是一个异步任务启动成功
      if (response.status === "success" && response.result && response.result.taskId) {
        const vcpTaskId = response.result.taskId;
        const aioTaskId = `vcp_${vcpTaskId}`;

        logger.info(`VCP task started: ${vcpTaskId}, registering as AIO task: ${aioTaskId}`);

        // 在 AIO 侧登记外部任务
        await taskManager.submitExternalTask({
          taskId: aioTaskId,
          requestId,
          toolId: `vcp:${pending.toolName || "unknown"}`,
          methodName: pending.command || "unknown",
          toolName: `[VCP] ${pending.toolName || "unknown"}.${pending.command || "unknown"}`,
          args: pending.args || {},
          cancellable: false, // VCP 侧任务暂时不支持从 AIO 取消
        });

        // 建立映射
        this.vcpToAioTaskMap.set(vcpTaskId, aioTaskId);

        // 注意：这里我们 resolve 了结果（包含 taskId），让原始 Promise 结束
        // AIO 侧的 UI 会根据 taskId 自动进入异步监控模式
        pending.resolve(response.result);

        // 此时不要清理 pendingRequests，因为后面可能还有 vcp_tool_status 或最终结果？
        // 不对，VCP 协议中，vcp_tool_result 是最终结果。
        // 如果返回了 taskId，这个 vcp_tool_result 只是“启动成功”的回执。
        // 真正的结果会通过另一个 vcp_tool_result (requestId 为 taskId) 传回。
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(requestId);
        return;
      }

      // 如果 requestId 对应的是一个 vcpTaskId，说明这是异步任务的最终完成回调
      const aioTaskId = this.vcpToAioTaskMap.get(requestId);
      if (aioTaskId) {
        if (response.status === "success") {
          await taskManager.completeExternalTask(aioTaskId, response.result);
        } else {
          await taskManager.failExternalTask(aioTaskId, response.error || "VCP task failed");
        }
        this.vcpToAioTaskMap.delete(requestId);
      }

      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);

      if (response.status === "success") {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error || "Unknown VCP tool error"));
      }
    } else {
      // 如果没有 pending 请求，但 requestId 在 vcpToAioTaskMap 中，说明是异步任务的最终结果
      const aioTaskId = this.vcpToAioTaskMap.get(requestId);
      if (aioTaskId) {
        logger.info(`Received final result for VCP task: ${requestId}`);
        if (response.status === "success") {
          await taskManager.completeExternalTask(aioTaskId, response.result);
        } else {
          await taskManager.failExternalTask(aioTaskId, response.error || "VCP task failed");
        }
        this.vcpToAioTaskMap.delete(requestId);
      }
    }
  }

  /**
   * 处理从 VCP 返回的执行进度
   */
  public handleToolStatus(data: VcpToolStatusData) {
    const vcpTaskId = data.job_id || data.taskId;
    if (!vcpTaskId) return;

    const aioTaskId = this.vcpToAioTaskMap.get(vcpTaskId);
    if (!aioTaskId) {
      // 如果没找到映射，可能是 AIO 重启后丢失了内存映射，尝试猜测
      // 或者干脆不处理
      return;
    }

    if (data.bridgeType === "log" || data.bridgeType === "info") {
      const message = data.content || data.message || "";
      const progress = typeof data.progress === "number" ? data.progress : undefined;

      taskManager.reportExternalProgress(aioTaskId, progress ?? 0, message);
    }

    // 如果状态指示已完成或失败
    if (data.status === "completed" || data.status === "success") {
      // 理论上应该等 vcp_tool_result，但如果 status 明确了也可以更新
      taskManager.reportExternalProgress(aioTaskId, 100, data.content || "任务完成");
    } else if (data.status === "error" || data.status === "failed") {
      taskManager.failExternalTask(aioTaskId, data.content || "VCP 侧执行失败");
    }
  }

  /**
   * 触发重新加载和注册
   */
  public async refresh(): Promise<void> {
    if (this.isInitializing || this.isRefreshing) {
      logger.debug("Bridge factory is already busy, skipping refresh");
      return;
    }

    this.isRefreshing = true;
    logger.info("Refreshing VCP bridged tools...");

    try {
      try {
        await this.refreshManifests();
      } catch (error) {
        logger.warn("Failed to fetch manifests during refresh", error);
        // 即使拉取失败，也要继续，可能会清空旧工具
      }

      // 只有在已注册的情况下才注销，避免初次加载时的警告
      if (toolRegistryManager.hasFactory(this.factoryId)) {
        await toolRegistryManager.unregisterFactory(this.factoryId);
      }

      // 重新注册自己，触发 createRegistries
      await toolRegistryManager.register(this);
    } finally {
      this.isRefreshing = false;
    }
  }

  /**
   * 清理资源
   */
  public async teardown(): Promise<void> {
    logger.info("Tearing down VCP bridge factory...");

    // 拒绝所有挂起的请求
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      // 只有清单请求需要静默处理，工具执行请求还是需要报错
      pending.resolve([]); // 或者 reject 一个特定的静默错误
    }
    this.pendingRequests.clear();

    // 注销所有代理工具
    if (toolRegistryManager.hasFactory(this.factoryId)) {
      await toolRegistryManager.unregisterFactory(this.factoryId);
    }
    this.currentManifests = [];
  }
}

// 导出单例，方便在 protocol 和 store 中引用
export const vcpBridgeFactory = new VcpBridgeFactory();
