import type { Subprocess } from "bun";

export interface CommandResult {
  command: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface CommandOptions {
  cwd?: string;
  env?: Record<string, string | undefined>;
  timeoutMs?: number;
  allowFailure?: boolean;
}

export type CommandRunner = (
  command: string[],
  options?: CommandOptions
) => Promise<CommandResult>;

export class FatalWaitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FatalWaitError";
  }
}

export class CommandTimeoutError extends Error {
  constructor(
    readonly command: string[],
    readonly timeoutMs: number
  ) {
    super(`Command timed out after ${timeoutMs}ms: ${printable(command)}`);
    this.name = "CommandTimeoutError";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function printable(command: string[]): string {
  return command
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

async function valueWithin<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function captureStream(
  stream: ReadableStream<Uint8Array> | number | undefined
): {
  result: Promise<string>;
  cancel: () => Promise<void>;
} {
  if (!stream || typeof stream === "number") {
    return { result: Promise.resolve(""), cancel: async () => undefined };
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const result = (async () => {
    let output = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) return output + decoder.decode();
      output += decoder.decode(value, { stream: true });
    }
  })();
  return {
    result,
    cancel: async () => {
      await reader.cancel().catch(() => undefined);
    },
  };
}

async function exitedWithin(
  subprocess: Subprocess,
  timeoutMs: number
): Promise<number | null> {
  return valueWithin(subprocess.exited, timeoutMs);
}

export async function waitForSubprocessExit(
  subprocess: Subprocess,
  timeoutMs: number
): Promise<boolean> {
  return (await exitedWithin(subprocess, timeoutMs)) !== null;
}

export function trackSubprocessExit(
  subprocess: Subprocess
): () => number | null {
  let exitCode = subprocess.exitCode;
  void subprocess.exited.then((code) => {
    exitCode = code;
  });
  return () => exitCode;
}

export async function terminateSubprocess(
  subprocess: Subprocess,
  options: { gracefulTimeoutMs?: number; forceTimeoutMs?: number } = {}
): Promise<boolean> {
  try {
    subprocess.kill();
  } catch {
    return waitForSubprocessExit(
      subprocess,
      options.gracefulTimeoutMs ?? 2_000
    );
  }
  if (
    await waitForSubprocessExit(subprocess, options.gracefulTimeoutMs ?? 2_000)
  ) {
    return true;
  }
  try {
    subprocess.kill(9);
  } catch {
    return false;
  }
  return waitForSubprocessExit(subprocess, options.forceTimeoutMs ?? 2_000);
}

export const runCommand: CommandRunner = async (command, options = {}) => {
  const subprocess = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...Bun.env, ...options.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const stdout = captureStream(subprocess.stdout);
  const stderr = captureStream(subprocess.stderr);
  const output = Promise.all([stdout.result, stderr.result]);
  const cancelOutput = async () => {
    await valueWithin(
      Promise.allSettled([stdout.cancel(), stderr.cancel()]),
      1_000
    );
    await valueWithin(Promise.allSettled([output]), 1_000);
  };
  const timeoutMs = options.timeoutMs ?? 60_000;
  const exitCode = await exitedWithin(subprocess, timeoutMs);
  if (exitCode === null) {
    await terminateSubprocess(subprocess);
    await cancelOutput();
    throw new CommandTimeoutError(command, timeoutMs);
  }
  const captured = await valueWithin(output, 2_000);
  if (captured === null) {
    await cancelOutput();
    throw new Error(
      `Command exited but its output streams did not close: ${printable(command)}`
    );
  }
  const [stdoutText, stderrText] = captured;
  const result = { command, exitCode, stdout: stdoutText, stderr: stderrText };
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `Command failed (${exitCode}): ${printable(command)}\n${stderrText.trim()}`
    );
  }
  return result;
};

export function startProcess(
  command: string[],
  options: Omit<CommandOptions, "timeoutMs" | "allowFailure"> & {
    stdout?: "pipe" | "inherit";
    stderr?: "pipe" | "inherit";
  } = {}
): Subprocess {
  return Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...Bun.env, ...options.env },
    stdin: "ignore",
    stdout: options.stdout ?? "pipe",
    stderr: options.stderr ?? "pipe",
    windowsHide: true,
  });
}

export async function withTimeout<T>(
  operation: Promise<T>,
  options: { timeoutMs: number; description: string }
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error(
            `Timed out after ${options.timeoutMs}ms: ${options.description}`
          )
        ),
      options.timeoutMs
    );
  });
  return Promise.race([operation, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export async function waitUntil<T>(
  probe: () => Promise<T | null>,
  options: { timeoutMs: number; intervalMs?: number; description: string }
): Promise<T> {
  const deadline = Date.now() + options.timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await probe();
      if (value !== null) return value;
    } catch (error) {
      if (error instanceof FatalWaitError) throw error;
      lastError = error;
    }
    await sleep(options.intervalMs ?? 500);
  }
  const suffix =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${options.description}.${suffix}`);
}
