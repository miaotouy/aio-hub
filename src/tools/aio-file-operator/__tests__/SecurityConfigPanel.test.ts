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

import { mount } from "@vue/test-utils";
import { reactive } from "vue";
import { describe, expect, it, vi } from "vitest";
import SecurityConfigPanel from "../components/SecurityConfigPanel.vue";
import { DEFAULT_CONFIG } from "../config";

// 保护已有规则的原位类型修改和保存契约，避免重新创建规则或误改相邻路径。
describe("existing security rule editing", () => {
  it.each([
    ["block", "approve"],
    ["approve", "block"],
  ] as const)(
    "persists %s → %s while retaining rule identity and neighbours",
    async (from, to) => {
      const config = reactive({
        ...DEFAULT_CONFIG,
        sandboxMode: "blacklist" as const,
        blackListRules: [
          { id: "edited-rule", path: "C:/Private", type: from },
          { id: "other-rule", path: "D:/Work", type: "block" as const },
        ],
      });
      const save = vi.fn(() => JSON.parse(JSON.stringify(config)));
      const wrapper = mount(SecurityConfigPanel, {
        props: {
          config,
          maxFileSizeMB: 10,
          newDirectoryPath: "",
          newRulePath: "",
          newRuleType: "block",
          onSaveConfig: save,
        },
        global: {
          stubs: {
            DropZone: true,
            "el-icon": true,
            "el-segmented": true,
            "el-divider": true,
            "el-tooltip": true,
            "el-slider": true,
            "el-switch": true,
            "el-radio-group": true,
            "el-radio-button": true,
            "el-input": true,
            "el-button": true,
            "el-select": {
              props: ["modelValue"],
              emits: ["update:modelValue", "change"],
              template: `<select :value="modelValue" @change="$emit('update:modelValue', $event.target.value); $emit('change', $event.target.value)"><slot /></select>`,
            },
            "el-option": {
              props: ["value", "label"],
              template: '<option :value="value">{{ label }}</option>',
            },
          },
        },
      });
      try {
        await wrapper
          .get('select[aria-label="C:/Private 的规则类型"]')
          .setValue(to);
        expect(save).toHaveBeenCalledOnce();
        expect(save.mock.results[0].value.blackListRules).toEqual([
          { id: "edited-rule", path: "C:/Private", type: to },
          { id: "other-rule", path: "D:/Work", type: "block" },
        ]);
        expect(wrapper.emitted("add-new-rule")).toBeUndefined();
        expect(wrapper.emitted("remove-rule")).toBeUndefined();
      } finally {
        wrapper.unmount();
      }
    }
  );
});
