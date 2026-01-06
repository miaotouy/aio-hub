<script setup lang="ts">
import { ref, onMounted } from "vue";
import { useRouter } from "vue-router";
import { Snackbar, Dialog } from "@varlet/ui";
import { createModuleLogger } from "@/utils/logger";
import { createModuleErrorHandler } from "@/utils/errorHandler";

const router = useRouter();
const logger = createModuleLogger("UiTester");
const errorHandler = createModuleErrorHandler("UiTester");

// --- LocalStorage 测试 ---
const storageKey = ref("mobile_test_key");
const storageValue = ref("");
const savedValue = ref("");

const saveToStorage = () => {
  localStorage.setItem(storageKey.value, storageValue.value);
  savedValue.value = storageValue.value;
  Snackbar.success("已保存到 LocalStorage");
  logger.info("LocalStorage Saved", { key: storageKey.value, value: storageValue.value });
};

const loadFromStorage = () => {
  const val = localStorage.getItem(storageKey.value);
  savedValue.value = val || "(无数据)";
  Snackbar.info("已读取数据");
  logger.info("LocalStorage Loaded", { key: storageKey.value, value: val });
};

const clearStorage = () => {
  localStorage.removeItem(storageKey.value);
  savedValue.value = "(已清除)";
  Snackbar.warning("已清除数据");
};

// --- Tauri API & FS 测试 ---
const isTauri = ref(false);
const tauriVersion = ref("");
const fsTestResult = ref("");
const storeTestResult = ref("");
const storeValueInput = ref("Hello Store!");
const storeReadValue = ref("");

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

const goBack = () => {
  router.back();
};

onMounted(() => {
  checkTauri();
  const initial = localStorage.getItem(storageKey.value);
  if (initial) savedValue.value = initial;
});
</script>

<template>
  <div class="ui-tester-view">
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

    <div class="content has-fixed-app-bar safe-area-bottom">
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

      <!-- LocalStorage 测试 -->
      <var-card title="LocalStorage 稳定性测试" class="mt-4" elevation="2">
        <template #description>
          <div class="card-content">
            <var-input v-model="storageKey" placeholder="Key" label="存储键" variant="standard" />
            <var-input
              v-model="storageValue"
              placeholder="Value"
              label="存储值"
              class="mt-2"
              variant="standard"
            />

            <div class="mt-4 p-3 bg-secondary rounded text-sm border-l-4">
              <div class="text-hint mb-1">当前读取值:</div>
              <div class="text-primary font-bold break-all">{{ savedValue }}</div>
            </div>

            <var-space :size="[12, 12]" class="mt-4">
              <var-button type="primary" size="small" @click="saveToStorage">保存</var-button>
              <var-button type="info" size="small" @click="loadFromStorage">读取</var-button>
              <var-button type="warning" size="small" @click="clearStorage">清除</var-button>
            </var-space>
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
    </div>
  </div>
</template>

<style scoped>
.ui-tester-view {
  min-height: 100vh;
  background-color: var(--bg-color);
}

.content {
  padding: 16px;
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
