import type { ToolRegistry, ToolConfig } from "@/services/types";
import type { DetachableComponentRegistration } from "@/types/detachable";
import { markRaw, ref } from "vue";
import { FlaskConical } from "lucide-vue-next";

/**
 * 组件测试器注册表
 */
export default class ComponentTesterRegistry implements ToolRegistry {
  public readonly id = "component-tester";
  public readonly name = "组件测试器";
  public readonly description = "测试和展示各种 UI 组件、Element Plus 元素、消息提示和主题色板";

  /**
   * 工具提供的可分离组件配置
   */
  public readonly detachableComponents: Record<string, DetachableComponentRegistration> = {
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
  icon: markRaw(FlaskConical),
  component: () => import("./ComponentTester.vue"),
  description: "测试和展示各种 UI 组件、窗口分离同步体系、Element Plus 元素、消息提示和主题色板",
  category: "开发工具",
};
