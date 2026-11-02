// Copyright 2025-2026 miaotouy(Github@miaotouy)
import { AtSign, BookOpen, Pencil, Sparkles } from "lucide-vue-next";
import { WebCanvasIcon } from "@aiohub/tool-icons";
import type { Component } from "vue";
import type { InputToolbarStatusId } from "../../../types/input-toolbar";

export const INPUT_TOOLBAR_STATUSES: {
  id: InputToolbarStatusId;
  label: string;
  icon: Component;
  sample: string;
  description: string;
}[] = [
  {
    id: "continuation-model",
    label: "续写模型",
    icon: Sparkles,
    sample: "续写模型",
    description: "选择续写模型后显示",
  },
  {
    id: "temporary-model",
    label: "临时模型",
    icon: AtSign,
    sample: "临时模型",
    description: "选择临时模型后显示",
  },
  {
    id: "canvas",
    label: "画布状态",
    icon: WebCanvasIcon,
    sample: "画布",
    description: "启用画布工具时显示",
  },
  {
    id: "context-tokens",
    label: "上下文 Token",
    icon: BookOpen,
    sample: "12,480",
    description: "显示历史上下文的 Token 数量",
  },
  {
    id: "input-tokens",
    label: "输入 Token",
    icon: Pencil,
    sample: "128",
    description: "显示当前输入的 Token 数量",
  },
];
