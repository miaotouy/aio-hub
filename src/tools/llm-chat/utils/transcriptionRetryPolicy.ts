/**
 * Determines whether send-time preparation may enqueue a transcription task.
 *
 * Failed tasks are intentionally excluded: historical context reconstruction
 * happens for every new reply, so treating `error` like `none` would retry an
 * unavailable transcription model indefinitely. Manual retry and force retry
 * actions call `addTask` directly and remain available to the user.
 */
export function shouldAutoCreateTranscriptionTask(status: string): boolean {
  return status === "none";
}

/**
 * Prevents a failed transcription fallback from sending an unsupported binary
 * attachment to the chat model. If the model needs transcription, the source
 * media cannot be represented safely after a terminal transcription failure.
 */
export function shouldUseFailedTranscriptionFallback(
  status: string,
  requiresTranscription: boolean
): boolean {
  return status === "error" && requiresTranscription;
}
