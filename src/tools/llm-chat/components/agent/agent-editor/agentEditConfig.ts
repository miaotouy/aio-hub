import { UserCircle, Bot, Zap, Settings2 } from "lucide-vue-next";
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
      { id: "displayName", label: "显示名称", keywords: "display name 显示名称" },
      { id: "agentVersion", label: "配置版本", keywords: "version 版本" },
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
      { id: "model", label: "模型", keywords: "model 模型" },
      { id: "userProfile", label: "关联用户档案", keywords: "user profile 用户 档案" },
      { id: "quickActionSetIds", label: "快捷操作", keywords: "quick action 快捷操作" },
      { id: "worldbook", label: "关联世界书", keywords: "worldbook 世界书" },
      { id: "wbDisableRecursion", label: "禁用递归扫描", keywords: "worldbook recursion 递归" },
      { id: "wbScanDepth", label: "默认扫描深度", keywords: "worldbook depth 深度" },
      { id: "kbDefaultEngine", label: "默认检索引擎", keywords: "knowledge engine 知识库 引擎" },
      { id: "kbDefaultLimit", label: "默认召回数量", keywords: "knowledge limit 召回" },
      { id: "kbMaxRecallChars", label: "召回字数上限", keywords: "knowledge char limit 字数" },
      {
        id: "kbEmbeddingModel",
        label: "Embedding 模型",
        keywords: "knowledge embedding model 向量 模型",
      },
      { id: "kbDefaultMinScore", label: "默认最低分数", keywords: "knowledge score 分数" },
      { id: "kbResultTemplate", label: "结果模板", keywords: "knowledge template 模板" },
      { id: "kbGateScanDepth", label: "门控扫描深度", keywords: "knowledge gate depth 深度" },
      { id: "kbContextWindow", label: "上下文窗口", keywords: "knowledge context window 窗口" },
      { id: "kbEnableCache", label: "启用检索缓存", keywords: "knowledge cache 缓存" },
      {
        id: "kbCacheThreshold",
        label: "缓存相似度阈值",
        keywords: "knowledge cache threshold 阈值",
      },
      { id: "kbQueryDecay", label: "查询衰减因子", keywords: "knowledge query decay 衰减" },
      {
        id: "kbEnableResultAggregation",
        label: "启用结果聚合",
        keywords: "knowledge aggregation 聚合",
      },
      { id: "kbResultDecay", label: "结果衰减因子", keywords: "knowledge result decay 衰减" },
      { id: "kbMaxHistoryTurns", label: "最大聚合轮次", keywords: "knowledge history turns 轮次" },
      { id: "kbEmptyText", label: "空结果提示", keywords: "knowledge empty 提示" },
      { id: "displayPresetCount", label: "显示数量", keywords: "preset count 数量" },
      { id: "presetMessages", label: "预设消息", keywords: "preset messages 预设消息" },
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
      {
        id: "sendButtonCreateBranch",
        label: "分支发送模式",
        keywords: "branch rpg interaction 分支 交互",
      },
      {
        id: "defaultToolCallCollapsed",
        label: "工具调用折叠",
        keywords: "tool call collapse 工具调用 折叠",
      },
      {
        id: "defaultMediaVolume",
        label: "媒体音量",
        keywords: "volume media audio 音量 媒体 音频",
      },
      { id: "regexConfig", label: "文本替换规则", keywords: "regex replace 文本替换 正则" },
      { id: "llmThinkRules", label: "思考块规则配置", keywords: "think rules 思考块 规则" },
      {
        id: "richTextStyleOptions",
        label: "回复样式自定义",
        keywords: "style markdown css 样式 渲染",
      },
    ],
  },
];
