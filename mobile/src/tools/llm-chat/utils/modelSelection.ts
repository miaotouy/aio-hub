export function parseSelectedModelValue(value: string): [string, string] {
  const delimiterIndex = value.indexOf(":");
  if (delimiterIndex < 0) return ["", ""];
  return [
    value.slice(0, delimiterIndex),
    value.slice(delimiterIndex + 1),
  ];
}
