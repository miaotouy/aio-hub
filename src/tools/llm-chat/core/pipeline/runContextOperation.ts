// Copyright 2026 miaotouy(Github@miaotouy)
// SPDX-License-Identifier: Apache-2.0

/** Guard host service dispatch and discard results received after cancellation. */
export async function runContextOperation<T>(
  context: { readonly signal?: AbortSignal },
  operation: () => T | Promise<T>
): Promise<T> {
  context.signal?.throwIfAborted();
  try {
    const result = await operation();
    context.signal?.throwIfAborted();
    return result;
  } catch (error) {
    context.signal?.throwIfAborted();
    throw error;
  }
}
