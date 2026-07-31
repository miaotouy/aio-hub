import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import PluginCard from "../PluginCard.vue";
import type { PluginProxy } from "@/services/plugin-types";

describe("PluginCard diagnostics", () => {
  it("renders the failure code, context and resolution", () => {
    const plugin = {
      id: "test-sidecar",
      name: "Test Sidecar",
      description: "test",
      installPath: "plugins/test-sidecar",
      enabled: false,
      devMode: true,
      isBroken: true,
      manifest: {
        id: "test-sidecar",
        name: "Test Sidecar",
        version: "1.0.0",
        description: "test",
        author: "test",
        type: "sidecar",
        host: { appVersion: ">=0.0.0", apiVersion: 3 },
      },
      diagnostics: [
        {
          code: "PLUGIN_PROTOCOL_METHOD_UNSUPPORTED",
          severity: "error",
          title: "插件协议方法不匹配",
          message: "未知方法: submitOcrJob",
          details: [
            { label: "阶段", value: "启动" },
            { label: "安装目录", value: "plugins/test-sidecar" },
          ],
          resolution: "确认 manifest 与 Sidecar 来自同一次构建",
        },
      ],
    } as PluginProxy;

    const wrapper = mount(PluginCard, {
      props: { plugin },
      global: {
        stubs: {
          Avatar: true,
          ElButton: { template: "<button><slot /></button>" },
          ElIcon: { template: "<i><slot /></i>" },
          ElSwitch: true,
          ElTag: { template: "<span><slot /></span>" },
          ElTooltip: true,
        },
      },
    });

    expect(wrapper.text()).toContain("不可用");
    expect(wrapper.text()).toContain("PLUGIN_PROTOCOL_METHOD_UNSUPPORTED");
    expect(wrapper.text()).toContain("未知方法: submitOcrJob");
    expect(wrapper.text()).toContain("plugins/test-sidecar");
    expect(wrapper.text()).toContain("确认 manifest 与 Sidecar 来自同一次构建");
  });
});
