/** Dynamic targets locate history; placeholder targets locate preset cards. */
export const DYNAMIC_MESSAGE_ANCHORS = [
  { id: "last_user", name: "最后一条用户消息", role: "user" },
  { id: "last_assistant", name: "最后一条 AI 消息", role: "assistant" },
  { id: "last_message", name: "最后一条消息", role: undefined },
] as const;

export function isDynamicMessageAnchor(id: string | undefined): boolean {
  return DYNAMIC_MESSAGE_ANCHORS.some((anchor) => anchor.id === id);
}

export interface HistoryInjectionStrategy {
  type?: "default" | "depth" | "advanced_depth" | "anchor";
  depth?: number;
  depthConfig?: string;
  anchorTarget?: string;
  anchorPosition?: "before" | "after";
  order?: number;
}

export interface InjectionHistoryMessage {
  role: string;
  sourceType?: string;
  /** Original node role, retained when tool results are presented as User. */
  _historyRole?: string;
  metadata?: {
    toolCallsRequested?: readonly { requestId?: string }[];
    toolCall?: { requestId: string };
    toolCalls?: readonly { requestId: string }[];
  };
}

export interface HistoryInjectionDiagnostic {
  sourceId: string;
  target?: string;
  reason: "target_missing" | "tool_chain_relocated" | "tool_results_pending";
  boundary?: number;
  resolvedBoundary?: number;
}

function advancedDepths(config: string, length: number): number[] {
  const depths = new Set<number>();
  for (const segment of config.split(",").map((s) => s.trim())) {
    const loop = segment.match(/^(\d+)[~:](\d+)$/);
    if (loop) {
      const start = Number(loop[1]);
      const step = Number(loop[2]);
      if (step > 0) {
        for (let depth = start; depth <= length; depth += step)
          depths.add(depth);
      } else if (start <= length) depths.add(start);
    } else if (/^\d+$/.test(segment) && Number(segment) <= length) {
      depths.add(Number(segment));
    }
  }
  return [...depths];
}

/** Resolve every injection against the same immutable history before inserting any. */
export function assembleHistoryInjections<
  T extends InjectionHistoryMessage,
  I extends { message: { id: string }; strategy: HistoryInjectionStrategy },
>(
  history: readonly T[],
  injections: readonly I[],
  materialize: (injection: I) => T,
  onDiagnostic?: (diagnostic: HistoryInjectionDiagnostic) => void
): T[] {
  const role = (message: T) => message._historyRole ?? message.role;
  const sessions = history.flatMap((message, index) =>
    message.sourceType === "session_history" ? [{ message, index }] : []
  );
  // Calls and their contiguous results form a protected interval, including results
  // normalized to User. Even calls with no explicit metadata are protected by Tool.
  const chains: { start: number; end: number; pending: boolean }[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const current = sessions[i];
    if (role(current.message) !== "assistant") continue;
    let end = i;
    while (
      end + 1 < sessions.length &&
      role(sessions[end + 1].message) === "tool"
    )
      end++;
    const requested = current.message.metadata?.toolCallsRequested ?? [];
    const hasCall = requested.length > 0;
    const resultIds = new Set<string>();
    for (let result = i + 1; result <= end; result++) {
      const metadata = sessions[result].message.metadata;
      if (metadata?.toolCall) resultIds.add(metadata.toolCall.requestId);
      for (const call of metadata?.toolCalls ?? [])
        resultIds.add(call.requestId);
    }
    const pending =
      hasCall &&
      (end === i ||
        (resultIds.size > 0
          ? requested.some(
              (call) => call.requestId && !resultIds.has(call.requestId)
            )
          : requested.length > end - i));
    if (end > i || hasCall) {
      chains.push({
        start: current.index,
        end: sessions[end].index + 1,
        pending,
      });
    }
  }

  const groups = new Map<number, { injection: I; ordinal: number }[]>();
  injections.forEach((injection, ordinal) => {
    const strategy = injection.strategy;
    const dynamic =
      isDynamicMessageAnchor(strategy.anchorTarget) &&
      (strategy.type === "anchor" ||
        (!strategy.type &&
          strategy.depth === undefined &&
          !strategy.depthConfig));
    let boundaries: number[];
    if (dynamic) {
      const target = DYNAMIC_MESSAGE_ANCHORS.find(
        (a) => a.id === strategy.anchorTarget
      )!;
      const match = [...sessions]
        .reverse()
        .find(
          ({ message }) =>
            target.role === undefined || role(message) === target.role
        );
      if (!match) {
        onDiagnostic?.({
          sourceId: injection.message.id,
          target: strategy.anchorTarget,
          reason: "target_missing",
        });
        return;
      }
      boundaries = [
        match.index + (strategy.anchorPosition === "before" ? 0 : 1),
      ];
    } else if (
      strategy.type === "advanced_depth" ||
      (!strategy.type && strategy.depthConfig)
    ) {
      boundaries = advancedDepths(
        strategy.depthConfig ?? "",
        history.length
      ).map((d) => history.length - d);
    } else if (
      strategy.depth !== undefined &&
      Number.isFinite(strategy.depth) &&
      strategy.depth >= 0
    ) {
      boundaries = [Math.max(0, history.length - Math.floor(strategy.depth))];
    } else return;

    const resolved = new Set<number>();
    for (const boundary of boundaries) {
      let safe = boundary;
      const chain = chains.find(
        (c) =>
          c.start < boundary &&
          (boundary < c.end || (c.pending && boundary === c.end))
      );
      if (chain) {
        // A before-target injection moves before the whole chain; all other
        // placements move after its results. Pending results have no safe tail.
        if (dynamic && strategy.anchorPosition === "before") safe = chain.start;
        else if (chain.pending) {
          onDiagnostic?.({
            sourceId: injection.message.id,
            target: strategy.anchorTarget,
            reason: "tool_results_pending",
            boundary,
          });
          continue;
        } else safe = chain.end;
        onDiagnostic?.({
          sourceId: injection.message.id,
          target: strategy.anchorTarget,
          reason: "tool_chain_relocated",
          boundary,
          resolvedBoundary: safe,
        });
      }
      resolved.add(safe);
    }
    for (const boundary of resolved) {
      const group = groups.get(boundary) ?? [];
      group.push({ injection, ordinal });
      groups.set(boundary, group);
    }
  });

  const result: T[] = [];
  for (let boundary = 0; boundary <= history.length; boundary++) {
    const group = groups.get(boundary) ?? [];
    group.sort(
      (a, b) =>
        (a.injection.strategy.order ?? 100) -
          (b.injection.strategy.order ?? 100) || a.ordinal - b.ordinal
    );
    result.push(...group.map(({ injection }) => materialize(injection)));
    if (boundary < history.length) result.push(history[boundary]);
  }
  return result;
}
