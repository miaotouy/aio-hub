import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import i18n from "@/i18n";
import { useSettingsStore } from "../settings";

describe("settings language updates", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    i18n.global.locale.value = "zh-CN";
  });

  afterEach(() => {
    i18n.global.locale.value = "zh-CN";
  });

  it("applies the locale immediately when settings are updated", async () => {
    const store = useSettingsStore();

    await store.updateSettings({ language: "en-US" });

    expect(store.settings.language).toBe("en-US");
    expect(i18n.global.locale.value).toBe("en-US");
  });
});
