/**
 * 应用全局设置管理
 * 使用 localStorage 存储简单的 UI 状态
 */

export interface AppSettings {
  sidebarCollapsed: boolean;
  theme?: 'light' | 'dark';
}

class LocalStorageManager<T extends Record<string, any>> {
  private key: string;
  private defaultValue: T;

  constructor(key: string, defaultValue: T) {
    this.key = key;
    this.defaultValue = defaultValue;
  }

  /**
   * 加载设置
   */
  load(): T {
    try {
      const stored = localStorage.getItem(this.key);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...this.defaultValue, ...parsed };
      }
    } catch (error) {
      console.error(`加载设置失败 (${this.key}):`, error);
    }
    return this.defaultValue;
  }

  /**
   * 保存设置
   */
  save(settings: T): void {
    try {
      localStorage.setItem(this.key, JSON.stringify(settings));
    } catch (error) {
      console.error(`保存设置失败 (${this.key}):`, error);
    }
  }

  /**
   * 更新部分设置
   */
  update(updates: Partial<T>): T {
    const current = this.load();
    const updated = { ...current, ...updates };
    this.save(updated);
    return updated;
  }

  /**
   * 清除设置
   */
  clear(): void {
    try {
      localStorage.removeItem(this.key);
    } catch (error) {
      console.error(`清除设置失败 (${this.key}):`, error);
    }
  }
}

// 创建应用设置管理器实例
export const appSettingsManager = new LocalStorageManager<AppSettings>(
  'app_settings',
  {
    sidebarCollapsed: false
  }
);

// 导出便捷方法
export const loadAppSettings = () => appSettingsManager.load();
export const saveAppSettings = (settings: AppSettings) => appSettingsManager.save(settings);
export const updateAppSettings = (updates: Partial<AppSettings>) => appSettingsManager.update(updates);