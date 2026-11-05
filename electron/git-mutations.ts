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

import type { GitRepository } from "./git-files";
import { numberArg, revision } from "./git-history";
import { openGitTerminal } from "./git-terminal";

export const gitMutationCommands = new Set([
  "git_cherry_pick",
  "git_revert",
  "git_update_commit_message",
  "git_push",
  "git_pull",
  "git_undo_last_commit",
  "git_commit_amend",
  "git_checkout_branch",
  "git_create_branch",
  "git_delete_branch",
  "git_merge_branch",
  "git_create_tag",
  "git_push_tag",
  "git_delete_tag",
  "git_stash_save",
  "git_stash_pop",
  "git_stash_apply",
  "git_stash_drop",
]);
export function gitMessage(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.includes("\0"))
    throw new Error("请填写有效的提交说明");
  return value;
}
function optionalText(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string" || value.includes("\0"))
    throw new Error("Git 文本参数无效");
  return value;
}
function bool(value: unknown, fallback = false): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "boolean") throw new Error("Git 操作选项无效");
  return value;
}
async function refName(
  repo: GitRepository,
  value: unknown,
  type: "heads" | "tags"
) {
  if (
    typeof value !== "string" ||
    !value ||
    value.startsWith("-") ||
    value.includes("\0")
  )
    throw new Error("Git 引用名称无效");
  const checked = await repo.command(
    ["check-ref-format", "refs/" + type + "/" + value],
    true
  );
  if (checked.exitCode !== 0)
    throw new Error("Git 引用名称无效，请检查空格和特殊字符");
  return value;
}
export async function mutateGit(
  repo: GitRepository,
  name: string,
  args: Record<string, unknown>,
  terminal = openGitTerminal
): Promise<unknown> {
  switch (name) {
    case "git_cherry_pick":
    case "git_revert": {
      const hash = await revision(repo, args.hash);
      const action = name === "git_cherry_pick" ? "cherry-pick" : "revert";
      await repo.command([action, "--no-edit", hash]);
      return action === "cherry-pick" ? "成功应用所选提交" : "成功还原所选提交";
    }
    case "git_update_commit_message": {
      const hash = await revision(repo, args.hash);
      const current = await revision(repo, "HEAD");
      if (hash !== current)
        throw new Error("仅支持修改最近一次提交的消息，请选择 HEAD 提交");
      await repo.command(["commit", "--amend", "-m", gitMessage(args.message)]);
      return "成功修改最近一次提交的消息";
    }
    case "git_push":
      await repo.remoteCommand(["push"]);
      break;
    case "git_pull":
      await repo.remoteCommand(["pull", "--no-edit"]);
      break;
    case "git_undo_last_commit":
      await repo.command(["reset", "--soft", "HEAD~1"]);
      break;
    case "git_commit_amend":
      await repo.command(["commit", "--amend", "-m", gitMessage(args.message)]);
      break;
    case "git_checkout_branch": {
      const branch = await refName(repo, args.branchName, "heads");
      await repo.command(["checkout", branch, "--"]);
      break;
    }
    case "git_create_branch": {
      const branch = await refName(repo, args.branchName, "heads"),
        start = optionalText(args.startPoint);
      await repo.command([
        "branch",
        "--",
        branch,
        ...(start ? [await revision(repo, start)] : []),
      ]);
      break;
    }
    case "git_delete_branch": {
      const branch = await refName(repo, args.branchName, "heads"),
        force = bool(args.force);
      await repo.command(["branch", force ? "-D" : "-d", "--", branch]);
      break;
    }
    case "git_merge_branch": {
      const branch = await refName(repo, args.branchName, "heads");
      const output = await repo.command(
        ["merge", "--no-edit", "--", branch],
        true
      );
      const message = [
        output.stdout.toString("utf8").trim(),
        output.stderr.toString("utf8").trim(),
      ]
        .filter(Boolean)
        .join("\n");
      return {
        success: output.exitCode === 0,
        hasConflicts:
          output.exitCode !== 0 &&
          (await repo.command(["ls-files", "--unmerged", "-z"])).stdout.length >
            0,
        message:
          message ||
          (output.exitCode === 0
            ? "分支合并成功"
            : "分支合并失败：退出码 " + output.exitCode),
      };
    }
    case "git_create_tag": {
      const tag = await refName(repo, args.tagName, "tags"),
        message = optionalText(args.message),
        target = optionalText(args.targetHash),
        annotated = bool(args.annotated, message.length > 0);
      await repo.command([
        "tag",
        "--no-sign",
        ...(annotated ? ["-a", "-m", message.trim() ? message : tag] : []),
        "--",
        tag,
        ...(target ? [await revision(repo, target)] : []),
      ]);
      break;
    }
    case "git_push_tag": {
      const tag = await refName(repo, args.tagName, "tags"),
        remote = optionalText(args.remoteName);
      const remotes = (await repo.command(["remote"])).stdout
        .toString("utf8")
        .trim()
        .split("\n");
      if (!remote || remote.startsWith("-") || !remotes.includes(remote))
        throw new Error("请选择已配置的远程仓库");
      const ref = "refs/tags/" + tag;
      await repo.command(["show-ref", "--verify", "--quiet", ref]);
      await repo.remoteCommand([
        "push",
        "--no-follow-tags",
        "--",
        remote,
        ref + ":" + ref,
      ]);
      break;
    }
    case "git_delete_tag":
      await repo.command([
        "tag",
        "-d",
        "--",
        await refName(repo, args.tagName, "tags"),
      ]);
      break;
    case "git_stash_save": {
      const message = optionalText(args.message),
        untracked = bool(args.includeUntracked);
      await repo.command([
        "stash",
        "push",
        ...(untracked ? ["-u"] : []),
        ...(message ? ["-m", message] : []),
      ]);
      break;
    }
    case "git_stash_pop":
    case "git_stash_apply":
    case "git_stash_drop": {
      const action = name.slice("git_stash_".length),
        index = numberArg(args.index, 0);
      await repo.command(["stash", action, "stash@{" + index + "}"]);
      break;
    }
    case "git_open_terminal":
      await terminal(repo.root);
      break;
    default:
      throw new Error("Electron Git 命令尚未接通：" + name);
  }
  return null;
}
