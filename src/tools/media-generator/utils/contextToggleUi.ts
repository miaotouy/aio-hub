import type { MediaTaskType } from "../types";

export type ContextToggleMode = "conversation" | "reference" | "none";

export interface ContextToggleUi {
  visible: boolean;
  mode: ContextToggleMode;
  title: string;
  toolbarLabel: string;
  tooltip: string;
}

const mediaTypeName: Record<MediaTaskType, string> = {
  image: "图片",
  video: "视频",
  speech: "语音",
  music: "音乐",
};

const referenceToggleUi: Record<"image" | "video", ContextToggleUi> = {
  image: {
    visible: true,
    mode: "reference",
    title: "参考上一轮图片",
    toolbarLabel: "上一轮图",
    tooltip:
      "普通图片生成端点不会携带完整历史；开启后，在模型支持参考图或迭代微调时，把上一轮生成图片作为参考输入",
  },
  video: {
    visible: true,
    mode: "reference",
    title: "参考上一轮素材",
    toolbarLabel: "上一轮素材",
    tooltip:
      "普通视频生成端点不会携带完整历史；开启后，在模型支持参考输入时，把上一轮可用的图片结果作为视频参考素材",
  },
};

export function getMediaContextToggleUi(
  mediaType: MediaTaskType,
  supportsConversationalContext: boolean
): ContextToggleUi {
  if (supportsConversationalContext) {
    return {
      visible: true,
      mode: "conversation",
      title: "多轮上下文",
      toolbarLabel: "上下文",
      tooltip: `${mediaTypeName[mediaType]}模型当前使用 Chat / Responses 路由；开启后会携带会话历史消息，实现真正的多轮上下文生成`,
    };
  }

  if (mediaType === "image" || mediaType === "video") {
    return referenceToggleUi[mediaType];
  }

  return {
    visible: false,
    mode: "none",
    title: "单轮生成",
    toolbarLabel: "单轮",
    tooltip:
      "普通语音和音乐生成端点按当前输入单轮生成，不会自动携带历史消息或上一轮音频；需要参考音频时请使用附件或模型参数",
  };
}
