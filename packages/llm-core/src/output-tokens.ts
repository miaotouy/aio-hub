/** Default budget for general chat and long-form generation. */
export const DEFAULT_MAX_OUTPUT_TOKENS = 65_536;
/** Editor range for models whose output limit is unknown; never a wire limit. */
export const OUTPUT_TOKEN_INPUT_MAX = 1_000_000;

/** Preserve omitted budgets and explicit user budgets, bounded by model metadata. */
export function limitOutputTokens(
  requested: number | undefined,
  modelOutputLimit: number | undefined
): number | undefined {
  if (requested === undefined) return undefined;
  return modelOutputLimit !== undefined && modelOutputLimit > 0
    ? Math.min(requested, modelOutputLimit)
    : requested;
}
