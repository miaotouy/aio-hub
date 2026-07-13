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

import type {
  ToolConfig,
  ToolRegistry,
  ServiceMetadata,
} from "@/services/types";
import type { SettingItem } from "@/types/settings-renderer";
import { markRaw } from "vue";
import { FileCog } from "lucide-vue-next";
import * as actions from "./actions";
import { parseAgentBoolean } from "@/utils/agentArgs";

export const toolConfig: ToolConfig = {
  name: "本地文件操作器",
  path: "/aio-file-operator",
  icon: markRaw(FileCog),
  component: () => import("./AioFileOperator.vue"),
  description: "本地文件安全读写、目录管理与差异修改工具",
  category: ["系统工具", "AI 工具"],
  version: "1.0.0",
};

export class AioFileOperatorRegistry implements ToolRegistry {
  public readonly id = "aio-file-operator";
  public readonly name = "本地文件操作器";
  public readonly description = "本地文件安全读写、目录管理与差异修改工具";

  public readonly settingsSchema: SettingItem[] = [
    {
      id: "file-operator-allowed-dirs",
      label: "允许访问的沙箱目录",
      component: "ElInput",
      modelPath: "allowedDirectories",
      hint: "允许 AI 访问的本地绝对路径列表，多个路径用英文逗号或换行分隔。留空则默认允许桌面、文档、下载目录。",
      keywords: "文件 沙箱 目录 路径 安全",
      defaultValue: "",
      props: {
        type: "textarea",
        rows: 3,
        placeholder: "例如: C:/Users/Username/Desktop, D:/Projects",
      },
    },
    {
      id: "file-operator-max-size",
      label: "最大允许读取文件大小 (MB)",
      component: "ElInputNumber",
      modelPath: "maxFileSize",
      hint: "防止 AI 读取超大文件导致内存溢出或前端卡死",
      keywords: "文件 大小 限制 max size",
      defaultValue: 10,
      props: { min: 1, max: 100, step: 1 },
    },
    {
      id: "file-operator-enable-log",
      label: "启用操作审计日志",
      component: "ElSwitch",
      modelPath: "enableAuditLog",
      hint: "启用后，将记录 AI 调用此工具的所有操作历史，便于安全审计",
      keywords: "文件 审计 日志 历史 log",
      defaultValue: true,
    },
    {
      id: "file-operator-overwrite-policy",
      label: "文件覆盖策略",
      component: "ElSelect",
      modelPath: "overwritePolicy",
      hint: "当写入的文件已存在时，如何处理覆盖行为。'遵循 Agent 传参' 表示由 AI 决定是否覆盖；'总是覆盖' 表示无条件覆盖；'从不覆盖' 表示自动累加序号（如 report(1).txt）。",
      keywords: "文件 覆盖 写入 安全 overwrite policy",
      defaultValue: "follow",
      props: {
        options: [
          { label: "遵循 Agent 传参", value: "follow" },
          { label: "总是覆盖", value: "always" },
          { label: "从不覆盖 (自动累加序号)", value: "never" },
        ],
      },
    },
  ];

  public initialize(): void {
    // 初始化时，从本地存储或配置中加载设置并应用到 actions
    // 实际的配置同步会由 settings-renderer 自动处理
  }

  public getMetadata(): ServiceMetadata {
    return {
      methods: [
        {
          name: "read_file",
          displayName: "读取文件",
          description:
            "读取本地文本文件内容。支持普通文本、Word (.docx)、PDF (.pdf) 和 CSV 文件。读取前会自动校验路径安全和大文件限制。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地文件的绝对路径",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "write_file",
          displayName: "安全写入文件",
          description:
            "安全地将内容写入本地文件。如果文件已存在，会根据覆盖策略或 allowOverwrite 参数决定是覆盖还是自动在文件名后累加序号（如 report(1).txt）。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地文件的绝对路径",
            },
            {
              name: "content",
              type: "string",
              required: true,
              description: "要写入的文件内容",
            },
            {
              name: "allowOverwrite",
              type: "boolean",
              required: false,
              description:
                "是否允许覆盖已有文件。若为 false，文件已存在时会自动累加序号（如 report(1).txt）",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "append_file",
          displayName: "追加内容到文件",
          description:
            "将文本内容追加到已有文件的末尾。如果文件不存在则会自动创建。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地文件的绝对路径",
            },
            {
              name: "content",
              type: "string",
              required: true,
              description: "要追加的文本内容",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "delete_file",
          displayName: "安全删除文件",
          description:
            "安全地删除本地文件。文件不会被物理粉碎，而是会被移入系统回收站，给用户留有恢复余地。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地文件的绝对路径",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "list_directory",
          displayName: "列出目录内容",
          description:
            "获取指定目录下的文件和子目录列表，包含每个条目的详细元数据（大小、修改时间、是否为目录等）。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地目录的绝对路径",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "apply_diff",
          displayName: "应用差异修改 (Diff)",
          description:
            "使用 Search/Replace 块模式对本地文件进行精确的局部修改。支持换行符智能归一化、缩进自动修复和模糊匹配。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地文件的绝对路径",
            },
            {
              name: "search",
              type: "string",
              required: true,
              description:
                "要查找的原始代码/文本块（必须与原文件内容逻辑一致）",
            },
            {
              name: "replace",
              type: "string",
              required: true,
              description: "要替换成的新代码/文本块",
            },
            {
              name: "startLine",
              type: "number",
              required: false,
              description:
                "搜索起始行号提示（1-based），用于缩小搜索范围和重复消歧义",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "create_directory",
          displayName: "创建目录",
          description:
            "在本地创建新目录。如果父目录不存在，会自动递归创建所有父目录。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地目录的绝对路径",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
        {
          name: "path_exists",
          displayName: "检查路径是否存在",
          description: "检查指定的本地文件或目录路径在物理磁盘上是否存在。",
          parameters: [
            {
              name: "path",
              type: "string",
              required: true,
              description: "本地路径的绝对路径",
            },
          ],
          returnType: "Promise<FileOperationResult>",
          agentCallable: true,
        },
      ],
    };
  }

  // ==================== Security Policy Hook ====================

  public async checkSecurityPolicy(
    methodName: string,
    args: Record<string, any>
  ) {
    const { getConfig } = await import("./actions");
    const { checkSecurityPolicy } = await import("./utils/security");
    const config = await getConfig();
    return checkSecurityPolicy(methodName, args, config);
  }

  // ==================== Agent Callable Methods ====================

  public async read_file(args: { path: string }) {
    return await actions.readFile(args.path);
  }

  public async write_file(args: {
    path: string;
    content: string;
    allowOverwrite?: unknown;
  }) {
    const allowOverwrite = parseAgentBoolean(args.allowOverwrite);
    return await actions.writeFile(args.path, args.content, allowOverwrite);
  }

  public async append_file(args: { path: string; content: string }) {
    return await actions.appendFile(args.path, args.content);
  }

  public async delete_file(args: { path: string }) {
    return await actions.deleteFile(args.path);
  }

  public async list_directory(args: { path: string }) {
    return await actions.listDirectory(args.path);
  }

  public async apply_diff(args: {
    path: string;
    search: string;
    replace: string;
    startLine?: number;
  }) {
    return await actions.applyDiff(
      args.path,
      args.search,
      args.replace,
      args.startLine
    );
  }

  public async create_directory(args: { path: string }) {
    return await actions.createDirectory(args.path);
  }

  public async path_exists(args: { path: string }) {
    return await actions.pathExists(args.path);
  }
}

export default AioFileOperatorRegistry;
