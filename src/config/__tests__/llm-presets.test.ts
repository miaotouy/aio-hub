import { describe, expect, it } from "vitest";
import { getPresetByName } from "../llm-presets";

describe("TypeSafe preset", () => {
  it("creates a decision-only Jev channel with official endpoints and links", () => {
    const preset = getPresetByName("TypeSafe AI");

    expect(preset).toMatchObject({
      type: "typesafe",
      defaultBaseUrl: "https://api.typesafe.ai",
      logoUrl: "/model-icons/typesafe.png",
      defaultModels: [
        expect.objectContaining({
          id: "jev-latest",
          provider: "typesafe",
          capabilities: { decision: true },
          routing: {
            supportedEndpointTypes: ["typesafe-system-one"],
          },
        }),
      ],
    });
    expect(preset?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: "https://console.typesafe.ai" }),
        expect.objectContaining({ url: "https://docs.typesafe.ai" }),
      ])
    );
  });
});
