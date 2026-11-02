/** 从已有版本标签建议下一版本；桌面 v、无前缀、移动端前缀分别处理。 */
export function suggestNextTag(names: readonly string[]): string | null {
  const versions = names.flatMap((name) => {
    const match =
      /^(v|mv|miv)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.exec(
        name
      );
    if (!match) return [];
    const pre = match[5]?.split(".") ?? [];
    if (pre.some((part) => /^0\d+$/.test(part))) return [];
    return [
      { prefix: match[1] ?? "", core: match.slice(2, 5).map(BigInt), pre },
    ];
  });
  // 一个仓库可能同时发布桌面和移动端；优先沿用桌面标签序列。
  const prefix = ["v", "", "mv", "miv"].find((value) =>
    versions.some((version) => version.prefix === value)
  );
  if (prefix === undefined) return null;
  const compareIdentifier = (a: string, b: string): number => {
    const an = /^\d+$/.test(a),
      bn = /^\d+$/.test(b);
    if (an && bn)
      return BigInt(a) > BigInt(b) ? 1 : BigInt(a) < BigInt(b) ? -1 : 0;
    if (an !== bn) return an ? -1 : 1;
    return a > b ? 1 : a < b ? -1 : 0;
  };
  const sequence = versions
    .filter((version) => version.prefix === prefix)
    .sort((a, b) => {
      for (let i = 0; i < 3; i++) {
        if (a.core[i] !== b.core[i]) return a.core[i] > b.core[i] ? 1 : -1;
      }
      if (!a.pre.length || !b.pre.length)
        return Number(!a.pre.length) - Number(!b.pre.length);
      for (let i = 0; i < Math.min(a.pre.length, b.pre.length); i++) {
        const order = compareIdentifier(a.pre[i], b.pre[i]);
        if (order) return order;
      }
      return a.pre.length - b.pre.length;
    });
  const latest = sequence[sequence.length - 1];
  const core = [...latest.core];
  const pre = [...latest.pre];
  if (pre.length) {
    const last = pre.length - 1;
    if (/^\d+$/.test(pre[last])) pre[last] = String(BigInt(pre[last]) + 1n);
    else pre.push("1");
  } else core[2] += 1n;
  return `${prefix}${core.join(".")}${pre.length ? `-${pre.join(".")}` : ""}`;
}
