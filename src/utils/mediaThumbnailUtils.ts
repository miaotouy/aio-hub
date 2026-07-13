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

/**
 * 媒体缩略图生成工具
 */

/**
 * 生成视频缩略图
 * @param videoUrl 视频文件的 URL
 * @returns Promise<string> Base64 格式的图片数据
 */
export const generateVideoThumbnail = async (
  videoUrl: string
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.crossOrigin = "anonymous";
    video.src = videoUrl;
    video.muted = true;
    video.preload = "metadata";

    // 设置超时，避免一直卡住
    const timeoutId = setTimeout(() => {
      video.src = "";
      reject(new Error("生成缩略图超时"));
    }, 10000);

    video.onloadedmetadata = () => {
      // 确保截取时间点在视频时长范围内
      // 如果视频超过1秒，取第1秒；否则取中间点
      const time = video.duration > 1 ? 1 : video.duration / 2;
      video.currentTime = time;
    };

    video.onloadeddata = () => {
      // 确保 seek 完成
      if (video.readyState >= 2) {
        capture();
      }
    };

    video.onseeked = capture;

    function capture() {
      clearTimeout(timeoutId);
      try {
        const canvas = document.createElement("canvas");
        // 限制最大尺寸，避免缩略图过大影响性能
        const MAX_SIZE = 400;
        let width = video.videoWidth;
        let height = video.videoHeight;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = height * (MAX_SIZE / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = width * (MAX_SIZE / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        resolve(dataUrl);
      } catch (e) {
        reject(e);
      } finally {
        // 清理
        video.src = "";
        video.load();
      }
    }

    video.onerror = (e) => {
      clearTimeout(timeoutId);
      reject(e);
    };
  });
};
