import { defineAsyncComponent, type Component } from "vue";

export interface SettingsModule {
	id: string;
	title: string;
	component?: Component;
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
	},
	{
		id: "about",
		title: "关于",
	},
];
