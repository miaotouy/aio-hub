// Copyright 2025-2026 miaotouy(Github@miaotouy)
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, it } from "vitest";
import {
  getProfileStorageSubdirectory,
  resolveProfileAvatarPath,
} from "../profileAssetUtils";

describe("user profile avatar path", () => {
  it("uses the decoupled profile storage directory", () => {
    expect(getProfileStorageSubdirectory("profile-1")).toBe(
      "user-profile-manager/user-profiles/profile-1"
    );
    expect(
      resolveProfileAvatarPath({ id: "profile-1", icon: "avatar.png" })
    ).toBe("appdata://user-profile-manager/user-profiles/profile-1/avatar.png");
  });

  it("redirects the legacy llm-chat protocol path", () => {
    expect(
      resolveProfileAvatarPath({
        id: "profile-1",
        icon: "appdata://llm-chat/user-profiles/profile-1/avatar.png",
      })
    ).toBe("appdata://user-profile-manager/user-profiles/profile-1/avatar.png");
  });

  it("preserves non-file avatar values", () => {
    expect(resolveProfileAvatarPath({ id: "profile-1", icon: "👤" })).toBe(
      "👤"
    );
    expect(
      resolveProfileAvatarPath({
        id: "profile-1",
        icon: "https://example.com/avatar.png",
      })
    ).toBe("https://example.com/avatar.png");
  });
});
