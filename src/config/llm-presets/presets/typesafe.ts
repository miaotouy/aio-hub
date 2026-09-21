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

import type { LlmPreset } from "../types";

export const typeSafePreset: LlmPreset = {
  type: "typesafe",
  name: "TypeSafe AI",
  description: "System One 结构化决策服务，适合分类、评分、路由与置信度门控",
  defaultBaseUrl: "https://api.typesafe.ai",
  logoUrl: "/model-icons/typesafe.png",
  links: [
    { label: "控制台", url: "https://console.typesafe.ai" },
    { label: "API 文档", url: "https://docs.typesafe.ai" },
  ],
  defaultModels: [
    {
      id: "jev-latest",
      name: "Jev Latest",
      group: "Jev",
      provider: "typesafe",
      capabilities: { decision: true },
      tokenLimits: { contextLength: 65536 },
      architecture: {
        modality: "text->structured-decision",
        inputModalities: ["text"],
        outputModalities: ["structured-decision"],
      },
      routing: {
        supportedEndpointTypes: ["typesafe-system-one"],
      },
      description:
        "Jev 稳定别名，通过 Choice、Score 和 Noul 返回概率化结构化决策",
    },
  ],
};
