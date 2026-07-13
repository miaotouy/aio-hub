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

import type { ToolConfig } from "@/services/types";
import { markRaw } from "vue";
import ConnectorIcon from "@/components/icons/ConnectorIcon.vue";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "API 测试工具",
  path: "/api-tester",
  icon: markRaw(ConnectorIcon),
  component: () => import("./ApiTester.vue"),
  description: "测试各类 API 接口，内置 REST、GraphQL、主流 LLM 与本地模型预设",
  category: ["开发工具"],
  version: "1.6.0",
};
