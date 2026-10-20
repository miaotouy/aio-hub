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
import { describe, expect, it } from "vitest";
import FFmpegParamsForm from "../components/FFmpegParamsForm.vue";
import { buildQuickCommandArgs } from "../utils/command";
import type { FFmpegParams } from "../types";

// Protect device/codec selection all the way through to the generated argv.
const stubs = {
  "el-form": { template: "<form><slot /></form>" },
  "el-form-item": {
    props: ["label"],
    template: '<fieldset :aria-label="label"><slot /></fieldset>',
  },
  "el-select": {
    props: ["modelValue", "disabled"],
    emits: ["update:modelValue"],
    template: `<select :value="modelValue" :disabled="disabled" @change="$emit('update:modelValue', $event.target.value)"><slot /></select>`,
  },
  "el-option": {
    props: ["value", "label"],
    template: '<option :value="value">{{ label }}</option>',
  },
  "el-radio-group": true,
  "el-radio-button": true,
  "el-divider": true,
  "el-switch": true,
  "el-input": true,
  "el-input-number": true,
  FFmpegCustomCommand: true,
};

describe("simple encoding device selection", () => {
  it.each([
    ["nvenc", "-cq"],
    ["qsv", "-global_quality"],
  ])("keeps H.265 across %s and CPU changes", async (device, qualityFlag) => {
    const params = reactive<FFmpegParams>({
      mode: "video",
      videoEncoder: "libx265",
      preset: "medium",
      inputPath: "in.mp4",
      outputPath: "out.mp4",
      ffmpegPath: "ffmpeg",
      hwaccel: false,
    });
    const wrapper = mount(FFmpegParamsForm, {
      props: { params, isProfessional: false },
      global: { stubs },
    });
    try {
      const deviceSelect = wrapper.find(
        'fieldset[aria-label="编码设备"] select'
      );
      await deviceSelect.setValue(device);
      expect(params.videoEncoder).toBe(`hevc_${device}`);
      const args = buildQuickCommandArgs(params, "video");
      expect(args).toEqual(
        expect.arrayContaining(["-c:v", `hevc_${device}`, qualityFlag, "23"])
      );
      expect(args).not.toContain("-crf");
      await wrapper
        .find('fieldset[aria-label="编码格式"] select')
        .setValue("h264");
      expect(params.videoEncoder).toBe(`h264_${device}`);
      await deviceSelect.setValue("cpu");
      expect(params.videoEncoder).toBe("libx264");
      expect(buildQuickCommandArgs(params, "video")).toContain("-crf");
    } finally {
      wrapper.unmount();
    }
  });

  it.each(["copy", "none"])(
    "disables device selection for %s",
    async (encoder) => {
      const params = reactive<FFmpegParams>({
        mode: "video",
        videoEncoder: encoder,
        inputPath: "in.mp4",
        outputPath: "out.mp4",
        ffmpegPath: "ffmpeg",
        hwaccel: false,
      });
      const wrapper = mount(FFmpegParamsForm, {
        props: { params, isProfessional: false },
        global: { stubs },
      });
      expect(
        wrapper
          .find('fieldset[aria-label="编码设备"] select')
          .attributes("disabled")
      ).toBeDefined();
      expect(params.crf).toBeUndefined();
      wrapper.unmount();
    }
  );
});
