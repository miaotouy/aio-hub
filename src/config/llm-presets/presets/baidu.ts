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

/**
 * 百度文心 预设模板
 */

import type { LlmPreset } from "../types";

// 百度文心
export const baiduPreset: LlmPreset = {
  type: "openai",
  name: "百度文心",
  description: "百度文心一言 ERNIE API",
  defaultBaseUrl: "https://aip.baidubce.com",
  logoUrl: "/model-icons/wenxin-color.svg",
  links: [
    { label: "官网", url: "https://cloud.baidu.com/product/wenxinworkshop" },
    {
      label: "控制台",
      url: "https://console.bce.baidu.com/qianfan/ais/console/application/protocols",
    },
    {
      label: "API 文档",
      url: "https://cloud.baidu.com/doc/WENXINWORKSHOP/index.html",
    },
    {
      label: "计费说明",
      url: "https://cloud.baidu.com/doc/qianfan/s/wmh4sv6ya",
    },
  ],
  defaultModels: [
    {
      id: "ernie-4.5",
      name: "ERNIE 4.5",
      group: "ERNIE 4.5",
      provider: "baidu",
      capabilities: { toolUse: true },
      description: "开源企业级模型，Apache 2.0许可（2025-09-09）",
    },
    {
      id: "ernie-4.0-turbo-128k",
      name: "ERNIE 4.0 Turbo 128K",
      group: "ERNIE 4.0",
      provider: "baidu",
      capabilities: { toolUse: true },
      description: "旗舰模型，128K超长上下文",
    },
    {
      id: "ernie-x1.1",
      name: "ERNIE X1.1",
      group: "ERNIE X1",
      provider: "baidu",
      capabilities: { thinking: true, thinkingConfigType: "switch" },
      description: "推理模型升级，代理能力增强（2025-09-09）",
    },
    {
      id: "ernie-3.5-128k",
      name: "ERNIE 3.5 128K",
      group: "ERNIE 3.5",
      provider: "baidu",
      description: "性价比版本，128K上下文",
    },
  ],
};
