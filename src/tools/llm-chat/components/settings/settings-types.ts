/**
 * @deprecated 请使用 "@/types/settings-renderer" 中的定义
 */
export * from "@/types/settings-renderer";
import type { SettingItem as GenericSettingItem, SettingsSection as GenericSettingsSection } from "@/types/settings-renderer";
import type { ChatSettings } from "../../types/settings";

/**
 * @deprecated 使用 SettingItem<ChatSettings> 代替
 */
export type SettingItem = GenericSettingItem<ChatSettings>;

/**
 * @deprecated 使用 SettingsSection<ChatSettings> 代替
 */
export type SettingsSection = GenericSettingsSection<ChatSettings>;
