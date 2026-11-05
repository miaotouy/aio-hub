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

interface Subscription {
  lastContent: string;
}
interface ClipboardMonitorHost {
  readText(): Promise<string>;
  emit(owner: number, content: string): boolean;
  onError(error: unknown): void;
}
/** One OS poller, with explicit per-document leases and no application-wide broadcast. */
export class ClipboardMonitor {
  private readonly owners = new Map<number, Subscription>();
  private timer?: ReturnType<typeof setInterval>;
  private polling = false;
  constructor(private readonly host: ClipboardMonitorHost) {}
  start(owner: number): void {
    if (this.owners.has(owner)) return;
    this.owners.set(owner, { lastContent: "" });
    if (!this.timer) {
      this.timer = setInterval(() => {
        void this.poll();
      }, 500);
      this.timer.unref();
    }
  }
  contentType(owner: number): "json" | "base64" | "text" {
    const content = this.owners.get(owner)?.lastContent ?? "";
    if (content.startsWith("{") && content.endsWith("}")) return "json";
    if (content.length > 100 && content.endsWith("==") && content.includes("/"))
      return "base64";
    return "text";
  }
  disposeOwner(owner: number): void {
    this.owners.delete(owner);
    if (!this.owners.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }
  disposeAll(): void {
    this.owners.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }
  private async poll(): Promise<void> {
    if (this.polling || !this.owners.size) return;
    this.polling = true;
    const owners = [...this.owners];
    try {
      const content = await this.host.readText();
      if (!content) return;
      for (const [owner, subscription] of owners) {
        if (
          this.owners.get(owner) !== subscription ||
          subscription.lastContent === content
        )
          continue;
        subscription.lastContent = content;
        if (!this.host.emit(owner, content)) this.disposeOwner(owner);
      }
    } catch (error) {
      this.host.onError(error);
    } finally {
      this.polling = false;
    }
  }
}
