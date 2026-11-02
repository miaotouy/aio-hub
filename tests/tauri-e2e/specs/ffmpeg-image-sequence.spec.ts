import { $, $$, browser, expect } from "@wdio/globals";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { selectNativeFiles } from "../support/native-ui";

const nativeDescribe =
  process.env.AIO_E2E_NATIVE_UI === "1" ? describe : describe.skip;

// 真实文件对话框、目录读取、IPC 和多输入合成共同保护序列输出契约。
nativeDescribe("FFmpeg image sequence composition", () => {
  const ffmpeg = process.env.AIO_E2E_FFMPEG_BIN || "ffmpeg";
  const ffprobe = process.env.AIO_E2E_FFPROBE_BIN || "ffprobe";
  const fixtureDir = path.join(
    process.env.AIO_E2E_ARTIFACT_DIR!,
    "sequence-fixtures"
  );
  const imageDir = path.join(fixtureDir, "100% 中文 render's");
  const audioVideo = path.join(fixtureDir, "配音视频.mp4");
  const shortAudio = path.join(fixtureDir, "短音频.wav");
  let appPid = 0;

  function run(args: string[]) {
    execFileSync(
      ffmpeg,
      ["-hide_banner", "-loglevel", "error", "-y", ...args],
      { encoding: "utf8", windowsHide: true }
    );
  }

  before(async () => {
    fs.mkdirSync(imageDir, { recursive: true });
    run([
      "-f",
      "lavfi",
      "-i",
      "testsrc=size=161x91:rate=6:duration=2",
      "-start_number",
      "100",
      "-frames:v",
      "12",
      path.join(imageDir.replace(/%/g, "%%"), "render_%04d.png"),
    ]);
    run([
      "-f",
      "lavfi",
      "-i",
      "color=c=red:size=64x64:rate=6:duration=4",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=4",
      "-c:v",
      "libx264",
      "-c:a",
      "aac",
      audioVideo,
    ]);
    run(["-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", shortAudio]);
    await $("body").waitForExist();
    await $(".el-main").waitForDisplayed({ timeout: 30_000 });
    await browser.execute(() => {
      const button =
        document.querySelector<HTMLElement>(
          '[data-testid="guided-flow-close"]'
        ) ??
        document.querySelector<HTMLElement>('[data-testid="guided-flow-skip"]');
      button?.click();
      window.history.pushState({}, "", "/ffmpeg-tools");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await $("#tab-sequence").waitForDisplayed({ timeout: 30_000 });
    await $("#tab-sequence").click();
    await $(".sequence-workspace").waitForDisplayed();
    appPid = await browser.executeAsync((done: (value: number) => void) => {
      const internals = (
        window as unknown as {
          __TAURI_INTERNALS__: { invoke<T>(command: string): Promise<T> };
        }
      ).__TAURI_INTERNALS__;
      void internals.invoke<number>("wa_get_self_pid").then(done);
    });

    await browser.saveScreenshot(path.join(fixtureDir, "empty-workspace.png"));
    await $("button=选择其中一帧").click();
    const selection = selectNativeFiles(
      [path.join(imageDir, "render_0103.png")],
      appPid
    );
    if (!selection.success)
      throw new Error(selection.error || "Image selection failed");
    await browser.waitUntil(
      async () =>
        (await $(".sequence-config .el-select").getText()).includes("12 帧"),
      { timeout: 20_000 }
    );
    const numberInputs = await $$(".sequence-config .el-input-number input");
    expect(await numberInputs[0].getValue()).toBe("100");
    expect(await numberInputs[1].getValue()).toBe("111");
    await numberInputs[2].setValue("6");
    await browser.keys("Tab");
    await $(".preview-stage img").waitForDisplayed();
    await browser.saveScreenshot(path.join(fixtureDir, "sequence-preview.png"));
  });

  for (const [name, audio] of [
    ["video-audio", audioVideo],
    ["short-audio", shortAudio],
    ["silent", ""],
  ]) {
    it(`合成 ${name} 并保留完整帧数与画面时长`, async () => {
      const clear = await $("button=清除");
      if (await clear.isExisting()) await clear.click();
      if (audio) {
        await $(".sequence-config").$("button=选择").click();
        const selection = selectNativeFiles([audio], appPid);
        if (!selection.success)
          throw new Error(selection.error || "Audio selection failed");
        const audioField = await $(".sequence-config .audio-input input");
        await browser.waitUntil(
          async () => (await audioField.getValue()) === audio,
          { timeout: 20_000 }
        );
      }
      const outputPath = path.join(fixtureDir, `${name}.mp4`);
      const outputs = await $$(".sequence-config .audio-input input");
      await outputs[1].setValue(outputPath);
      await $("button=开始合成").click();
      await browser.waitUntil(
        async () => {
          const feedback = await $(".task-heading");
          return (
            (await feedback.isExisting()) &&
            (await feedback.getText()).includes("合成完成")
          );
        },
        { timeout: 30_000, timeoutMsg: "Sequence composition did not finish" }
      );
      const info = JSON.parse(
        execFileSync(
          ffprobe,
          [
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_type,width,height,nb_frames,duration",
            "-of",
            "json",
            outputPath,
          ],
          { encoding: "utf8", windowsHide: true }
        )
      );
      const video = info.streams.find(
        (s: { codec_type: string }) => s.codec_type === "video"
      );
      const audioStream = info.streams.find(
        (s: { codec_type: string }) => s.codec_type === "audio"
      );
      expect(Number(video.nb_frames)).toBe(12);
      expect(video.width).toBe(162);
      expect(video.height).toBe(92);
      expect(!!audioStream).toBe(!!audio);
      expect(Math.abs(Number(info.format.duration) - 2)).toBeLessThan(0.15);
      if (audioStream)
        expect(Math.abs(Number(audioStream.duration) - 2)).toBeLessThan(0.15);
      // 外部视频的红色 64×64 画面无法替代 162×92 的序列输入。
      await browser.saveScreenshot(
        path.join(fixtureDir, `${name}-complete.png`)
      );
    });
  }
});
