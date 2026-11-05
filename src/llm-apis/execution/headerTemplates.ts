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

export interface HeaderTemplateContext {
  appName: string;
  appVersion: string;
  userAgent: string;
  secChUa: string;
  secChUaPlatform: string;
  acceptLanguage: string;
}
export function resolveHeaderTemplates(
  headers: Record<string, string> | undefined,
  ctx: HeaderTemplateContext
): Record<string, string> {
  if (!headers) return {};

  const resolved: Record<string, string> = {};

  const origin = ctx.appName
    ? `https://${ctx.appName.toLowerCase().replace(/\s+/g, "-")}.app`
    : "https://aiohub-app.com";

  for (const [key, value] of Object.entries(headers)) {
    resolved[key] = value
      .replace(/\{\{appName\}\}/g, ctx.appName)
      .replace(/\{\{appVersion\}\}/g, ctx.appVersion)
      .replace(/\{\{userAgent\}\}/g, ctx.userAgent)
      .replace(/\{\{secChUa\}\}/g, ctx.secChUa)
      .replace(/\{\{secChUaPlatform\}\}/g, ctx.secChUaPlatform)
      .replace(/\{\{appOrigin\}\}/g, origin)
      .replace(/\{\{acceptLanguage\}\}/g, ctx.acceptLanguage);
  }

  return resolved;
}
