export class DistilleryError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
    public readonly retryable = false
  ) {
    super(message);
    this.name = "DistilleryError";
  }
}

export class BrowserUpgradeRequired extends DistilleryError {
  constructor(reason: string) {
    super("BROWSER_REQUIRED", reason);
  }
}
