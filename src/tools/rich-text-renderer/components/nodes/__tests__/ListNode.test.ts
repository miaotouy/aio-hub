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

import { expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import ListNode from "../ListNode.vue";

it("passes the ordered-list start number to the actual list element", async () => {
  const wrapper = mount(ListNode, {
    props: { nodeId: "list", ordered: true, start: 3 },
    slots: { default: "third" },
  });
  expect(wrapper.element.tagName).toBe("OL");
  expect((wrapper.element as HTMLOListElement).start).toBe(3);
  await wrapper.setProps({ ordered: false });
  expect(wrapper.element.tagName).toBe("UL");
  expect(wrapper.attributes("start")).toBeUndefined();
  wrapper.unmount();
});
