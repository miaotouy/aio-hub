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

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createApp,
  defineComponent,
  h,
  nextTick,
  ref,
  shallowRef,
  withDirectives,
} from "vue";
import type { ChatMessageNode } from "../../../types";
import { useMessageHeights } from "../useMessageHeights";

vi.mock("@/utils/logger", () => ({
  createModuleLogger: () => ({ warn: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

describe("消息占位与实际高度切换", () => {
  it("显示子树重建时保留实测行高，正文和尺寸变化后重新测量，生成期间保持实时布局", async () => {
    const frames = new Map<number, FrameRequestCallback>();
    let frameId = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    let resize!: ResizeObserverCallback;
    const observed = new Set<Element>();
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe(element: Element) {
          observed.add(element);
        }
        unobserve(element: Element) {
          observed.delete(element);
        }
        disconnect() {
          observed.clear();
        }
      }
    );
    const flush = async () => {
      await nextTick();
      for (let i = 0; frames.size && i < 10; i++) {
        const callbacks = Array.from(frames.values());
        frames.clear();
        for (const callback of callbacks) callback(performance.now());
        await nextTick();
      }
    };
    const deliver = (target: Element, width: number, height: number) =>
      resize(
        [
          {
            target,
            contentRect: { width, height },
            borderBoxSize: [{ blockSize: height }],
          } as unknown as ResizeObserverEntry,
        ],
        {} as ResizeObserver
      );
    const message = ref<ChatMessageNode>({
      id: "a",
      parentId: null,
      childrenIds: [],
      role: "assistant",
      status: "complete",
      content: "**复杂富文本**",
    });
    const displayMounted = ref(true);
    const layoutPending = ref(false);
    const nearby = ref(true);
    const screenshotMode = ref(false);
    const host = document.createElement("div");
    document.body.append(host);
    const app = createApp(
      defineComponent({
        setup() {
          const container = shallowRef<HTMLElement | null>(null);
          const { vMessageSize } = useMessageHeights({
            readingArea: { register: () => nearby },
            container,
            preferences: () => ({
              fontSize: 14,
              letterSpacing: 0,
              showAvatar: false,
              bubbleLayout: {
                mode: "card",
                userAlign: "right",
                assistantAlign: "left",
                systemAlign: "center",
                maxWidthPercent: 75,
                maxWidthPx: 720,
                systemMaxWidthPercent: 90,
                toolAttachment: "follow-prev",
                avatarPlacement: "inside",
                avatarSize: 36,
                avatarGap: 8,
                headerPlacement: "inside",
                headerGap: 4,
                borderRadius: 12,
              },
            }),
            appearance: () => "default",
            sessionId: () => "session",
            screenshotMode: () => screenshotMode.value,
          });
          return () =>
            h("div", { ref: container }, [
              withDirectives(
                h("div", { class: "message-slot" }, [
                  displayMounted.value
                    ? h(
                        "article",
                        {
                          "data-render-pending": layoutPending.value
                            ? ""
                            : undefined,
                        },
                        message.value.content
                      )
                    : null,
                ]),
                [[vMessageSize, { message: message.value, eager: false }]]
              ),
            ]);
        },
      })
    );
    try {
      app.mount(host);
      await flush();
      const container = host.firstElementChild!;
      const slot = container.firstElementChild as HTMLElement;
      const height = () =>
        parseFloat(
          slot.style
            .getPropertyValue("contain-intrinsic-size")
            .split(" ")
            .slice(-1)[0]
        );
      const visibility = (skipped: boolean) => {
        const event = new Event("contentvisibilityautostatechange");
        Object.defineProperty(event, "skipped", { value: skipped });
        slot.dispatchEvent(event);
      };
      deliver(container, 600, 500);
      await flush();
      visibility(false);
      deliver(slot, 600, 499.625);
      await flush();
      expect(height()).toBe(499.625);

      // In-flight layout can report a short loading shell; keep the previous measured geometry.
      layoutPending.value = true;
      await flush();
      deliver(slot, 600, 48);
      await flush();
      expect(height()).toBe(499.625);
      layoutPending.value = false;
      await flush();
      deliver(slot, 600, 499.625);
      await flush();
      expect(height()).toBe(499.625);

      nearby.value = false;
      await flush();
      expect(slot.style.getPropertyValue("content-visibility")).toBe("hidden");
      expect(height()).toBe(499.625);
      screenshotMode.value = true;
      await flush();
      expect(slot.style.getPropertyValue("content-visibility")).toBe("visible");
      screenshotMode.value = false;
      nearby.value = true;
      await flush();
      expect(slot.style.getPropertyValue("content-visibility")).toBe("auto");

      visibility(true);
      deliver(slot, 600, 500);
      await flush();
      expect(height()).toBe(499.625);

      // 回收 / 重建显示子树期间，保留上一份实测行高；等待有效的新测量校准。
      displayMounted.value = false;
      await nextTick();
      await flush();
      expect(height()).toBe(499.625);
      displayMounted.value = true;
      await nextTick();
      await flush();
      expect(height()).toBe(499.625);
      visibility(false);
      deliver(slot, 600, 720.25);
      await flush();
      expect(height()).toBe(720.25);

      // Resizing skipped rich text retains its last measured shell until fresh layout arrives.
      nearby.value = false;
      visibility(true);
      deliver(container, 420, 500);
      await flush();
      expect(height()).toBe(720.25);
      nearby.value = true;
      visibility(false);
      await flush();
      deliver(slot, 420, 940.5);
      await flush();
      expect(height()).toBe(940.5);

      message.value.content += "\n\n新段落";
      await flush();
      expect(height()).toBe(500);

      deliver(container, 320, 500);
      await flush();
      expect(height()).toBe(500);
      visibility(false);
      deliver(slot, 320, 89.25);
      await flush();
      expect(height()).toBe(89.25);

      message.value.status = "generating";
      await flush();
      message.value.content += " 新增内容";
      deliver(slot, 320, 200);
      await flush();
      expect(slot.style.getPropertyValue("content-visibility")).toBe("visible");
      message.value.status = "complete";
      await flush();
      expect(slot.style.getPropertyValue("content-visibility")).toBe("auto");
      expect(height()).toBe(500);
    } finally {
      app.unmount();
      host.remove();
    }
    expect(observed.size).toBe(0);
    expect(frames.size).toBe(0);
  });
});
