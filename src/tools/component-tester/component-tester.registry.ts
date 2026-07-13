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

import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { markRaw, ref } from "vue";
import { FlaskConical } from "lucide-vue-next";

/**
 * 组件测试器注册表
 */
export default class ComponentTesterRegistry implements ToolRegistry {
  public readonly id = "component-tester";
  public readonly runMode = "any";
  public readonly name = "组件测试器";
  public readonly description =
    "测试和展示各种 UI 组件、Element Plus 元素、消息提示和主题色板";

  /**
   * 工具提供的可分离组件配置
   */
  public readonly detachableComponents: Record<
    string,
    DetachableComponentRegistration
  > = {
    "component-tester:sync-demo": {
      component: () => import("./components/DetachedWindowContent.vue"),
      logicHook: () => ({
        props: ref({
          isDetached: true,
          title: "同步测试组件 (已分离)",
        }),
        listeners: {},
      }),
    },
    // 拖拽配置与高频事件监听测试组件
    "component-tester:drag-drop-playground": {
      component: () => import("./components/DragDropPlayground.vue"),
      logicHook: () => ({
        props: ref({
          isDetached: true,
          title: "拖放测试区 (已分离)",
        }),
        listeners: {},
      }),
    },
    // 布局预览演示组件
    ...["top", "bottom", "left", "right"].reduce(
      (acc, pos) => {
        acc[`component-tester:layout-demo-${pos}`] = {
          component: () => import("./components/DetachedWindowContent.vue"),
          logicHook: () => ({
            props: ref({
              isDetached: true,
              title: `布局预览 (${pos})`,
            }),
            listeners: {},
          }),
        };
        return acc;
      },
      {} as Record<string, DetachableComponentRegistration>
    ),
  };
}

/**
 * UI 工具配置
 */
export const toolConfig: ToolConfig = {
  name: "组件测试器",
  path: "/component-tester",
  runMode: "any",
  icon: markRaw(FlaskConical),
  component: () => import("./ComponentTester.vue"),
  description:
    "测试和展示各种 UI 组件、窗口分离同步体系、Element Plus 元素、消息提示和主题色板",
  category: ["开发工具"],
  version: "1.8.0",
};
