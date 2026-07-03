<!--
  Copyright 2025-2026 miaotouy(Github@miaotouy)

  Licensed under the Apache License, Version 2.0 (the "License");
  you may not use this file except in compliance with the License.
  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->

<script setup lang="ts">
import { ref, shallowRef, onMounted, onUnmounted, nextTick } from "vue";
import {
  EditorView,
  keymap,
  placeholder as cmPlaceholder,
} from "@codemirror/view";
import { EditorState, Compartment, Transaction } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { vscodeLight, vscodeDark } from "@uiw/codemirror-theme-vscode";
import { useTheme } from "@/composables/useTheme";

const { isDark } = useTheme();

const nativeValue = ref("");
const cmValue = ref("");
const cmContainer = ref<HTMLElement>();
const cmView = shallowRef<EditorView>();
const eventLog = ref<
  Array<{ time: string; source: string; type: string; detail: string }>
>([]);
const maxLogs = 300;

let isComposing = false;
let lastEmittedValue = "";
let cmHasFocus = false;

const now = () => {
  const d = new Date();
  return (
    d.getMinutes().toString().padStart(2, "0") +
    ":" +
    d.getSeconds().toString().padStart(2, "0") +
    "." +
    d.getMilliseconds().toString().padStart(3, "0")
  );
};

const addLog = (source: string, type: string, detail: string) => {
  eventLog.value.unshift({ time: now(), source, type, detail });
  if (eventLog.value.length > maxLogs) {
    eventLog.value.length = maxLogs;
  }
};

const clearLogs = () => {
  eventLog.value = [];
};

// ===== 原生 textarea 事件 =====
const onNativeCompositionStart = (e: CompositionEvent) => {
  addLog("ta", "compstart", "data=" + JSON.stringify(e.data));
};
const onNativeCompositionUpdate = (e: CompositionEvent) => {
  addLog("ta", "compupdate", "data=" + JSON.stringify(e.data));
};
const onNativeCompositionEnd = (e: CompositionEvent) => {
  addLog("ta", "compend", "data=" + JSON.stringify(e.data));
};
const onNativeInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement;
  const ie = e as InputEvent;
  addLog(
    "ta",
    "input",
    "type=" +
      JSON.stringify(ie.inputType) +
      " data=" +
      JSON.stringify(ie.data) +
      " len=" +
      target.value.length
  );
  nativeValue.value = target.value;
};
const onNativeKeydown = (e: KeyboardEvent) => {
  if (
    e.key.length === 1 ||
    e.key === "Process" ||
    e.key === "Backspace" ||
    e.key === "Enter"
  ) {
    addLog(
      "ta",
      "keydown",
      "key=" +
        JSON.stringify(e.key) +
        " code=" +
        JSON.stringify(e.code) +
        " isComposing=" +
        e.isComposing
    );
  }
};

// ===== Document 级键盘监听 (capture阶段，比CM6更早) =====
const onDocKeydown = (e: KeyboardEvent) => {
  if (!cmHasFocus) return; // 只在 CM6 有焦点时记录
  if (
    e.key.length === 1 ||
    e.key === "Process" ||
    e.key === "Backspace" ||
    e.key === "Enter"
  ) {
    addLog(
      "doc",
      "keydown-capture",
      "key=" +
        JSON.stringify(e.key) +
        " code=" +
        JSON.stringify(e.code) +
        " isComposing=" +
        e.isComposing +
        " target=" +
        (e.target as HTMLElement)?.tagName
    );
  }
};

const onDocKeyup = (e: KeyboardEvent) => {
  if (!cmHasFocus) return;
  if (
    e.key.length === 1 ||
    e.key === "Process" ||
    e.key === "Backspace" ||
    e.key === "Enter"
  ) {
    addLog(
      "doc",
      "keyup-capture",
      "key=" +
        JSON.stringify(e.key) +
        " code=" +
        JSON.stringify(e.code) +
        " isComposing=" +
        e.isComposing
    );
  }
};

// ===== CodeMirror 初始化 =====
onMounted(() => {
  // 注册 document 级 capture 监听
  document.addEventListener("keydown", onDocKeydown, true);
  document.addEventListener("keyup", onDocKeyup, true);

  if (!cmContainer.value) return;

  const themeConf = new Compartment();

  const state = EditorState.create({
    doc: "",
    extensions: [
      history(),
      keymap.of([...defaultKeymap, ...historyKeymap]),
      markdown(),
      cmPlaceholder("在这里输入中文测试"),
      themeConf.of(isDark.value ? vscodeDark : vscodeLight),
      EditorView.lineWrapping,
      EditorView.theme({
        "&": {
          height: "120px",
          fontSize: "14px",
          fontFamily: "var(--el-font-family)",
          backgroundColor: "var(--input-bg) !important",
        },
        ".cm-scroller": { overflow: "auto" },
        ".cm-content": { padding: "10px 14px", lineHeight: "1.6" },
        "&.cm-focused": { outline: "none" },
        ".cm-gutters": { display: "none" },
      }),

      // === 诊断：inputHandler — CM6 内部准备处理的文本输入 ===
      EditorView.inputHandler.of((_view, from, to, text) => {
        addLog(
          "cm",
          "inputHandler",
          "from=" +
            from +
            " to=" +
            to +
            " text=" +
            JSON.stringify(text) +
            " composing=" +
            isComposing
        );
        return false; // 不拦截，交给默认处理
      }),

      // === 诊断：transactionFilter — 观察所有准备dispatch的transaction ===
      EditorState.transactionFilter.of((tr: Transaction) => {
        if (tr.docChanged) {
          const changes: string[] = [];
          tr.changes.iterChanges((fromA, toA, _fromB, _toB, inserted) => {
            changes.push(
              `[${fromA}-${toA}→"${inserted.toString().slice(0, 20)}"]`
            );
          });
          addLog(
            "cm",
            "txFilter",
            "docChanged changes=" +
              changes.join(",") +
              " annotations=" +
              (tr.annotation(Transaction.userEvent) || "none")
          );
        }
        return tr; // 不拦截
      }),

      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          const newDoc = update.state.doc.toString();
          addLog(
            "cm",
            "docChanged",
            "blocked=" +
              isComposing +
              " doc.length=" +
              newDoc.length +
              " last20=" +
              JSON.stringify(newDoc.slice(-20))
          );
          if (!isComposing) {
            lastEmittedValue = newDoc;
            cmValue.value = newDoc;
          }
        }
      }),
      EditorView.domEventHandlers({
        compositionstart: (e) => {
          isComposing = true;
          const ce = e as CompositionEvent;
          addLog("cm", "compstart", "data=" + JSON.stringify(ce.data));
          return false;
        },
        compositionupdate: (e) => {
          const ce = e as CompositionEvent;
          addLog("cm", "compupdate", "data=" + JSON.stringify(ce.data));
          return false;
        },
        compositionend: (e) => {
          isComposing = false;
          const ce = e as CompositionEvent;
          addLog("cm", "compend", "data=" + JSON.stringify(ce.data));
          nextTick(() => {
            if (!cmView.value) return;
            const currentDoc = cmView.value.state.doc.toString();
            if (currentDoc !== lastEmittedValue) {
              addLog(
                "cm",
                "补emit",
                "doc.length=" +
                  currentDoc.length +
                  " last20=" +
                  JSON.stringify(currentDoc.slice(-20))
              );
              lastEmittedValue = currentDoc;
              cmValue.value = currentDoc;
            } else {
              addLog("cm", "补emit-skip", "值未变");
            }
          });
          return false;
        },
        keydown: (e) => {
          const ke = e as KeyboardEvent;
          if (
            ke.key.length === 1 ||
            ke.key === "Process" ||
            ke.key === "Backspace" ||
            ke.key === "Enter"
          ) {
            addLog(
              "cm",
              "keydown",
              "key=" +
                JSON.stringify(ke.key) +
                " code=" +
                JSON.stringify(ke.code) +
                " isComposing=" +
                ke.isComposing
            );
          }
          return false;
        },
        keyup: (e) => {
          const ke = e as KeyboardEvent;
          if (
            ke.key.length === 1 ||
            ke.key === "Process" ||
            ke.key === "Backspace" ||
            ke.key === "Enter"
          ) {
            addLog(
              "cm",
              "keyup",
              "key=" +
                JSON.stringify(ke.key) +
                " code=" +
                JSON.stringify(ke.code) +
                " isComposing=" +
                ke.isComposing
            );
          }
          return false;
        },
        focus: () => {
          cmHasFocus = true;
          addLog("cm", "focus", "");
          return false;
        },
        blur: () => {
          cmHasFocus = false;
          addLog("cm", "blur", "");
          return false;
        },
        input: (e) => {
          const ie = e as InputEvent;
          addLog(
            "cm",
            "input",
            "type=" +
              JSON.stringify(ie.inputType) +
              " data=" +
              JSON.stringify(ie.data) +
              " isComposing=" +
              (ie as any).isComposing
          );
          return false;
        },
        beforeinput: (e) => {
          const ie = e as InputEvent;
          addLog(
            "cm",
            "beforeinput",
            "type=" +
              JSON.stringify(ie.inputType) +
              " data=" +
              JSON.stringify(ie.data)
          );
          return false;
        },
      }),
    ],
  });

  cmView.value = new EditorView({
    state,
    parent: cmContainer.value,
  });
});

onUnmounted(() => {
  document.removeEventListener("keydown", onDocKeydown, true);
  document.removeEventListener("keyup", onDocKeyup, true);
});
</script>

<template>
  <div class="ime-tester">
    <div class="editors-row">
      <div class="editor-panel">
        <h3>原生 textarea</h3>
        <textarea
          class="native-textarea"
          placeholder="在这里输入中文测试"
          @compositionstart="onNativeCompositionStart"
          @compositionupdate="onNativeCompositionUpdate"
          @compositionend="onNativeCompositionEnd"
          @input="onNativeInput"
          @keydown="onNativeKeydown"
        ></textarea>
        <div class="val">
          <span class="lbl">值 (len={{ nativeValue.length }}):</span>
          <code>{{ nativeValue }}</code>
        </div>
      </div>

      <div class="editor-panel">
        <h3>CodeMirror 6</h3>
        <div ref="cmContainer" class="cm-container"></div>
        <div class="val">
          <span class="lbl">值 (len={{ cmValue.length }}):</span>
          <code>{{ cmValue }}</code>
        </div>
      </div>
    </div>

    <div class="log-panel">
      <div class="log-bar">
        <h3>事件日志 (新→旧)</h3>
        <button class="btn" @click="clearLogs">清空</button>
      </div>
      <div class="log-list">
        <div
          v-for="(log, i) in eventLog"
          :key="i"
          class="entry"
          :class="'s-' + log.source + ' t-' + log.type"
        >
          <span class="c-time">{{ log.time }}</span>
          <span class="c-src">{{ log.source }}</span>
          <span class="c-type">{{ log.type }}</span>
          <span class="c-detail">{{ log.detail }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ime-tester {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 16px;
  padding: 16px;
  box-sizing: border-box;
}

.editors-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.editor-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.editor-panel h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.native-textarea {
  width: 100%;
  height: 120px;
  padding: 10px 14px;
  font-size: 14px;
  font-family: var(--el-font-family);
  line-height: 1.6;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background-color: var(--input-bg);
  color: var(--text-color);
  resize: none;
  outline: none;
  box-sizing: border-box;
}

.native-textarea:focus {
  border-color: var(--primary-color);
}

.cm-container {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.cm-container :deep(.cm-editor) {
  height: 120px;
}

.val {
  font-size: 12px;
  color: var(--text-color-light);
  min-height: 20px;
}

.val .lbl {
  font-weight: 600;
  margin-right: 4px;
}

.val code {
  font-family: monospace;
  background: var(--card-bg);
  padding: 2px 4px;
  border-radius: 3px;
  word-break: break-all;
}

.log-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.log-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.log-bar h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.btn {
  padding: 4px 12px;
  font-size: 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: var(--card-bg);
  color: var(--text-color);
  cursor: pointer;
}

.btn:hover {
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.log-list {
  flex: 1;
  overflow-y: auto;
  font-family: "Consolas", "Monaco", monospace;
  font-size: 11px;
  line-height: 1.5;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 8px;
  box-sizing: border-box;
}

.entry {
  display: flex;
  gap: 8px;
  padding: 2px 0;
  border-bottom: 1px solid
    color-mix(in srgb, var(--border-color) 30%, transparent);
}

.c-time {
  color: var(--text-color-light);
  min-width: 70px;
}

.c-src {
  min-width: 30px;
  font-weight: 600;
}

.s-ta .c-src {
  color: #10b981;
}

.s-cm .c-src {
  color: #3b82f6;
}

.c-type {
  min-width: 120px;
  color: var(--primary-color);
}

.t-compstart .c-type,
.t-compend .c-type {
  color: #f59e0b;
}

.t-补emit .c-type {
  color: #ef4444;
  font-weight: bold;
}

.c-detail {
  color: var(--text-color);
  word-break: break-all;
}
</style>
