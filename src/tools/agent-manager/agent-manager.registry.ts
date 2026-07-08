// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import type {
  ServiceMetadata,
  ToolRegistry,
  ToolConfig,
} from "@/services/types";
import { markRaw } from "vue";
import { Bot } from "lucide-vue-next";

/**
 * Agent Manager 注册器
 *
 * 提供工具的基本信息用于系统注册。
 */
export default class AgentManagerRegistry implements ToolRegistry {
  public readonly id = "agent-manager";
  public readonly runMode = "any";
  public readonly name = "智能体大厅";
  public readonly description =
    "管理和配置你的 AI 智能体，支持导入导出、私有资产和世界书管理";

  /**
   * 提供服务的元数据，用于服务监控和文档。
   */
  public getMetadata(): ServiceMetadata {
    return {
      methods: [],
    };
  }
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "智能体大厅",
  path: "/agent-manager",
  runMode: "any",
  icon: markRaw(Bot),
  component: () => import("./AgentManager.vue"),
  description:
    "管理和配置你的 AI 智能体，支持导入导出、私有资产和世界书管理，提供智能体大厅一键开聊体验",
  category: ["效率工具"],
  version: "1.0.0",
};
