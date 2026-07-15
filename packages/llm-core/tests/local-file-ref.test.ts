import { describe, expect, it } from "vitest";
import {
  containsLocalFileRef,
  isLocalFileRef,
  type WireJsonValue,
} from "../src";

describe("LocalFileRef detection", () => {
  it("finds explicitly tagged nested file references", () => {
    const value: WireJsonValue = {
      messages: [
        {
          content: {
            kind: "local-file-ref",
            path: "C:/media/input.png",
            contentType: "image/png",
          },
        },
      ],
    };

    expect(containsLocalFileRef(value)).toBe(true);
  });

  it("does not treat ordinary or malformed provider JSON as a file reference", () => {
    expect(isLocalFileRef({ kind: "image", path: "remote-id" })).toBe(false);
    expect(
      isLocalFileRef({
        kind: "local-file-ref",
        path: "C:/file",
        providerField: true,
      })
    ).toBe(false);
    expect(containsLocalFileRef({ kind: "image", path: "remote-id" })).toBe(
      false
    );
  });
});
