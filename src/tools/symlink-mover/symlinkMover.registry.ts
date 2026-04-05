import type { ToolRegistry, ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import SymlinkMoverIcon from "@/components/icons/SymlinkMoverIcon.vue";
import { useSymlinkMoverLogic } from "./composables/useSymlinkMover";
import type { MoveAndLinkOptions, CreateLinksOnlyOptions } from "./types";

/**
 * 符号链接移动工具注册类
 *
 * 作为对外提供的服务接口，内部调用 useSymlinkMoverLogic 实现
 */
export default class SymlinkMoverRegistry implements ToolRegistry {
  public readonly id = "symlink-mover";
  public readonly runMode = "main-only";
  public readonly name = "符号链接移动工具";
  public readonly description = "将文件移动到目标目录并在原位置创建链接，或仅创建链接";

  private logic = useSymlinkMoverLogic();

  // ==================== 核心操作 ====================

  public async moveAndLink(options: MoveAndLinkOptions) {
    return this.logic.moveAndLink(options);
  }

  public async createLinksOnly(options: CreateLinksOnlyOptions) {
    return this.logic.createLinksOnly(options);
  }

  public async getLatestOperationSummary() {
    return this.logic.getLatestOperationSummary();
  }

  public async getOperationHistory(limit?: number) {
    return this.logic.getOperationHistory(limit);
  }

  // ==================== 元数据 ====================

  public getMetadata() {
    return {
      methods: [],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "符号链接搬家工具",
  path: "/symlink-mover",
  runMode: "main-only",
  icon: markRaw(SymlinkMoverIcon),
  component: () => import("./SymlinkMover.vue"),
  description: "支持拖拽的文件批量移动和符号链接创建工具",
  category: "文件管理",
};
