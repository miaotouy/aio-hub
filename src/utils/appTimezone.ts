// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 应用时区访问器。
 *
 * 时区格式化工具会被日志和配置基础设施使用，不能反向依赖 Pinia
 * store，否则会形成 configManager -> logger -> time -> appSettingsStore
 * 的模块循环。由 appSettingsStore 在加载时注册读取器，未注册或 Pinia
 * 尚未初始化时回退到系统时区。
 */

type AppTimezoneProvider = () => string | undefined;

let provider: AppTimezoneProvider | null = null;

export function setAppTimezoneProvider(nextProvider: AppTimezoneProvider) {
  provider = nextProvider;
}

export function getAppTimezone(): string {
  try {
    const configuredTimezone = provider?.();
    if (configuredTimezone) {
      return configuredTimezone;
    }
  } catch {
    // Pinia 尚未初始化时使用系统时区。
  }

  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
