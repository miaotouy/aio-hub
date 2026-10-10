// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

export const SEQUENCE_IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "tif",
  "tiff",
  "bmp",
  "webp",
  "exr",
];

export interface ImageSequence {
  pattern: string;
  prefix: string;
  suffix: string;
  padding: number;
  frames: { number: number; name: string }[];
}

export interface ImageSequenceInput {
  directory: string;
  sequence: ImageSequence;
  startFrame: number;
  endFrame: number;
  frameRate: number;
  audioPath?: string;
}

/** 根据文件名末尾的编号识别序列；保留不同视角、扩展名和补零规则。 */
export function discoverImageSequences(names: string[]): ImageSequence[] {
  const groups = new Map<
    string,
    {
      prefix: string;
      suffix: string;
      entries: { number: number; name: string; digits: string }[];
    }
  >();
  for (const name of names) {
    const dot = name.lastIndexOf(".");
    if (
      dot < 0 ||
      !SEQUENCE_IMAGE_EXTENSIONS.includes(name.slice(dot + 1).toLowerCase())
    )
      continue;
    const match = /^(.*?)(\d+)(\D*)$/.exec(name.slice(0, dot));
    if (!match) continue;
    const number = Number(match[2]);
    if (!Number.isSafeInteger(number) || number > 2147483647) continue;
    const prefix = match[1];
    const suffix = match[3] + name.slice(dot);
    const key = JSON.stringify([prefix, suffix]);
    let group = groups.get(key);
    if (!group) {
      group = { prefix, suffix, entries: [] };
      groups.set(key, group);
    }
    group.entries.push({ number, name, digits: match[2] });
  }

  const result: ImageSequence[] = [];
  for (const { prefix, suffix, entries } of groups.values()) {
    const widths = [
      ...new Set(
        entries
          .filter((e) => e.digits.length > 1 && e.digits.startsWith("0"))
          .map((e) => e.digits.length)
      ),
    ].sort((a, b) => b - a);
    const used = new Set<string>();
    for (const padding of [...widths, 0]) {
      const frames = entries
        .filter(
          (e) =>
            !used.has(e.name) &&
            e.digits === String(e.number).padStart(padding, "0")
        )
        .sort((a, b) => a.number - b.number);
      if (!frames.length) continue;
      for (const frame of frames) used.add(frame.name);
      result.push({
        prefix,
        suffix,
        padding,
        pattern: `${prefix.replace(/%/g, "%%")}%${padding ? `0${padding}` : ""}d${suffix.replace(/%/g, "%%")}`,
        frames: frames.map(({ number, name }) => ({ number, name })),
      });
    }
  }
  return result.sort((a, b) => a.pattern.localeCompare(b.pattern));
}

/** 在提交和预览时共用同一范围校验，避免 image2 遇到缺帧提前停止。 */
export function getImageSequenceRange(
  sequence: ImageSequence,
  start: number,
  end: number
) {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > 2147483647
  ) {
    throw new Error("请输入有效的起止帧编号，结束帧应大于或等于起始帧");
  }
  const frames = sequence.frames.filter(
    (frame) => frame.number >= start && frame.number <= end
  );
  const missing: number[] = [];
  let expected = start;
  for (const frame of frames) {
    while (expected < frame.number && missing.length < 8)
      missing.push(expected++);
    expected = frame.number + 1;
  }
  while (expected <= end && missing.length < 8) missing.push(expected++);
  if (missing.length) {
    const missingCount = end - start + 1 - frames.length;
    throw new Error(
      `选定范围缺少 ${missingCount} 帧：${missing.join("、")}${missingCount > missing.length ? "…" : ""}。请补齐文件或调整帧范围`
    );
  }
  return { frameCount: frames.length, firstFileName: frames[0].name };
}

export function joinSequencePath(directory: string, name: string): string {
  return `${directory.replace(/[\\/]+$/, "")}/${name}`;
}
