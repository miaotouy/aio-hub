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
  ToolRegistry,
  ServiceMetadata,
  ToolConfig,
} from "@/services/types";
import { markRaw } from "vue";
import { GitCommitHorizontal } from "lucide-vue-next";

/**
 * Git Committer (Git 提交助手) 服务注册器
 *
 * 多仓库并发的轻量级 Git 提交工作流工具，聚焦暂存、AI 生成 commit message、提交/推送。
 * 首版不提供 Agent facade（与 text-diff 首版一致），仅作 UI 工具。
 */
export default class GitCommitterRegistry implements ToolRegistry {
  public readonly id = "git-committer";
  public readonly runMode = "any";
  public readonly name = "Git 提交助手";
  public readonly description =
    "多仓库并发的 Git 提交工作流：暂存、AI 生成提交信息、提交与推送";

  /**
   * 获取服务元数据
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
  name: "Git 提交助手",
  path: "/git-committer",
  runMode: "any",
  icon: markRaw(GitCommitHorizontal),
  component: () => import("./GitCommitter.vue"),
  description: "多仓库 Git 提交工作流（暂存 / AI 生成 / 提交 / 推送）",
  category: ["开发工具"],
  version: "0.1.0",
};
