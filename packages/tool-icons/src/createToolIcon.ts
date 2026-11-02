import { h, type FunctionalComponent, type SVGAttributes } from "vue";

/** 图标只使用线性描边的基本图形，与 Lucide 体系保持一致 */
export type ToolIconElement =
  | "path"
  | "rect"
  | "circle"
  | "ellipse"
  | "line"
  | "polyline"
  | "polygon";

export type ToolIconNode = Array<
  [element: ToolIconElement, attrs: Record<string, string | number>]
>;

/** 与 lucide-vue-next 相同的调用参数，便于在现有调用处直接替换 */
export interface ToolIconProps extends Partial<SVGAttributes> {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

export type ToolIconComponent = FunctionalComponent<ToolIconProps>;

const DEFAULT_SIZE = 24;
const DEFAULT_STROKE_WIDTH = 2;

/** 模板里写成 `<Icon absolute-stroke-width />` 时值为空字符串 */
function isEnabledFlag(value: unknown): boolean {
  return value === true || value === "";
}

function hasA11yAttr(attrs: Record<string, unknown>): boolean {
  return Object.keys(attrs).some(
    (key) => key.startsWith("aria-") || key === "role" || key === "title"
  );
}

function toPascalCase(name: string): string {
  return name.replace(/(^|-)([a-z0-9])/g, (_, __, char: string) =>
    char.toUpperCase()
  );
}

/**
 * 创建 24 × 24 网格的线性图标组件。
 * 尺寸、颜色和线宽参数与 Lucide 一致；未传 aria 属性时视为装饰图标。
 */
export function createToolIcon(
  iconName: string,
  iconNode: ToolIconNode
): ToolIconComponent {
  const Icon = (rawProps: ToolIconProps) => {
    const {
      size = DEFAULT_SIZE,
      color = "currentColor",
      strokeWidth,
      "stroke-width": strokeWidthKebab,
      absoluteStrokeWidth,
      "absolute-stroke-width": absoluteStrokeWidthKebab,
      class: className,
      ...rest
    } = rawProps as ToolIconProps & Record<string, unknown>;

    const baseStrokeWidth = Number(
      strokeWidth ?? strokeWidthKebab ?? DEFAULT_STROKE_WIDTH
    );
    const numericSize = Number(size);
    const useAbsoluteStroke =
      (isEnabledFlag(absoluteStrokeWidth) ||
        isEnabledFlag(absoluteStrokeWidthKebab)) &&
      Number.isFinite(numericSize) &&
      numericSize > 0;

    return h(
      "svg",
      {
        xmlns: "http://www.w3.org/2000/svg",
        viewBox: "0 0 24 24",
        fill: "none",
        "stroke-linecap": "round",
        "stroke-linejoin": "round",
        ...rest,
        width: size,
        height: size,
        stroke: color,
        "stroke-width": useAbsoluteStroke
          ? (baseStrokeWidth * 24) / numericSize
          : baseStrokeWidth,
        class: ["aiohub-icon", `aiohub-icon-${iconName}`, className],
        ...(hasA11yAttr(rest) ? {} : { "aria-hidden": "true" }),
      },
      iconNode.map(([element, attrs]) => h(element, attrs))
    );
  };

  const component = Icon as ToolIconComponent;
  component.displayName = `${toPascalCase(iconName)}Icon`;
  // class、style 和事件已在上面合并到 svg，关闭函数式组件的自动透传，避免 class 重复
  component.inheritAttrs = false;
  return component;
}
