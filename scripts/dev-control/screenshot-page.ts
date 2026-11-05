import type { ControlTarget } from "./protocol";

/** Pure page helper. CSS/testid locators keep the embedded transport deterministic. */
export function resolveDomRoot(target?: ControlTarget): Element {
  if (!target) return document.body;
  const fail = (code: string, message: string): never => {
    throw Object.assign(new Error(message), { code });
  };
  if (target.role || target.label)
    fail(
      "UNSUPPORTED_CAPABILITY",
      "Linux 定位请使用 inspect 返回的 css 或 testid。"
    );
  let scope: Document | Element = document;
  if (target.scope) {
    const scopes = document.querySelectorAll(target.scope);
    if (scopes.length !== 1)
      fail(
        scopes.length ? "TARGET_AMBIGUOUS" : "TARGET_NOT_FOUND",
        "scope 需要唯一匹配。"
      );
    scope = scopes[0];
  }
  const elements = target.testid
    ? Array.from(scope.querySelectorAll("[data-testid]")).filter(
        (el) => el.getAttribute("data-testid") === target.testid
      )
    : target.placeholder
      ? Array.from(scope.querySelectorAll("input,textarea")).filter((el) =>
          target.exact === false
            ? el.getAttribute("placeholder")?.includes(target.placeholder!)
            : el.getAttribute("placeholder") === target.placeholder
        )
      : Array.from(scope.querySelectorAll(target.css!));
  if (elements.length !== 1)
    fail(
      elements.length ? "TARGET_AMBIGUOUS" : "TARGET_NOT_FOUND",
      "目标需要唯一匹配。"
    );
  return elements[0];
}

export function screenshotPlan(input: {
  target?: ControlTarget;
  mask?: string[];
}) {
  const rect = (el: Element) => {
    const r = el.getBoundingClientRect();
    const left = Math.max(0, r.left),
      top = Math.max(0, r.top);
    return {
      x: left,
      y: top,
      width: Math.max(0, Math.min(innerWidth, r.right) - left),
      height: Math.max(0, Math.min(innerHeight, r.bottom) - top),
    };
  };
  const crop = input.target
    ? rect(resolveDomRoot(input.target))
    : { x: 0, y: 0, width: innerWidth, height: innerHeight };
  if (!crop.width || !crop.height)
    throw Object.assign(new Error("截图区域不在当前视口内。"), {
      code: "TARGET_HIDDEN",
    });
  const masks = [
    ...new Set(
      [
        'input[type="password"]',
        "[data-dev-sensitive]",
        ...(input.mask ?? []),
      ].flatMap((selector) => Array.from(document.querySelectorAll(selector)))
    ),
  ]
    .filter(
      (el) =>
        getComputedStyle(el).visibility !== "hidden" &&
        getComputedStyle(el).display !== "none"
    )
    .map(rect)
    .filter((r) => r.width && r.height);
  return { viewport: { width: innerWidth, height: innerHeight }, crop, masks };
}

/** Redact in memory before anything is written to disk; works with native WebKit snapshots. */
export async function redactScreenshot(input: {
  png: string;
  plan: ReturnType<typeof screenshotPlan>;
}): Promise<string> {
  const image = new Image();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("无法解码原生截图。"));
    image.src = "data:image/png;base64," + input.png;
  });
  const { viewport, crop, masks } = input.plan;
  const sx = image.naturalWidth / viewport.width,
    sy = image.naturalHeight / viewport.height;
  if (
    !Number.isFinite(sx) ||
    !Number.isFinite(sy) ||
    sx <= 0 ||
    sy <= 0 ||
    Math.abs(sx - sy) > 0.02
  )
    throw new Error("原生截图与视口比例不匹配，已中止保存。");
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("截图脱敏画布不可用。");
  ctx.drawImage(image, 0, 0);
  ctx.fillStyle = "#000";
  for (const r of masks) {
    // Expand outwards to cover subpixel edges.
    const x = Math.floor(r.x * sx),
      y = Math.floor(r.y * sy);
    ctx.fillRect(
      x,
      y,
      Math.ceil((r.x + r.width) * sx) - x,
      Math.ceil((r.y + r.height) * sy) - y
    );
  }
  const output = document.createElement("canvas");
  const x = Math.floor(crop.x * sx),
    y = Math.floor(crop.y * sy);
  output.width = Math.ceil((crop.x + crop.width) * sx) - x;
  output.height = Math.ceil((crop.y + crop.height) * sy) - y;
  const target = output.getContext("2d");
  if (!target) throw new Error("截图裁切画布不可用。");
  target.drawImage(
    canvas,
    x,
    y,
    output.width,
    output.height,
    0,
    0,
    output.width,
    output.height
  );
  return output.toDataURL("image/png").split(",")[1];
}
