import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/api/core", () => ({ invoke: mocks.invoke }));
vi.mock("./time", () => ({
  formatDateTime: (value: Date | string | number, pattern: string) => {
    const date = value instanceof Date ? value : new Date(value);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hour = String(date.getUTCHours()).padStart(2, "0");
    const minute = String(date.getUTCMinutes()).padStart(2, "0");
    const second = String(date.getUTCSeconds()).padStart(2, "0");
    const millisecond = String(date.getUTCMilliseconds()).padStart(3, "0");

    if (pattern === "yyyy-MM-dd") return `${year}-${month}-${day}`;
    if (pattern === "HH-mm-ss-SSS") {
      return `${hour}-${minute}-${second}-${millisecond}`;
    }
    return `${year}-${month}-${day} ${hour}:${minute}:${second}.${millisecond}`;
  },
}));

import { Logger } from "./logger";

const firstDay = new Date("2026-08-23T23:59:59.999Z");
const secondDay = new Date("2026-08-24T00:00:00.000Z");

function createLogger(dates: Date[] = [firstDay]): Logger {
  let dateIndex = 0;
  const logger = new Logger({
    now: () => dates[Math.min(dateIndex++, dates.length - 1)],
  });
  logger.setLogToConsole(false);
  return logger;
}

describe("Logger file persistence", () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.invoke.mockImplementation(async (command: string, args?: any) => {
      if (command === "append_app_log") {
        return {
          path: `/logs/app-${args.date}.log`,
          rotatedFileName: null,
        };
      }
      return undefined;
    });
  });

  it("serializes persistence requests and keeps the second write queued", async () => {
    let releaseFirstWrite: (() => void) | undefined;
    const firstWrite = new Promise<void>((resolve) => {
      releaseFirstWrite = resolve;
    });
    let appendCalls = 0;
    mocks.invoke.mockImplementation(async (command: string, args?: any) => {
      if (command !== "append_app_log") return undefined;
      appendCalls += 1;
      if (appendCalls === 1) {
        await firstWrite;
      }
      return {
        path: `/logs/app-${args.date}.log`,
        rotatedFileName: null,
      };
    });

    const logger = createLogger();
    logger.info("test", "first");
    logger.info("test", "second");

    await Promise.resolve();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    releaseFirstWrite?.();
    await logger.flush();

    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    expect(mocks.invoke.mock.calls.map(([command]) => command)).toEqual([
      "append_app_log",
      "append_app_log",
    ]);
  });

  it("uses each entry's date for the active log file and millisecond archive name", async () => {
    const logger = createLogger([firstDay, secondDay]);
    logger.info("test", "before midnight");
    logger.info("test", "after midnight");

    await logger.flush();

    expect(mocks.invoke).toHaveBeenNthCalledWith(
      1,
      "append_app_log",
      expect.objectContaining({
        date: "2026-08-23",
        archiveTime: "23-59-59-999",
      })
    );
    expect(mocks.invoke).toHaveBeenNthCalledWith(
      2,
      "append_app_log",
      expect.objectContaining({
        date: "2026-08-24",
        archiveTime: "00-00-00-000",
      })
    );
  });

  it("requests durable synchronization for error logs", async () => {
    const logger = createLogger();
    logger.error("test", "failed", new Error("boom"));

    await logger.flush();

    expect(mocks.invoke).toHaveBeenCalledWith(
      "append_app_log",
      expect.objectContaining({ syncData: true })
    );
  });
});
