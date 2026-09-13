// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/**
 * 字幕通用动作：复制全部 / 发送到 Chat / 导出 SRT / 清空。
 * 屏幕模式与视频模式复用同一实现，各自传入自己的字幕 store。
 */

import { ElMessageBox } from "element-plus";
import { customMessage } from "@/utils/customMessage";
import { useSendToChat } from "@/composables/useSendToChat";
import type { SubtitleTimelineStore } from "./useSubtitleTimelineStore";

export function useSubtitleActions(timeline: SubtitleTimelineStore) {
  const { sendToChat: send } = useSendToChat();

  function copyAll(withTime = false) {
    const text = withTime
      ? timeline.exportTextWithTime()
      : timeline.exportPlainText();
    if (!text) {
      customMessage.warning("暂无字幕可复制");
      return;
    }
    navigator.clipboard
      .writeText(text)
      .then(() =>
        customMessage.success(
          withTime ? "已复制全部字幕(带时间)" : "已复制全部字幕"
        )
      )
      .catch(() => customMessage.error("复制失败"));
  }

  function sendToChat(withTime = false) {
    const text = withTime
      ? timeline.exportTextWithTime()
      : timeline.exportPlainText();
    if (!text) {
      customMessage.warning("暂无字幕可发送");
      return;
    }
    send(text, {
      successMessage: withTime
        ? "已发送带时间字幕到聊天输入框"
        : "已发送纯文本字幕到聊天输入框",
    });
  }

  function exportSrt() {
    if (!timeline.subtitles.value.length) {
      customMessage.warning("暂无字幕可导出");
      return;
    }
    timeline.downloadSrt(`subtitles-${Date.now()}.srt`);
    customMessage.success("SRT 已导出");
  }

  /** 确认后清空；返回是否实际清空（供调用方重置选中态）。 */
  async function clearAll(): Promise<boolean> {
    try {
      await ElMessageBox.confirm(
        "确定要清空所有字幕吗？此操作不可撤销。",
        "提示",
        {
          confirmButtonText: "确定",
          cancelButtonText: "取消",
          type: "warning",
          lockScroll: false,
        }
      );
      timeline.clearSubtitles();
      customMessage.success("已清空所有字幕");
      return true;
    } catch {
      // 取消
      return false;
    }
  }

  return { copyAll, sendToChat, exportSrt, clearAll };
}
