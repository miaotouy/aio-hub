// Copyright 2025-2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

import { parseArgs } from "node:util";
import { resolve } from "node:path";

interface Snapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: (string[] | string)[];
      edge_fields: string[];
      edge_types: (string[] | string)[];
    };
    node_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

/** Self-size comparison and immediate retainers, not a dominator/retained-size calculation. */
export function summarizeHeap(snapshot: Snapshot) {
  const { meta } = snapshot.snapshot;
  const nf = Object.fromEntries(meta.node_fields.map((x, i) => [x, i]));
  const ef = Object.fromEntries(meta.edge_fields.map((x, i) => [x, i]));
  const width = meta.node_fields.length;
  const edgeWidth = meta.edge_fields.length;
  const nodeTypes = meta.node_types[nf.type] as string[];
  const edgeTypes = meta.edge_types[ef.type] as string[];
  for (const field of ["type", "name", "id", "self_size", "edge_count"])
    if (!(field in nf)) throw new Error("Missing node field: " + field);
  for (const field of ["type", "name_or_index", "to_node"])
    if (!(field in ef)) throw new Error("Missing edge field: " + field);
  if (snapshot.nodes.length !== snapshot.snapshot.node_count * width)
    throw new Error("Invalid snapshot node count");
  function node(index: number) {
    const offset = index * width;
    return {
      index,
      id: snapshot.nodes[offset + nf.id],
      type: nodeTypes[snapshot.nodes[offset + nf.type]],
      name: snapshot.strings[snapshot.nodes[offset + nf.name]].slice(0, 180),
      bytes: snapshot.nodes[offset + nf.self_size],
      edges: snapshot.nodes[offset + nf.edge_count],
    };
  }
  const groups = new Map<string, { count: number; bytes: number }>();
  const largeArrays: ReturnType<typeof node>[] = [];
  let totalSelfBytes = 0;
  for (let index = 0; index < snapshot.snapshot.node_count; index++) {
    const item = node(index);
    const rawName = snapshot.strings[snapshot.nodes[index * width + nf.name]];
    const key =
      item.type + ":" + (item.type.includes("string") ? "(all)" : rawName);
    const group = groups.get(key) ?? { count: 0, bytes: 0 };
    group.count++;
    group.bytes += item.bytes;
    totalSelfBytes += item.bytes;
    groups.set(key, group);
    if (item.type === "array" && item.bytes >= 1048576) largeArrays.push(item);
  }
  function parents(targets: Set<number>) {
    const found: {
      from: ReturnType<typeof node>;
      type: string;
      name: string | number;
      to: number;
    }[] = [];
    let offset = 0;
    for (let index = 0; index < snapshot.snapshot.node_count; index++) {
      const count = snapshot.nodes[index * width + nf.edge_count];
      for (let j = 0; j < count; j++, offset += edgeWidth) {
        const to = snapshot.edges[offset + ef.to_node] / width;
        if (!targets.has(to)) continue;
        const type = edgeTypes[snapshot.edges[offset + ef.type]];
        const name = snapshot.edges[offset + ef.name_or_index];
        found.push({
          from: node(index),
          type,
          name:
            type === "element" || type === "hidden"
              ? name
              : snapshot.strings[name].slice(0, 180),
          to,
        });
      }
    }
    return found;
  }
  const arrayParents = parents(new Set(largeArrays.map((x) => x.index)));
  // Weak edges are retained in the report but do not establish strong ownership.
  const ownerParents = parents(
    new Set(
      arrayParents.filter((x) => x.type !== "weak").map((x) => x.from.index)
    )
  );
  return {
    totalSelfBytes,
    groups: Array.from(groups, ([key, value]) => ({ key, ...value })),
    largeArrays: largeArrays.sort((a, b) => b.bytes - a.bytes),
    arrayParents,
    ownerParents,
  };
}

if (import.meta.main) {
  const { values } = parseArgs({
    args: Bun.argv.slice(2).filter((x) => x !== "--"),
    options: {
      before: { type: "string" },
      after: { type: "string" },
      out: { type: "string" },
    },
    strict: true,
  });
  if (!values.before || !values.after || !values.out)
    throw new Error("Use --before <snapshot> --after <snapshot> --out <json>");
  // Summarize sequentially so raw snapshots can be collected between reads.
  const before = summarizeHeap(await Bun.file(values.before).json());
  const after = summarizeHeap(await Bun.file(values.after).json());
  const oldGroups = new Map(before.groups.map((x) => [x.key, x]));
  const newGroups = new Map(after.groups.map((x) => [x.key, x]));
  const deltas = [...new Set([...oldGroups.keys(), ...newGroups.keys()])]
    .map((key) => ({
      key,
      count:
        (newGroups.get(key)?.count ?? 0) - (oldGroups.get(key)?.count ?? 0),
      bytes:
        (newGroups.get(key)?.bytes ?? 0) - (oldGroups.get(key)?.bytes ?? 0),
    }))
    .sort((a, b) => b.bytes - a.bytes);
  const report = {
    before: resolve(values.before),
    after: resolve(values.after),
    metric:
      "snapshot self_size sum including native nodes; distinct from Runtime.getHeapUsage",
    totalSelfBytes: {
      before: before.totalSelfBytes,
      after: after.totalSelfBytes,
    },
    largestIncreases: deltas.slice(0, 30),
    largestDecreases: deltas.slice(-10).reverse(),
    beforeArrays: before.largeArrays,
    afterArrays: after.largeArrays,
    beforeArrayParents: before.arrayParents,
    afterArrayParents: after.arrayParents,
    afterOwnerParents: after.ownerParents,
  };
  await Bun.write(values.out, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify(
      {
        out: resolve(values.out),
        deltaSelfBytes: after.totalSelfBytes - before.totalSelfBytes,
        largestIncreases: deltas.slice(0, 5),
      },
      null,
      2
    )
  );
}
