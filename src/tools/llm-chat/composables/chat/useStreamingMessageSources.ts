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

import type { StreamSource } from "@/tools/rich-text-renderer/types";

type StreamCallback = (chunk: string) => void;
type CompleteCallback = () => void;

class ReplayableMessageStreamSource implements StreamSource {
  private buffer = "";
  private completed = false;
  private subscribers = new Set<StreamCallback>();
  private completeSubscribers = new Set<CompleteCallback>();

  constructor(initialContent = "") {
    this.buffer = initialContent;
  }

  subscribe(callback: StreamCallback): () => void {
    this.subscribers.add(callback);

    if (this.buffer) {
      queueMicrotask(() => {
        if (this.subscribers.has(callback)) {
          callback(this.buffer);
        }
      });
    }

    return () => {
      this.subscribers.delete(callback);
    };
  }

  onComplete(callback: CompleteCallback): () => void {
    this.completeSubscribers.add(callback);

    if (this.completed) {
      queueMicrotask(() => {
        if (this.completeSubscribers.has(callback)) {
          callback();
        }
      });
    }

    return () => {
      this.completeSubscribers.delete(callback);
    };
  }

  append(chunk: string): void {
    if (!chunk) return;
    if (this.completed) {
      this.completed = false;
    }

    this.buffer += chunk;
    for (const callback of this.subscribers) {
      callback(chunk);
    }
  }

  complete(): void {
    if (this.completed) return;

    this.completed = true;
    for (const callback of this.completeSubscribers) {
      callback();
    }
  }

  dispose(): void {
    this.subscribers.clear();
    this.completeSubscribers.clear();
    this.buffer = "";
    this.completed = true;
  }
}

const sources = new Map<string, ReplayableMessageStreamSource>();
const disposeTimers = new Map<string, ReturnType<typeof setTimeout>>();

function cancelScheduledDispose(nodeId: string): void {
  const timer = disposeTimers.get(nodeId);
  if (!timer) return;

  clearTimeout(timer);
  disposeTimers.delete(nodeId);
}

export function getOrCreateStreamingMessageSource(
  nodeId: string,
  initialContent = ""
): StreamSource {
  cancelScheduledDispose(nodeId);

  let source = sources.get(nodeId);
  if (!source) {
    source = new ReplayableMessageStreamSource(initialContent);
    sources.set(nodeId, source);
  }
  return source;
}

export function appendStreamingMessageChunk(
  nodeId: string,
  chunk: string
): void {
  cancelScheduledDispose(nodeId);

  const source = sources.get(nodeId) ?? new ReplayableMessageStreamSource();
  sources.set(nodeId, source);
  source.append(chunk);
}

export function completeStreamingMessageSource(nodeId: string): void {
  sources.get(nodeId)?.complete();
}

export function completeAndDisposeStreamingMessageSource(
  nodeId: string,
  disposeDelayMs = 30000
): void {
  completeStreamingMessageSource(nodeId);
  cancelScheduledDispose(nodeId);

  const timer = setTimeout(
    () => disposeStreamingMessageSource(nodeId),
    disposeDelayMs
  );
  disposeTimers.set(nodeId, timer);
}

export function disposeStreamingMessageSource(nodeId: string): void {
  cancelScheduledDispose(nodeId);

  const source = sources.get(nodeId);
  if (!source) return;

  source.dispose();
  sources.delete(nodeId);
}
