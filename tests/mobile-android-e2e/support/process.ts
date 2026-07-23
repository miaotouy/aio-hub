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

function printable(command: string[]): string {
  return command
    .map((part) => (/\s/.test(part) ? JSON.stringify(part) : part))
    .join(" ");
}

export const runCommand: CommandRunner = async (command, options = {}) => {
  const process = Bun.spawn(command, {
    cwd: options.cwd,
    env: { ...Bun.env, ...options.env },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    windowsHide: true,
  });
  const timeout = setTimeout(
    () => process.kill(),
    options.timeoutMs ?? 60_000
  );
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(process.stdout).text(),
    new Response(process.stderr).text(),
    process.exited,
  ]).finally(() => clearTimeout(timeout));
  const result = { command, exitCode, stdout, stderr };
  if (exitCode !== 0 && !options.allowFailure) {
    throw new Error(
      `Command failed (${exitCode}): ${printable(command)}\n${stderr.trim()}`
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
      lastError = error;
    }
    await Bun.sleep(options.intervalMs ?? 500);
  }
  const suffix =
    lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${options.description}.${suffix}`);
}
