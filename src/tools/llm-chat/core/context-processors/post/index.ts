import { BuiltinPostProcessors } from "./builtin-processors";

/**
 * 核心后处理器列表。
 * 系统启动时，这些处理器将被自动注册到 post-processing pipeline store 中。
 * 插件可以通过 store API 注册额外的处理器。
 */
export const CorePostProcessors = [...BuiltinPostProcessors];
