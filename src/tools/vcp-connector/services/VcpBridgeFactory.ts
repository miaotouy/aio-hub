import { toolRegistryManager } from "@/services/registry";
import type { ToolRegistry, ToolRegistryFactory } from "@/services/types";
import { createModuleLogger } from "@/utils/logger";
import { VcpToolProxy } from "./VcpToolProxy";
import { useVcpDistributedStore } from "../stores/vcpDistributedStore";
import type { VcpBridgeManifest, VcpToolExecutionResult } from "../types/distributed";

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
    { resolve: (val: any) => void; reject: (err: any) => void; timeout: any }
  >();
  private currentManifests: VcpBridgeManifest[] = [];
  private isInitializing = false;

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
    if (this.currentManifests.length === 0) {
      // 如果没有清单，尝试拉取一次
      try {
        if (!this.isInitializing) {
          await this.refreshManifests();
        }
      } catch (error) {
        logger.error("Failed to fetch VCP manifests during createRegistries", error);
      }
    }

    const distStore = useVcpDistributedStore();
    const disabledIds = distStore.config.disabledBridgeToolIds || [];

    return this.currentManifests
      .filter((m) => !disabledIds.includes(m.name)) // 过滤掉整个被禁用的工具
      .map((manifest) => new VcpToolProxy(manifest, this.executeRemote.bind(this), disabledIds));
  }

  /**
   * 向 VCP 请求最新的工具清单
   */
  public async refreshManifests(): Promise<void> {
    if (!this.sendJson) {
      throw new Error("WebSocket not connected, cannot fetch VCP manifests");
    }

    const distStore = useVcpDistributedStore();
    distStore.setBridgeStatus("fetching");

    this.isInitializing = true;
    logger.info("Requesting VCP tool manifests...");

    return new Promise((resolve, reject) => {
      const requestId = crypto.randomUUID();
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.isInitializing = false;
        reject(new Error("Timeout waiting for VCP tool manifests"));
      }, 10000);

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
        data: { requestId },
      });
    });
  }

  /**
   * 处理从 VCP 返回的清单响应
   */
  public handleManifestsResponse(requestId: string, manifests: VcpBridgeManifest[]) {
    const pending = this.pendingRequests.get(requestId);

    // 更新 Store 状态
    const distStore = useVcpDistributedStore();
    distStore.setBridgeManifests(manifests);
    distStore.setBridgeStatus("ready");

    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);
      pending.resolve(manifests);
      logger.info(`Received ${manifests.length} tool manifests from VCP`);
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

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

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
  public handleToolResult(requestId: string, response: VcpToolExecutionResult) {
    const pending = this.pendingRequests.get(requestId);
    if (pending) {
      clearTimeout(pending.timeout);
      this.pendingRequests.delete(requestId);

      if (response.status === "success") {
        pending.resolve(response.result);
      } else {
        pending.reject(new Error(response.error || "Unknown VCP tool error"));
      }
    }
  }

  /**
   * 触发重新加载和注册
   */
  public async refresh(): Promise<void> {
    logger.info("Refreshing VCP bridged tools...");
    await this.refreshManifests();

    // 注销旧的工厂实例产生的工具
    await toolRegistryManager.unregisterFactory(this.factoryId);
    // 重新注册自己，触发 createRegistries
    await toolRegistryManager.register(this);
  }

  /**
   * 清理资源
   */
  public async teardown(): Promise<void> {
    logger.info("Tearing down VCP bridge factory...");

    // 拒绝所有挂起的请求
    for (const [_id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error("VCP connection closed"));
    }
    this.pendingRequests.clear();

    // 注销所有代理工具
    await toolRegistryManager.unregisterFactory(this.factoryId);
    this.currentManifests = [];
  }
}

// 导出单例，方便在 protocol 和 store 中引用
export const vcpBridgeFactory = new VcpBridgeFactory();
