// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
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
import { Subtitles } from "lucide-vue-next";

/**
 * 实时字幕 OCR 注册表
 *
 * 监控框 (MonitorBox) 通过统一的 detachableComponents 体系注册为
 * `type: "component"` 可分离组件：透明 + 无边框 + 置顶 + 可缩放 + 无阴影，
 * 由 DetachedComponentContainer.vue 在 /detached-component/:componentId
 * 路由下加载，复用 useDetachable / useDetachedManager / useWindowSyncBus
 * 全套悬浮窗基础设施，无需自造独立窗口。
 */
export default class RealtimeSubtitleOcrRegistry implements ToolRegistry {
  public readonly id = "realtime-subtitle-ocr";
  public readonly runMode = "any" as const;
  public readonly name = "实时字幕OCR";
  public readonly description =
    "高频、低开销的屏幕动态监控与流式字幕 OCR 识别工具";

  public readonly detachableComponents: Record<
    string,
    DetachableComponentRegistration
  > = {
    "realtime-subtitle-ocr:monitor-box": {
      component: () => import("./components/MonitorBox.vue"),
      logicHook: () => ({
        props: ref({
          isDetached: true,
        }),
        listeners: {},
      }),
    },
  };
}

/**
 * 工具 UI 配置
 */
export const toolConfig: ToolConfig = {
  name: "实时字幕OCR",
  path: "/realtime-subtitle-ocr",
  icon: markRaw(Subtitles),
  component: () => import("./RealtimeSubtitleOcr.vue"),
  description: "高频、低开销的屏幕动态监控与流式字幕 OCR 识别工具",
  category: ["AI 工具"],
  version: "1.0.0",
  runMode: "any",
};

