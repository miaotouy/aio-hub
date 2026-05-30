import type { QuickActionSet } from "../types/quick-action";
import { getLocalISOString } from "@/utils/time";

/**
 * 默认内置的快捷操作组
 */
export const DEFAULT_QUICK_ACTION_SETS: QuickActionSet[] = [
  {
    id: "qa-code-helper",
    name: "代码助手",
    description: "优化代码交流的快捷操作",
    isEnabled: true,
    updatedAt: getLocalISOString(),
    actions: [
      {
        id: "wrap-hidden-code",
        label: "包入隐藏代码块",
        content: "<!--\n```\n{{input}}\n```\n-->\n\n\n",
        autoSend: false,
      },
      {
        id: "append-hidden-code",
        label: "追加隐藏代码块",
        content: "{{input}}\n\n<!--\n```\n\n```\n-->\n\n\n",
        autoSend: false,
      },
      {
        id: "full-code-update",
        label: "完整代码",
        content:
          "{{input}}\n\n合并更新刚才讨论的内容到对应的最新完整版本，让我一键复制。",
        autoSend: true,
      },
    ],
  },
  {
    id: "qa-common-tools",
    name: "通用工具",
    description: "常用文本包装工具",
    isEnabled: true,
    updatedAt: getLocalISOString(),
    actions: [
      {
        id: "html-details",
        label: "HTML 折叠",
        content:
          '<details data-variant="card">\n<summary>点击展开内容</summary>\n\n{{input}}\n\n</details>',
        autoSend: false,
      },
      {
        id: "html-details-scroll",
        label: "长内容折叠",
        content:
          '<details data-variant="card" data-tone="info" data-max-height="400">\n<summary>点击展开内容</summary>\n\n{{input}}\n\n</details>',
        autoSend: false,
      },
      {
        id: "quote-text",
        label: "引用",
        content: "{{input}}",
        autoSend: false,
        lineProcessing: {
          enabled: true,
          prefix: ">",
          suffix: "",
          regexPattern: "",
          regexReplace: "",
          regexFlags: "g",
        },
      },
      {
        id: "action-code-block",
        label: "代码块",
        content: "```\n{{input}}\n\n```\n",
        autoSend: false,
      },
      {
        id: "action-forward-msg",
        label: "转发消息",
        content:
          '\n<details data-variant="card" data-max-height="400">\n<summary>转发的消息</summary>\n\n{{input}}\n\n---转发结束---\n</details>\n',
        autoSend: false,
      },
    ],
  },
];
