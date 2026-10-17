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

import { inject, onBeforeUnmount, watch, type InjectionKey } from "vue";

export interface MessageHeightSource {
  /** 已完成宏处理、可按普通段落估高的正文。复杂显示状态保留 undefined。 */
  text?: string;
  appearance: string;
}

export const messageHeightSourceKey: InjectionKey<
  (id: string, source: MessageHeightSource | null, owner: object) => void
> = Symbol("message-height-source");

/** 在消息实际生效的渲染配置旁提供估高输入，避免列表重复实现正则与宏解析。 */
export function useMessageHeightSource(
  id: () => string,
  source: () => MessageHeightSource
) {
  const update = inject(messageHeightSourceKey, null);
  if (!update) return;
  const owner = {};
  let currentId: string | undefined;
  watch(
    [id, source],
    ([nextId, value]) => {
      if (currentId && currentId !== nextId) update(currentId, null, owner);
      currentId = nextId;
      update(nextId, value, owner);
    },
    { immediate: true, flush: "post" }
  );
  onBeforeUnmount(() => {
    if (currentId) update(currentId, null, owner);
  });
}
