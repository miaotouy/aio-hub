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
import RichTextRendererIcon from "@/components/icons/RichTextRendererIcon.vue";

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "富文本渲染测试",
  path: "/rich-text-renderer-tester",
  icon: markRaw(RichTextRendererIcon),
  component: () => import("./components/RichTextRendererTester.vue"),
  description: "测试 Markdown 富文本渲染，支持流式输出模拟",
  category: ["开发工具"],
  version: "3.4.0",
};
