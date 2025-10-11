import { defineAsyncComponent, type Component } from "vue";

export interface SettingsModule {
	id: string;
	title: string;
	component?: Component;
	minHeight?: string; // 动态组件的最小高度，例如 "800px" 或 "auto"
}

export const settingsModules: SettingsModule[] = [
	{
		id: "general",
		title: "通用设置",
	},
	{
		id: "tools",
		title: "工具模块",
	},
	{
		id: "llm-service",
		title: "LLM 服务配置",
		component: defineAsyncComponent(
			() => import("../views/components/LlmServiceSettings.vue"),
		),
		minHeight:"500px",
	},
	{
		id: "ocr-service",
		title: "云端 OCR 服务",
		component: defineAsyncComponent(
			() => import("../views/components/OcrServiceSettings.vue"),
		),
		minHeight:"500px",
	},
	{
		id: "model-icons",
		title: "模型图标配置",
		component: defineAsyncComponent(
			() => import("../views/components/ModelIconSettings.vue"),
		),
		minHeight:"600px",
	},
	{
		id: "about",
		title: "关于",
		component: defineAsyncComponent(
			() => import("../views/components/AboutSettings.vue"),
		),
	},
];
