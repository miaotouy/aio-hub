import type { Variable } from "../types";

export type TemplateVariableValue = string | boolean;

const PLACEHOLDER_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g;

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function renderTextTemplate(
  template: string,
  variables: Record<string, TemplateVariableValue>
): string {
  if (!template) return "";

  return template.replace(PLACEHOLDER_PATTERN, (match, key: string) => {
    if (!(key in variables)) return match;
    return String(variables[key]);
  });
}

export function renderHeaderTemplates(
  headers: Record<string, string>,
  variables: Record<string, TemplateVariableValue>
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(headers)
      .map(([key, value]) => [
        renderTextTemplate(key, variables).trim(),
        renderTextTemplate(value, variables),
      ])
      .filter(([key]) => key.length > 0)
  );
}

export function renderJsonTemplate(
  template: string,
  variables: Record<string, TemplateVariableValue>
): string {
  if (!template) return "";

  let rendered = template;

  Object.entries(variables).forEach(([key, value]) => {
    const escapedKey = escapeRegExp(key);
    const quotedPlaceholder = new RegExp(
      `"\\s*\\{\\{\\s*${escapedKey}\\s*\\}\\}\\s*"`,
      "g"
    );

    rendered = rendered.replace(
      quotedPlaceholder,
      JSON.stringify(coerceJsonValue(value))
    );
  });

  return renderTextTemplate(rendered, variables);
}

export function extractPlaceholders(value: string): string[] {
  if (!value) return [];

  const placeholders = new Set<string>();
  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    placeholders.add(match[1]);
  }

  return [...placeholders];
}

export function findMissingRequiredVariables(
  definitions: Variable[],
  variables: Record<string, TemplateVariableValue>
): Variable[] {
  return definitions.filter((variable) => {
    if (!variable.required) return false;
    const value = variables[variable.key];
    return value === undefined || value === "";
  });
}

export function hasRequestBody(method: string): boolean {
  return !["GET", "HEAD"].includes(method);
}

function coerceJsonValue(value: TemplateVariableValue): unknown {
  if (typeof value === "boolean") return value;

  const trimmedValue = value.trim();
  if (trimmedValue === "true") return true;
  if (trimmedValue === "false") return false;
  if (trimmedValue === "null") return null;

  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(trimmedValue)) {
    return Number(trimmedValue);
  }

  return value;
}
