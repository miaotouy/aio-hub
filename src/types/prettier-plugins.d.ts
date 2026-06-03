declare module "turndown-plugin-gfm" {
  import type TurndownService from "turndown";
  export function gfm(service: TurndownService): void;
  export function tables(service: TurndownService): void;
  export function strikethrough(service: TurndownService): void;
  export function taskListItems(service: TurndownService): void;
}

// 为没有官方类型定义的 Prettier 插件添加类型声明
declare module "prettier-plugin-properties" {
  const plugin: any;
  export = plugin;
}

declare module "prettier-plugin-java" {
  const plugin: any;
  export = plugin;
}

declare module "prettier-plugin-sql" {
  const plugin: any;
  export = plugin;
}

declare module "prettier-plugin-toml" {
  const plugin: any;
  export = plugin;
}

declare module "prettier-plugin-svelte" {
  const plugin: any;
  export = plugin;
}
