/**
 * 翻译工作台基础设施常量。
 *
 * 这里只放跨多个状态模块共享的基础设施级常量（模块名、配置版本），
 * 避免子模块互相反向 import 同级文件中的常量。
 */
export const TRANSLATOR_MODULE_NAME = "translator";
export const TRANSLATOR_CONFIG_VERSION = "1.1.0";
