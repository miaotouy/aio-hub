import {
  UserCircle,
  Bot,
  Zap,
  Settings2
} from "lucide-vue-next";
import type { Component } from "vue";

export interface AgentEditItem {
  id: string;
  label: string;
  keywords: string;
}

export interface AgentEditTab {
  id: string;
  label: string;
  icon: Component;
  items: AgentEditItem[];
}

export const agentEditTabs: AgentEditTab[] = [
  {
    id: "basic",
    label: "基础设定",
    icon: Bot,
    items: [
      { id: "name", label: "ID/名称", keywords: "name id 名称" },
      { id: "displayName", label: "显示名称", keywords: "displayname 显示名称" },
      { id: "icon", label: "图标", keywords: "icon avatar 图标 头像" },
      { id: "category", label: "分类", keywords: "category 分类" },
      { id: "tags", label: "标签", keywords: "tags 标签" },
      { id: "description", label: "描述", keywords: "description 描述" },
    ],
  },
  {
    id: "personality",
    label: "角色设定",
    icon: UserCircle,
    items: [
      { id: "model", label: "模型选择", keywords: "model llm 模型" },
      { id: "presetMessages", label: "预设消息", keywords: "preset prompt 预设 提示词" },
      { id: "displayPresetCount", label: "显示数量", keywords: "preset count 显示数量" },
      { id: "userProfile", label: "用户档案", keywords: "user profile 用户档案" },
      { id: "worldbook", label: "关联世界书", keywords: "worldbook lorebook 世界书" },
    ],
  },
  {
    id: "capabilities",
    label: "功能扩展",
    icon: Zap,
    items: [
      { id: "assets", label: "资产管理", keywords: "assets 资产 图片 音频" },
      { id: "virtualTime", label: "虚拟时间线", keywords: "virtual time 虚拟时间" },
    ],
  },
  {
    id: "output",
    label: "输出与显示",
    icon: Settings2,
    items: [
      { id: "regex", label: "文本替换规则", keywords: "regex replace 正则 替换" },
      { id: "thinkRules", label: "思考块规则", keywords: "think rules cot 思考块" },
      { id: "style", label: "回复样式", keywords: "style markdown css 样式" },
      { id: "interaction", label: "交互行为", keywords: "interaction branch 交互 分支" },
    ],
  },
];