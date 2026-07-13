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
 * 能力自动匹配规则 (优先级 5)
 *
 * 根据模型名称中的关键词自动推断模型能力。
 */
import type { ModelMetadataRule } from "../../types/model-metadata";

export const capabilityRules: ModelMetadataRule[] = [
  // 视觉能力
  {
    id: "capability-vision-vl",
    matchType: "modelPrefix",
    matchValue: "vl",
    properties: {
      capabilities: {
        vision: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含 'vl' 的模型自动添加视觉能力",
  },
  {
    id: "capability-vision-keywords",
    matchType: "modelPrefix",
    matchValue: "vision|visual|multimodal|vlm",
    useRegex: true,
    properties: {
      capabilities: {
        vision: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含视觉关键词的模型自动添加视觉能力",
  },

  // 工具调用能力
  {
    id: "capability-tool-use",
    matchType: "modelPrefix",
    matchValue: "tools?|function|fc",
    useRegex: true,
    properties: {
      capabilities: {
        toolUse: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含工具调用关键词的模型自动添加工具调用能力",
  },

  // 思考模式
  {
    id: "capability-thinking",
    matchType: "modelPrefix",
    matchValue: "think|extended-thinking|reason|reasoning",
    useRegex: true,
    properties: {
      capabilities: {
        thinking: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含思考或推理关键词的模型自动添加思考模式能力",
  },

  // 代码执行
  {
    id: "capability-code-execution",
    matchType: "modelPrefix",
    matchValue: "code-execution|code-interpreter|execute",
    useRegex: true,
    properties: {
      capabilities: {
        codeExecution: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含代码执行关键词的模型自动添加代码执行能力",
  },

  // 联网搜索
  {
    id: "capability-web-search",
    matchType: "modelPrefix",
    matchValue: "search|web-search|grounded",
    useRegex: true,
    properties: {
      capabilities: {
        webSearch: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含搜索关键词的模型自动添加联网搜索能力",
  },

  // 文件搜索
  {
    id: "capability-file-search",
    matchType: "modelPrefix",
    matchValue: "file-search|retrieval",
    useRegex: true,
    properties: {
      capabilities: {
        fileSearch: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含文件搜索关键词的模型自动添加文件搜索能力",
  },

  // 计算机使用
  {
    id: "capability-computer-use",
    matchType: "modelPrefix",
    matchValue: "computer-use|browser-use",
    useRegex: true,
    properties: {
      capabilities: {
        computerUse: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含计算机使用关键词的模型自动添加计算机使用能力",
  },

  // 文档处理
  {
    id: "capability-document",
    matchType: "modelPrefix",
    matchValue: "doc|document|pdf",
    useRegex: true,
    properties: {
      capabilities: {
        document: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含文档处理关键词的模型自动添加文档处理能力",
  },

  // 图像生成
  {
    id: "capability-image-generation",
    matchType: "modelPrefix",
    matchValue: "image-gen|txt2img|dall-?e|diffusion|image",
    useRegex: true,
    properties: {
      capabilities: {
        imageGeneration: true,
        vision: true, // 现代图像生成模型通常支持视觉输入（图生图/参考图）
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含图像生成关键词的模型自动添加图像生成能力",
  },

  // 视频生成
  {
    id: "capability-video-generation",
    matchType: "modelPrefix",
    matchValue:
      "video-gen|txt2vid|sora|kling|video|happyhorse|seedance|vidu|skyreels|veo",
    useRegex: true,
    properties: {
      capabilities: {
        videoGeneration: true,
        vision: true, // 视频生成模型通常需要视觉输入作为起始帧或参考
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含视频生成关键词的模型自动添加视频生成能力",
  },

  // 音乐生成
  {
    id: "capability-music-generation",
    matchType: "modelPrefix",
    matchValue: "music-gen|audio-gen|suno",
    useRegex: true,
    properties: {
      capabilities: {
        musicGeneration: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含音乐生成关键词的模型自动添加音乐生成能力",
  },

  // 嵌入 (Embedding)
  {
    id: "capability-embedding",
    matchType: "modelPrefix",
    matchValue: "embed|embedding|bge",
    useRegex: true,
    properties: {
      capabilities: {
        embedding: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含嵌入关键词的模型自动添加嵌入能力",
  },

  // 重排 (Rerank)
  {
    id: "capability-rerank",
    matchType: "modelPrefix",
    matchValue: "rerank",
    properties: {
      capabilities: {
        rerank: true,
      },
    },
    priority: 5,
    enabled: true,
    description: "为包含重排关键词的模型自动添加重排能力",
  },
];
