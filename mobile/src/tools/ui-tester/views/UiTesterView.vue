m
<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Snackbar, Dialog } from "@varlet/ui";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";
import { useSettingsStore } from "@/stores/settings";
import { useThemeStore } from "@/stores/theme";
import { generateUuid } from "@/utils/uuid";

const router = useRouter();
const logger = createModuleLogger("UiTester");
const errorHandler = createModuleErrorHandler("UiTester");
const settingsStore = useSettingsStore();
const themeStore = useThemeStore();

// --- Settings Store 测试 ---
const debugMode = ref(settingsStore.debugMode);

const toggleDebugMode = async () => {
  await settingsStore.updateSettings({ debugMode: !settingsStore.debugMode });
  debugMode.value = settingsStore.debugMode;
  Snackbar.success(`调试模式已${settingsStore.debugMode ? "开启" : "关闭"}`);
};

const testUpdateLanguage = async () => {
  const newLang = settingsStore.settings.language === "zh-CN" ? "en-US" : "zh-CN";
  await settingsStore.updateSettings({ language: newLang });
  Snackbar.info(`语言已切换为: ${newLang}`);
};

// --- Tauri API & FS 测试 ---
const isTauri = ref(false);
const tauriVersion = ref("");
const fsTestResult = ref("");
const storeTestResult = ref("");
const storeValueInput = ref("Hello Store!");
const storeReadValue = ref("");

// --- 避让数值测试 ---
const safeAreaInsets = ref({
  top: "0px",
  bottom: "0px",
  left: "0px",
  right: "0px",
});

const viewportInfo = ref({
  windowInnerHeight: 0,
  visualViewportHeight: 0,
  visualViewportOffsetTop: 0,
  keyboardHeight: 0,
  cssKeyboardHeight: 0,
  isSimulated: false,
  resizeCount: 0,
  viewportEventCount: 0,
});

const updateViewportInfo = (event?: Event) => {
  viewportInfo.value.windowInnerHeight = window.innerHeight;
  if (window.visualViewport) {
    viewportInfo.value.visualViewportHeight = window.visualViewport.height;
    viewportInfo.value.visualViewportOffsetTop = window.visualViewport.offsetTop;
    viewportInfo.value.keyboardHeight = window.innerHeight - window.visualViewport.height;
  }

  // 从 CSS 变量读取实际生效的值
  const cssHeight = getComputedStyle(document.documentElement).getPropertyValue(
    "--keyboard-height"
  );
  viewportInfo.value.cssKeyboardHeight = parseInt(cssHeight) || 0;
  viewportInfo.value.isSimulated =
    document.documentElement.classList.contains("keyboard-simulated");

  if (event?.type === "resize") viewportInfo.value.resizeCount++;
  if (event?.type === "scroll" || !event) viewportInfo.value.viewportEventCount++;

  logger.debug("Viewport updated", {
    event: event?.type || "manual",
    viewport: { ...viewportInfo.value },
  });
};

const updateSafeAreaInsets = () => {
  // 优先从根元素读取 CSS 变量（这些通常由全局样式或系统注入）
  const style = getComputedStyle(document.documentElement);
  const top = style.getPropertyValue("--app-safe-area-top").trim();
  const bottom = style.getPropertyValue("--app-safe-area-bottom").trim();

  // 如果 CSS 变量没值且在真机/模拟器环境，再尝试 DOM 探测
  if ((!top || top === "0px") && isTauri.value) {
    const probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;top:env(safe-area-inset-top);bottom:env(safe-area-inset-bottom);visibility:hidden;pointer-events:none;";
    document.body.appendChild(probe);
    const probeStyle = window.getComputedStyle(probe);
    safeAreaInsets.value = {
      top: probeStyle.top,
      bottom: probeStyle.bottom,
      left: probeStyle.left,
      right: probeStyle.right,
    };
    document.body.removeChild(probe);
  } else {
    safeAreaInsets.value = {
      top: top || "0px",
      bottom: bottom || "0px",
      left: style.getPropertyValue("--app-safe-area-left").trim() || "0px",
      right: style.getPropertyValue("--app-safe-area-right").trim() || "0px",
    };
  }
};

const checkTauri = async () => {
  // @ts-ignore
  isTauri.value = !!window.__TAURI_INTERNALS__ || !!window.__TAURI__;
  if (isTauri.value) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      tauriVersion.value = await getVersion();
      logger.info("Tauri Info", { version: tauriVersion.value });
    } catch (e) {
      logger.error("Tauri API Error", e);
    }
  }
};

const testFileSystem = async () => {
  if (!isTauri.value) {
    Snackbar.warning("非 Tauri 环境，无法测试文件系统");
    return;
  }

  try {
    fsTestResult.value = "正在尝试写入测试文件...";
    const { writeTextFile, readTextFile, BaseDirectory } = await import("@tauri-apps/plugin-fs");

    const fileName = `aio_mobile_test.txt`;
    const content = `Hello from AIO Hub Mobile! Time: ${new Date().toLocaleString()}`;

    // 写入
    await writeTextFile(fileName, content, {
      baseDir: BaseDirectory.AppData,
    });

    // 读取验证
    const readContent = await readTextFile(fileName, {
      baseDir: BaseDirectory.AppData,
    });

    fsTestResult.value = `成功! 读取内容: "${readContent}"`;
    Snackbar.success("文件读写测试成功");
    logger.info("FS Test Success", { fileName, readContent });
  } catch (err: any) {
    fsTestResult.value = `FS 测试失败: ${err.message}`;
    logger.error("FS Test Failed", err);
    errorHandler.handle(err, { userMessage: "文件系统测试失败", showToUser: true });
  }
};

const testTauriStore = async () => {
  if (!isTauri.value) {
    Snackbar.warning("非 Tauri 环境，无法测试 Store");
    return;
  }

  try {
    storeTestResult.value = "正在测试 Store...";
    const { load } = await import("@tauri-apps/plugin-store");

    // 加载或创建 store
    const store = await load("test_settings.json", { autoSave: true, defaults: {} });

    // 写入
    await store.set("test-key", { value: storeValueInput.value, time: Date.now() });

    // 读取验证
    const val: any = await store.get("test-key");
    storeReadValue.value = JSON.stringify(val);

    storeTestResult.value = "Store 读写测试成功！";
    Snackbar.success("Store 测试成功");
    logger.info("Store Test Success", { val });
  } catch (err: any) {
    storeTestResult.value = `Store 测试失败: ${err.message}`;
    logger.error("Store Test Failed", err);
    errorHandler.handle(err, { userMessage: "Store 测试失败", showToUser: true });
  }
};

// --- 基础设施测试 ---
const triggerError = () => {
  errorHandler.error(new Error("这是一个测试错误"), "测试错误弹窗", {
    detail: "姐姐你看，这是测试详情",
  });
};

const triggerCritical = () => {
  errorHandler.critical("这是一个严重错误", "系统可能需要重启", { fatal: true });
};

// --- UUID 测试 ---
const lastGeneratedUuid = ref("");
const generateNewUuid = () => {
  lastGeneratedUuid.value = generateUuid();
  logger.info("Generated UUID", { uuid: lastGeneratedUuid.value });
};

const goBack = () => {
  router.back();
};

onMounted(() => {
  checkTauri();
  updateSafeAreaInsets();
  updateViewportInfo();
  window.addEventListener("resize", () => {
    updateSafeAreaInsets();
    updateViewportInfo({ type: "resize" } as any);
  });
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", (e) => updateViewportInfo(e));
    window.visualViewport.addEventListener("scroll", (e) => updateViewportInfo(e));
  }
});
</script>

<template>
  <div class="app-view ui-tester-view">
    <var-app-bar
      title="组件与 API 测试"
      title-position="center"
      class="custom-app-bar"
      fixed
      :z-index="100"
    >
      <template #left>
        <var-button round text @click="goBack">
          <var-icon name="chevron-left" />
        </var-button>
      </template>
    </var-app-bar>

    <div class="content has-fixed-app-bar safe-area-bottom keyboard-aware-scroll">
      <!-- 避让数值测试 -->
      <var-card title="安全区域避让测试 (Safe Area)" class="mt-4" elevation="2">
        <template #description>
          <div class="card-content">
            <var-cell title="Top (Status Bar)" :description="safeAreaInsets.top" border />
            <var-cell title="Bottom (Home Indicator)" :description="safeAreaInsets.bottom" border />
            <var-cell title="Left" :description="safeAreaInsets.left" border />
            <var-cell title="Right" :description="safeAreaInsets.right" border />

            <div class="mt-4 p-3 bg-secondary rounded text-xs">
              <div class="text-hint mb-1">CSS 变量值:</div>
              <div class="flex justify-between mb-1">
                <span>--app-safe-area-top:</span>
                <span class="text-primary">var(--app-safe-area-top)</span>
              </div>
              <div class="text-hint italic mt-2">提示：在真机或模拟器上，Top 值通常 > 0。</div>
            </div>

            <var-button
              type="primary"
              block
              size="small"
              class="mt-4"
              @click="updateSafeAreaInsets"
            >
              手动刷新数值
            </var-button>
          </div>
        </template>
      </var-card>

      <!-- 基础设施测试 -->
      <var-card title="基础设施测试 (Logger/Error)" class="mt-4" elevation="2">
        <template #description>
          <div class="card-content">
            <var-space direction="column" :size="[12, 12]">
              <var-button
                type="info"
                block
                @click="logger.info('这是一条普通日志', { foo: 'bar' })"
              >
                触发 Logger.info
              </var-button>
              <var-button type="warning" block @click="triggerError">
                触发 ErrorHandler.error (Snackbar)
              </var-button>
              <var-button type="danger" block @click="triggerCritical">
                触发 ErrorHandler.critical (Dialog)
              </var-button>
            </var-space>
          </div>
        </template>
      </var-card>

      <!-- Settings Store 测试 -->
      <var-card title="应用配置系统测试 (SettingsStore)" class="mt-4" elevation="2">
        <template #description>
          <div class="card-content">
            <var-cell title="调试模式">
              <template #extra>
                <var-switch v-model="debugMode" @change="toggleDebugMode" />
              </template>
            </var-cell>
            <var-cell title="当前语言" :description="settingsStore.settings.language" />
            <var-cell title="主题模式" :description="settingsStore.settings.appearance.theme" />

            <var-space :size="[12, 12]" class="mt-4">
              <var-button type="primary" size="small" @click="testUpdateLanguage">
                切换语言
              </var-button>
              <var-button type="info" size="small" @click="themeStore.toggleTheme">
                切换主题
              </var-button>
            </var-space>

            <div class="mt-4 p-3 bg-secondary rounded text-xs border-l-4">
              <div class="text-hint mb-1">Store 实时状态 (JSON):</div>
              <pre class="text-primary font-mono overflow-auto max-h-32">{{
                JSON.stringify(settingsStore.settings, null, 2)
              }}</pre>
            </div>
          </div>
        </template>
      </var-card>

      <!-- Tauri 环境与 FS/Store 测试 -->
      <var-card title="Tauri 环境与存储测试" class="mt-4" elevation="2">
        <template #description>
          <div class="pb-2">
            <var-cell title="是否在 Tauri 环境" border>
              <template #extra>
                <var-chip :type="isTauri ? 'success' : 'danger'" size="small" variant="block">
                  {{ isTauri ? "YES" : "NO" }}
                </var-chip>
              </template>
            </var-cell>
            <var-cell v-if="isTauri" title="Tauri 版本" :description="tauriVersion" border />
          </div>

          <div class="card-content">
            <var-button type="primary" block size="small" @click="testFileSystem">
              测试文件读写 (FS Plugin)
            </var-button>
            <div v-if="fsTestResult" class="mt-2 p-2 bg-secondary rounded text-xs break-all">
              {{ fsTestResult }}
            </div>

            <var-divider class="my-6" />

            <var-input
              v-model="storeValueInput"
              placeholder="输入内容"
              label="Store 测试值"
              variant="standard"
            />
            <var-button type="info" block size="small" class="mt-4" @click="testTauriStore">
              测试 Tauri Store (Store Plugin)
            </var-button>

            <div
              v-if="storeTestResult"
              class="mt-3 p-3 bg-secondary rounded text-xs break-all border-l-4"
            >
              <div class="font-bold mb-1">状态: {{ storeTestResult }}</div>
              <div v-if="storeReadValue" class="mt-1 opacity-80">读取到: {{ storeReadValue }}</div>
            </div>
          </div>

          <div v-if="!isTauri" class="px-4 pb-4 text-xs text-hint italic">
            提示：如果在普通浏览器打开，Tauri API 将不可用。
          </div>
        </template>
      </var-card>

      <!-- 原生 UI 组件预览 -->
      <var-card title="常用移动端组件预览" class="mt-4" elevation="2">
        <template #description>
          <var-cell title="Snackbar 测试" ripple border @click="Snackbar.info('消息提示')">
            <template #extra><var-icon name="chevron-right" size="20" /></template>
          </var-cell>
          <var-cell title="Dialog 测试" ripple border @click="Dialog('确认对话框')">
            <template #extra><var-icon name="chevron-right" size="20" /></template>
          </var-cell>
          <div class="card-content flex justify-center py-6">
            <var-loading type="cube" size="large" />
          </div>
        </template>
      </var-card>

      <!-- UUID 测试 -->
      <var-card title="工具类测试 (Utils)" class="mt-4" elevation="2">
        <template #description>
          <div class="card-content">
            <var-cell title="UUID 生成测试" description="测试 generateUuid 工具函数" />
            <div class="mt-2 p-3 bg-secondary rounded text-xs font-mono break-all">
              <div class="text-hint mb-1">生成的 ID:</div>
              <div v-if="lastGeneratedUuid" class="text-primary">{{ lastGeneratedUuid }}</div>
              <div v-else class="text-hint italic">尚未生成</div>
            </div>
            <var-button type="primary" block size="small" class="mt-4" @click="generateNewUuid">
              生成新 UUID
            </var-button>
          </div>
        </template>
      </var-card>

      <!-- 键盘与视口测试 -->
      <var-card title="键盘与视口实时监控" class="mt-4" elevation="2">
        <template #description>
          <div class="card-content">
            <div class="grid grid-cols-2 gap-2 text-xs mb-4">
              <div class="p-2 bg-secondary rounded">
                <div class="text-hint">Window InnerHeight</div>
                <div class="text-primary font-bold">{{ viewportInfo.windowInnerHeight }}px</div>
              </div>
              <div class="p-2 bg-secondary rounded">
                <div class="text-hint">Visual Viewport H</div>
                <div class="text-primary font-bold">{{ viewportInfo.visualViewportHeight }}px</div>
              </div>
              <div class="p-2 bg-secondary rounded">
                <div class="text-hint">Real Keyboard H</div>
                <div class="text-danger font-bold">
                  {{ viewportInfo.keyboardHeight.toFixed(1) }}px
                </div>
              </div>
              <div class="p-2 bg-secondary rounded">
                <div class="text-hint">Applied (CSS) H</div>
                <div class="text-warning font-bold">{{ viewportInfo.cssKeyboardHeight }}px</div>
              </div>
              <div class="p-2 bg-secondary rounded">
                <div class="text-hint">Simulated Mode</div>
                <div
                  class="font-bold"
                  :class="viewportInfo.isSimulated ? 'text-primary' : 'text-hint'"
                >
                  {{ viewportInfo.isSimulated ? "YES" : "NO" }}
                </div>
              </div>
              <div class="p-2 bg-secondary rounded">
                <div class="text-hint">Viewport OffsetTop</div>
                <div class="text-primary font-bold">
                  {{ viewportInfo.visualViewportOffsetTop }}px
                </div>
              </div>
            </div>

            <div class="flex gap-2 mb-4">
              <var-chip size="mini">Resize: {{ viewportInfo.resizeCount }}</var-chip>
              <var-chip size="mini">Viewport: {{ viewportInfo.viewportEventCount }}</var-chip>
            </div>

            <var-input
              placeholder="点击这里测试键盘弹出"
              variant="outlined"
              @focus="updateViewportInfo"
            />
            <var-input
              placeholder="再点这里对比"
              class="mt-2"
              variant="outlined"
              @focus="updateViewportInfo"
            />
          </div>
        </template>
      </var-card>
    </div>
  </div>
</template>

<style scoped>
.content {
  padding: 16px;
  /* 避让固定的 app-bar (54px) + 安全区域 */
  padding-top: calc(54px + var(--app-safe-area-top, 0px));
}

.mt-2 {
  margin-top: 8px;
}
.mt-4 {
  margin-top: 16px;
}
.mt-6 {
  margin-top: 24px;
}
.mb-1 {
  margin-bottom: 4px;
}
.my-6 {
  margin-top: 24px;
  margin-bottom: 24px;
}

.py-6 {
  padding-top: 24px;
  padding-bottom: 24px;
}

.px-4 {
  padding-left: 16px;
  padding-right: 16px;
}

.pb-2 {
  padding-bottom: 8px;
}
.pb-4 {
  padding-bottom: 16px;
}

.p-3 {
  padding: 12px;
}

.card-content {
  padding: 16px;
}

.bg-secondary {
  background-color: color-mix(in srgb, var(--primary-color), transparent 92%);
}

.border-l-4 {
  border-left: 4px solid var(--primary-color);
}

.rounded {
  border-radius: 8px;
}

.flex {
  display: flex;
}

.justify-center {
  justify-content: center;
}

.text-sm {
  font-size: 14px;
}
.text-xs {
  font-size: 12px;
}
.text-primary {
  color: var(--primary-color);
}
.text-hint {
  color: #888;
}
.font-bold {
  font-weight: bold;
}
.break-all {
  word-break: break-all;
}
.opacity-80 {
  opacity: 0.8;
}
.italic {
  font-style: italic;
}
</style>
