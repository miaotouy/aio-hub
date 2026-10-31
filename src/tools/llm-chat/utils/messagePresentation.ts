// Copyright 2025-2026 miaotouy(Github@miaotouy)
import type { ChatMessageNode } from "../types";
import { resolveMessageDisplayStatus } from "./messageStatus";

export interface MessageNavigationPoint {
  id: string;
  anchorNodeId: string;
  label: string;
  startNodeId: string;
  endNodeId: string;
}
export interface MessagePresentationGroup {
  id: string;
  members: ChatMessageNode[];
  actor: ChatMessageNode;
  activityNode?: ChatMessageNode;
}
export interface MessagePresentationRow {
  groupId: string;
  first: boolean;
  last: boolean;
  grouped: boolean;
  layoutKey: string;
}

function boundary(message: ChatMessageNode) {
  const m = message.metadata;
  return !!(
    m?.isCompressionNode ||
    m?.isPresetDisplay ||
    m?.isGreeting ||
    message.knowledgeReference ||
    m?.knowledgeReferenceUserMessageId
  );
}
function actorKey(message: ChatMessageNode) {
  const m = message.metadata;
  const o = m?.origin;
  return JSON.stringify([
    m?.agentId,
    m?.agentDisplayName ?? m?.agentName,
    m?.modelId ?? m?.modelName,
    m?.profileId ?? m?.profileName,
    o?.kind,
    o?.actorId,
    o?.channel,
    o?.taskId,
    o?.parentTaskId,
  ]);
}
function ownsTool(group: MessagePresentationGroup, tool: ChatMessageNode) {
  const m = tool.metadata;
  if (m?.knowledgeReferenceRequestId) return false;
  const o = m?.origin;
  const a = group.actor.metadata?.origin;
  if (o && (o.taskId !== a?.taskId || o.channel !== a?.channel)) return false;
  const ids = [
    m?.toolCall?.requestId,
    ...(m?.toolCalls ?? []).map((t) => t.requestId),
  ].filter(Boolean);
  return group.members.some(
    (member) =>
      member.role === "assistant" &&
      ((!!m?.vcpResponse?.requestId &&
        member.metadata?.vcpResponse?.requestId === m.vcpResponse.requestId) ||
        (member.metadata?.toolCallsRequested ?? []).some((call) =>
          ids.includes(call.requestId)
        ))
  );
}
function isQuestion(message: ChatMessageNode) {
  if (
    message.role !== "user" ||
    message.metadata?.isPresetDisplay ||
    message.metadata?.isCompressionNode ||
    message.metadata?.isGreeting
  )
    return false;
  const origin = message.metadata?.origin;
  return (
    !origin ||
    (origin.kind === "user" &&
      (origin.channel === "main_chat" ||
        origin.channel === "user_intervention"))
  );
}
function questionLabel(message: ChatMessageNode) {
  return (
    message.content.replace(/\s+/g, " ").trim().slice(0, 160) ||
    message.attachments
      ?.map((a) => a.name)
      .filter(Boolean)
      .join("、") ||
    "用户提问"
  );
}

/** 展示投影保留源节点身份；分组只表达身份连续性，不能充当执行轮次。 */
export function projectMessagePresentation(
  messages: ChatMessageNode[],
  compact: boolean
) {
  const groups: MessagePresentationGroup[] = [];
  for (const message of messages) {
    const previous = groups[groups.length - 1];
    const last = previous?.members[previous.members.length - 1];
    let join = false;
    if (compact && previous && last && !boundary(message) && !boundary(last)) {
      if (message.role === "assistant" && previous.actor.role === "assistant") {
        join =
          message.parentId === last.id &&
          actorKey(message) === actorKey(previous.actor);
      } else if (
        message.role === "tool" &&
        previous.actor.role === "assistant"
      ) {
        join = message.parentId === last.id && ownsTool(previous, message);
      } else if (message.role === "user" && last.role === "user") {
        join =
          isQuestion(message) &&
          isQuestion(last) &&
          message.parentId === last.id &&
          message.metadata?.userProfileId === last.metadata?.userProfileId &&
          JSON.stringify(message.metadata?.origin) ===
            JSON.stringify(last.metadata?.origin);
      }
    }
    if (join) previous!.members.push(message);
    else groups.push({ id: message.id, actor: message, members: [message] });
  }
  const rows = new Map<string, MessagePresentationRow>();
  const groupById = new Map(groups.map((group) => [group.id, group]));
  for (const group of groups) {
    group.activityNode = [...group.members].reverse().find((member) => {
      const status = resolveMessageDisplayStatus(member);
      return (
        status === "generating" || status === "waiting" || status === "queued"
      );
    });
    group.members.forEach((member, i) => {
      const first = i === 0;
      const last = i === group.members.length - 1;
      const grouped = compact && group.members.length > 1;
      rows.set(member.id, {
        groupId: group.id,
        first,
        last,
        grouped,
        layoutKey: JSON.stringify([
          compact,
          first,
          last,
          grouped,
          compact && first && group.activityNode
            ? [
                group.activityNode.id,
                resolveMessageDisplayStatus(group.activityNode),
              ]
            : null,
          compact && grouped && last
            ? group.members.map((m) => [
                m.id,
                m.metadata?.contentTokens,
                m.metadata?.usage,
                m.metadata?.tokensPerSecond,
                m.metadata?.requestEndTime,
              ])
            : null,
        ]),
      });
    });
  }
  const navigationPoints: MessageNavigationPoint[] = [];
  const navigationByNodeId = new Map<string, number>();
  for (const [messageIndex, message] of messages.entries()) {
    const row = rows.get(message.id)!;
    const question = compact
      ? isQuestion(message) && row.first
      : message.role !== "tool" && !message.metadata?.isCompressionNode;
    if (question || (!navigationPoints.length && !isQuestion(message))) {
      const previous = navigationPoints[navigationPoints.length - 1];
      if (previous) previous.endNodeId = messages[messageIndex - 1].id;
      navigationPoints.push({
        id: message.id,
        anchorNodeId: message.id,
        label: question ? questionLabel(message) : "开场消息",
        startNodeId: message.id,
        endNodeId: message.id,
      });
    }
    const index = navigationPoints.length - 1;
    if (index >= 0) {
      navigationPoints[index].endNodeId = message.id;
      navigationByNodeId.set(message.id, index);
    }
  }
  return { groups, groupById, rows, navigationPoints, navigationByNodeId };
}
